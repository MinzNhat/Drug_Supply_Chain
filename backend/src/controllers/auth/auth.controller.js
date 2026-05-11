import bcrypt from "bcryptjs";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "../../config/index.js";
import { User } from "../../models/user/user.model.js";
import { asyncHandler } from "../../utils/async-handler/async-handler.js";
import { HttpException } from "../../utils/http-exception/http-exception.js";
import { isMspIdForRole, normalizeMspId } from "../../utils/msp/msp.js";
import { normalizeDistributorUnitId } from "../../utils/distributor/distributor-unit-id.js";
import { auditLog } from "../../utils/logger/audit-logger.js";
import { logger } from "../../utils/logger/logger.js";
import { NodeCreationService } from "../../services/network/node-creation.service.js";

/**
 * Username format accepted by register endpoint.
 */
const usernameRegex = /^[a-zA-Z0-9_]{3,32}$/;

/**
 * Password policy: at least one lowercase, one uppercase, one digit.
 */
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,64}$/;


/**
 * Request schema for account registration.
 */
const registerSchema = z
    .object({
        username: z.string().regex(usernameRegex, "Tên tài khoản từ 3-32 ký tự, chỉ gồm chữ, số và dấu gạch dưới"),
        password: z.string().regex(passwordRegex, "Mật khẩu tối thiểu 8 ký tự, bao gồm ít nhất 1 chữ hoa, 1 chữ thường và 1 chữ số"),
        role: z.enum(["Manufacturer", "Distributor", "Regulator"]),
        mspId: z.string().min(1, "Mã MSP là bắt buộc"),
        distributorUnitId: z.string().optional(),
        businessName: z.string().min(1, "Tên doanh nghiệp là bắt buộc"),
        address: z.string().optional(),
        taxId: z.string().optional(),
        phoneNumber: z.string().optional(),
        regulatorLevel: z.enum(["HIGH", "LOW"]).optional(),
        province: z.string().min(1, "Tỉnh/Thành phố là bắt buộc"),
    })
    .superRefine(async (data, ctx) => {
        const normalizedMspId = normalizeMspId(data.mspId);
        if (!normalizedMspId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Unsupported mspId alias",
                path: ["mspId"],
            });
            return;
        }

        if (!isMspIdForRole(data.role, normalizedMspId)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "mspId must match role",
                path: ["mspId"],
            });
        }

        const normalizedDistributorUnitId = normalizeDistributorUnitId(
            data.distributorUnitId,
        );
        if (data.distributorUnitId && !normalizedDistributorUnitId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Invalid distributorUnitId format",
                path: ["distributorUnitId"],
            });
        }

        if (data.role !== "Distributor" && normalizedDistributorUnitId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message:
                    "distributorUnitId is only supported for Distributor role",
                path: ["distributorUnitId"],
            });
        }

        if (
            data.role === "Distributor" &&
            config.fabric.distributorIdentityBridge.enabled &&
            config.fabric.distributorIdentityBridge.requireUnitForDistributor &&
            !normalizedDistributorUnitId
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message:
                    "distributorUnitId is required for Distributor when identity bridge is enabled",
                path: ["distributorUnitId"],
            });
        }

        // Check regional restriction for regulator (max 1 LOW and 1 HIGH per province)
        if (data.role === "Regulator" && data.province) {
            const existingRegulator = await User.findOne({
                role: "Regulator",
                province: data.province,
                regulatorLevel: data.regulatorLevel || "LOW",
            });
            if (existingRegulator) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `One ${data.province} can only have one regulator of level ${data.regulatorLevel || "LOW"} (already has one)`,
                    path: ["province"],
                });
            }
        }
    });

/**
 * Request schema for account login.
 */
const loginSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
});

/**
 * Build the auth controller with register, login, and refresh handlers.
 *
 * @returns {{ register: import("express").RequestHandler, login: import("express").RequestHandler, refresh: import("express").RequestHandler }} Auth handlers.
 */
export const createAuthController = () => {
    /**
     * Register a new user and return the created profile payload.
     */
    const register = asyncHandler(async (req, res) => {
        const parsed = await registerSchema.safeParseAsync(req.body);
        if (!parsed.success) {
            const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
            throw new HttpException(400, firstError || "Thông tin đăng ký không hợp lệ", {
                errors: parsed.error.flatten(),
            });
        }

        const normalizedMspId = normalizeMspId(parsed.data.mspId);
        if (!normalizedMspId) {
            throw new HttpException(400, "Invalid request body", {
                errors: {
                    fieldErrors: {
                        mspId: ["Unsupported mspId alias"],
                    },
                },
            });
        }

        const existing = await User.findOne({
            username: parsed.data.username,
        }).lean();
        if (existing) {
            throw new HttpException(409, "Tên tài khoản đã tồn tại trên hệ thống");
        }

        const creator = req.user; // If authenticated
        if (parsed.data.role === "Regulator") {
            // High level check: Only Admin or existing HIGH regulators can create regulators
            if (!creator || (creator.role !== "Admin" && (creator.role !== "Regulator" || creator.regulatorLevel !== "HIGH"))) {
                const highRegulatorExists = await User.findOne({ role: "Regulator", regulatorLevel: "HIGH" });
                if (highRegulatorExists) {
                    throw new HttpException(403, "Chỉ Quản trị viên hoặc Cơ quan quản lý cấp cao mới có quyền tạo Cơ quan quản lý");
                }
            }

            // A HIGH regulator cannot create another HIGH regulator
            if (creator && creator.role === "Regulator" && creator.regulatorLevel === "HIGH" && parsed.data.regulatorLevel === "HIGH") {
                throw new HttpException(403, "Cơ quan quản lý cấp cao không được phép tạo thêm Cơ quan quản lý cấp cao khác");
            }

            // A LOW regulator cannot create any regulator
            if (creator && creator.role === "Regulator" && creator.regulatorLevel === "LOW") {
                throw new HttpException(403, "Cơ quan quản lý cấp tỉnh không có quyền tạo Cơ quan quản lý");
            }
        }

        if (parsed.data.role === "Manufacturer" || parsed.data.role === "Distributor") {
            if (creator && creator.role === "Regulator" && creator.regulatorLevel === "LOW") {
                // Provincial regulator (LOW) can only create businesses in their own province
                if (parsed.data.province !== creator.province) {
                    throw new HttpException(403, `Cơ quan quản lý tại ${creator.province} chỉ được phép tạo doanh nghiệp trong địa bàn quản lý`);
                }
                parsed.data.status = "PENDING";
            }
        }

        const passwordHash = await bcrypt.hash(parsed.data.password, 12);
        
        // Use the MongoDB ID directly as the blockchain identity fields
        const user = new User({
            username: parsed.data.username,
            password: passwordHash,
            role: parsed.data.role,
            mspId: normalizedMspId,
            businessName: parsed.data.businessName,
            address: parsed.data.address,
            taxId: parsed.data.taxId,
            phoneNumber: parsed.data.phoneNumber,
            regulatorLevel: parsed.data.regulatorLevel || "LOW",
            province: parsed.data.province,
            status: parsed.data.status || "APPROVED",
        });

        // Use EXACT MongoDB ID for Distributor Unit Identification
        if (user.role === "Distributor") {
            user.distributorUnitId = user._id.toString();
        }

        await user.save();

        await auditLog({
            level: "info",
            category: "AUTH",
            action: "CREATE_USER",
            message: `User ${user.username} (${user.role}) was created by ${creator ? creator.username : "System"}`,
            details: { targetUserId: user._id, targetUsername: user.username, role: user.role },
            req
        });

        return res.status(201).json({
            success: true,
            data: {
                id: user._id.toString(),
                username: user.username,
                role: user.role,
                mspId: user.mspId,
                distributorUnitId: user.distributorUnitId || "",
                businessName: user.businessName,
                regulatorLevel: user.regulatorLevel,
                province: user.province,
                status: user.status,
            },
        });
    });

    /**
     * Authenticate user credentials and issue JWT access token.
     */
    const login = asyncHandler(async (req, res) => {
        const parsed = loginSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new HttpException(400, "Invalid request body", {
                errors: parsed.error.flatten(),
            });
        }

        const user = await User.findOne({ username: parsed.data.username });
        if (!user) {
            throw new HttpException(401, "Invalid username or password");
        }

        const isValid = await bcrypt.compare(
            parsed.data.password,
            user.password,
        );
        if (!isValid) {
            throw new HttpException(401, "Invalid username or password");
        }

        const token = jwt.sign(
            {
                userId: user._id.toString(),
                username: user.username,
                role: user.role,
                mspId: user.mspId,
                distributorUnitId: user.distributorUnitId || "",
                regulatorLevel: user.regulatorLevel,
                province: user.province,
            },
            config.jwtSecret,
            { expiresIn: config.jwtExpiresIn },
        );

        return res.status(200).json({
            success: true,
            data: {
                token,
                user: {
                    id: user._id.toString(),
                    username: user.username,
                    role: user.role,
                    mspId: user.mspId,
                    distributorUnitId: user.distributorUnitId || "",
                    businessName: user.businessName,
                    regulatorLevel: user.regulatorLevel,
                    province: user.province,
                    status: user.status,
                }
            },
        });
    });

    /**
     * Re-issue a fresh JWT from a valid (or recently expired) token.
     */
    const refresh = asyncHandler(async (req, res) => {
        const authHeader = req.headers.authorization ?? "";
        const token = authHeader.startsWith("Bearer ")
            ? authHeader.slice(7)
            : "";

        if (!token) {
            throw new HttpException(401, "TOKEN_MISSING", "Authorization token is required");
        }

        let payload;
        try {
            payload = jwt.verify(token, config.jwtSecret, {
                ignoreExpiration: true,
            });
        } catch {
            throw new HttpException(401, "TOKEN_INVALID", "Token is invalid or tampered");
        }

        const user = await User.findById(payload.userId).lean();
        if (!user) {
            throw new HttpException(401, "USER_NOT_FOUND", "Token subject no longer exists");
        }

        const newToken = jwt.sign(
            {
                userId: user._id.toString(),
                username: user.username,
                role: user.role,
                mspId: user.mspId,
                distributorUnitId: user.distributorUnitId || "",
                regulatorLevel: user.regulatorLevel,
                province: user.province,
            },
            config.jwtSecret,
            { expiresIn: config.jwtExpiresIn },
        );

        return res.status(200).json({
            success: true,
            data: { token: newToken },
        });
    });

    /**
     * List all users (Admin only).
     */
    const getUsers = asyncHandler(async (req, res) => {
        const { sort = "createdAt", order = "desc", role } = req.query;
        const actor = req.user;

        let query = {};
        if (role) query.role = role;

        if (actor.role === "Admin") {
            // Admin sees all except other admins
            query = { ...query, role: query.role ? query.role : { $ne: "Admin" } };
        } else if (actor.role === "Regulator" && actor.regulatorLevel === "HIGH") {
            // Regulator HIGH sees all except Admin and Regulator HIGH
            query = {
                ...query,
                role: query.role ? query.role : { $in: ["Manufacturer", "Distributor", "Regulator"] },
                $or: [
                    { role: { $in: ["Manufacturer", "Distributor"] } },
                    { role: "Regulator", regulatorLevel: "LOW" }
                ]
            };
        } else if (actor.role === "Regulator" && actor.regulatorLevel === "LOW") {
            // Regulator LOW sees Manufacturers and Distributors in their province
            query = {
                ...query,
                role: query.role ? query.role : { $in: ["Manufacturer", "Distributor"] },
                province: actor.province
            };
        } else if (actor.role === "Manufacturer" || actor.role === "Distributor") {
            // Manufacturers and Distributors can see all Distributors to select for shipping
            query = {
                ...query,
                role: "Distributor",
                status: "APPROVED"
            };
        } else {
            throw new HttpException(403, "Insufficient permissions");
        }

        const users = await User.find(query)
            .sort({ [sort]: order === "desc" ? -1 : 1 })
            .populate("nodeRequestedBy", "username businessName")
            .lean();

        return res.status(200).json({
            success: true,
            data: users.map((u) => ({
                id: u._id.toString(),
                username: u.username,
                role: u.role,
                mspId: u.mspId,
                distributorUnitId: u.distributorUnitId || "",
                businessName: u.businessName,
                regulatorLevel: u.regulatorLevel,
                province: u.province,
                status: u.status,
                blockchainNodeId: u.blockchainNodeId || "",
                nodeRequestStatus: u.nodeRequestStatus || (u.blockchainNodeId ? "APPROVED" : "NONE"),
                nodeRequestedBy: u.nodeRequestedBy ? {
                    id: u.nodeRequestedBy._id.toString(),
                    username: u.nodeRequestedBy.username,
                    businessName: u.nodeRequestedBy.businessName
                } : null,
                createdAt: u.createdAt,
            })),
        });
    });

    /**
     * Update a user (Admin or Regulator HIGH for approval).
     */
    const updateUser = asyncHandler(async (req, res) => {
        const { userId } = req.params;
        const { status, regulatorLevel, province } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            throw new HttpException(404, "User not found");
        }

        if (req.user.role === "Regulator" && req.user.regulatorLevel === "HIGH") {
            if (user.role === "Manufacturer" || user.role === "Distributor") {
                if (status) user.status = status;
            } else {
                throw new HttpException(403, "Regulator HIGH can only approve Manufacturer or Distributor nodes");
            }
        } else if (req.user.role === "Admin") {
            if (status) user.status = status;
            if (regulatorLevel) user.regulatorLevel = regulatorLevel;
            if (province) user.province = province;
        } else {
            throw new HttpException(403, "Insufficient permissions to update user");
        }

        await user.save();

        return res.status(200).json({
            success: true,
            data: {
                id: user._id.toString(),
                username: user.username,
                status: user.status,
            },
        });
    });

    /**
     * Delete a user (Admin only).
     */
    const deleteUser = asyncHandler(async (req, res) => {
        const { userId } = req.params;
        const user = await User.findById(userId);
        if (!user) {
            throw new HttpException(404, "User not found");
        }

        // Handle blockchain node if exists
        if (user.blockchainNodeId) {
            const nodeId = user.blockchainNodeId;
            // 1. Remove from on-demand registry
            const registryPath = path.join(process.cwd(), "blockchain", "on-demand-nodes.json");
            if (fs.existsSync(registryPath)) {
                const nodes = JSON.parse(fs.readFileSync(registryPath, "utf8"));
                const filteredNodes = nodes.filter(n => n.id !== nodeId);
                fs.writeFileSync(registryPath, JSON.stringify(filteredNodes, null, 2));
            }
            
            // 2. Stop and remove Docker container asynchronously (don't block user deletion)
            exec(`docker rm -f ${nodeId}`, async (err) => {
                if (err) {
                    logger.error(`Failed to cleanup container ${nodeId} after user deletion: ${err.message}`);
                } else {
                    logger.info(`Container ${nodeId} removed successfully after user deletion`);
                    // Log the node deletion to audit trail
                    await auditLog({
                        level: "info",
                        category: "NETWORK",
                        action: "DELETE_NODE",
                        message: `Node ${nodeId} for organization ${user.businessName || user.username} was removed due to user deletion by ${req.user.username}`,
                        details: { nodeId, targetUserId: userId, targetUsername: user.username },
                        req
                    });
                }
            });
        }

        await User.findByIdAndDelete(userId);

        await auditLog({
            level: "info",
            category: "AUTH",
            action: "DELETE_USER",
            message: `User ${user.username} was deleted by ${req.user.username}`,
            details: { targetUserId: userId, targetUsername: user.username, hadNode: !!user.blockchainNodeId },
            req
        });

        return res.status(200).json({
            success: true,
            message: "User deleted successfully and associated resources cleaned up",
        });
    });

    /**
     * Reset a user's password (Hierarchical).
     */
    const resetPassword = asyncHandler(async (req, res) => {
        const { userId } = req.params;
        const { password } = req.body;

        if (!password || !passwordRegex.test(password)) {
            throw new HttpException(400, "Mật khẩu tối thiểu 8 ký tự, bao gồm ít nhất 1 chữ hoa, 1 chữ thường và 1 chữ số");
        }

        const targetUser = await User.findById(userId);
        if (!targetUser) {
            throw new HttpException(404, "User not found");
        }

        const actor = req.user;
        let isAuthorized = false;

        if (actor.role === "Admin") {
            isAuthorized = true;
        } else if (actor.role === "Regulator" && actor.regulatorLevel === "HIGH") {
            // Regulator HIGH can reset Manufacturers, Distributors, and Regulator LOW
            if (["Manufacturer", "Distributor"].includes(targetUser.role) || (targetUser.role === "Regulator" && targetUser.regulatorLevel === "LOW")) {
                isAuthorized = true;
            }
        } else if (actor.role === "Regulator" && actor.regulatorLevel === "LOW") {
            // Regulator LOW can only reset Manufacturers and Distributors in their province
            if (["Manufacturer", "Distributor"].includes(targetUser.role) && targetUser.province === actor.province) {
                isAuthorized = true;
            }
        }

        if (!isAuthorized) {
            throw new HttpException(403, "Bạn không có quyền đổi mật khẩu cho người dùng này");
        }

        const passwordHash = await bcrypt.hash(password, 12);
        targetUser.password = passwordHash;
        await targetUser.save();

        await auditLog({
            level: "info",
            category: "AUTH",
            action: "RESET_PASSWORD",
            message: `Password for user ${targetUser.username} was reset by ${actor.username}`,
            details: { targetUserId: userId, targetUsername: targetUser.username },
            req
        });

        return res.status(200).json({
            success: true,
            message: "Password reset successfully",
        });
    });

    /**
     * Request a blockchain node for a user.
     */
    const requestNode = asyncHandler(async (req, res) => {
        const { userId } = req.params;
        const actor = req.user;

        const targetUser = await User.findById(userId);
        if (!targetUser) {
            throw new HttpException(404, "User not found");
        }

        // Check permission: Regulator HIGH can request for any Manufacturer/Distributor/LOW
        // Regulator LOW can only request for businesses in their province
        let isAuthorized = false;
        if (actor.regulatorLevel === "HIGH") {
            if (["Manufacturer", "Distributor"].includes(targetUser.role) || (targetUser.role === "Regulator" && targetUser.regulatorLevel === "LOW")) {
                isAuthorized = true;
            }
        } else {
            if (["Manufacturer", "Distributor"].includes(targetUser.role) && targetUser.province === actor.province) {
                isAuthorized = true;
            }
        }

        if (!isAuthorized) {
            throw new HttpException(403, "Bạn không có quyền yêu cầu mở node cho người dùng này");
        }

        if (targetUser.blockchainNodeId) {
            throw new HttpException(400, "Tài khoản này đã có node blockchain");
        }

        targetUser.nodeRequestStatus = "REQUESTED";
        targetUser.nodeRequestedBy = actor.userId;
        await targetUser.save();

        await auditLog({
            level: "info",
            category: "NETWORK",
            action: "REQUEST_NODE",
            message: `Node creation requested for ${targetUser.username} by ${actor.username}`,
            details: { targetUserId: userId, targetUsername: targetUser.username },
            req
        });

        return res.status(200).json({ success: true, message: "Yêu cầu mở node đã được gửi" });
    });

    /**
     * Approve and create a blockchain node.
     */
    const approveNode = asyncHandler(async (req, res) => {
        const { userId } = req.params;
        const actor = req.user; // Admin only (enforced by router)

        const targetUser = await User.findById(userId);
        if (!targetUser) {
            throw new HttpException(404, "User not found");
        }

        if (targetUser.nodeRequestStatus !== "REQUESTED") {
            throw new HttpException(400, "Không có yêu cầu mở node cho tài khoản này");
        }

        // Trigger real blockchain node creation
        const result = await NodeCreationService.createNode(
            targetUser.businessName || targetUser.username,
            targetUser.role,
            targetUser.province,
            userId,
            req
        );

        targetUser.nodeRequestStatus = "APPROVED";
        targetUser.status = "APPROVED";
        await targetUser.save();

        return res.status(200).json({ 
            success: true, 
            message: "Node đã được tạo thành công và đang khởi chạy",
            nodeId: targetUser.blockchainNodeId 
        });
    });

    return { register, login, refresh, getUsers, updateUser, deleteUser, resetPassword, requestNode, approveNode };
};
