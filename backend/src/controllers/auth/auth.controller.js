import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "../../config/index.js";
import { User } from "../../models/user/user.model.js";
import { asyncHandler } from "../../utils/async-handler/async-handler.js";
import { HttpException } from "../../utils/http-exception/http-exception.js";
import { isMspIdForRole, normalizeMspId } from "../../utils/msp/msp.js";

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
        username: z.string().regex(usernameRegex),
        password: z.string().regex(passwordRegex),
        role: z.enum(["Manufacturer", "Distributor", "Regulator"]),
        mspId: z.string().min(1),
    })
    .superRefine((data, ctx) => {
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
    });

/**
 * Request schema for account login.
 */
const loginSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
});

/**
 * Build the auth controller with register and login handlers.
 *
 * @returns {{ register: import("express").RequestHandler, login: import("express").RequestHandler }} Auth handlers.
 */
export const createAuthController = () => {
    /**
     * Register a new user and return the created profile payload.
     */
    const register = asyncHandler(async (req, res) => {
        const parsed = registerSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new HttpException(400, "Invalid request body", {
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
            throw new HttpException(409, "Username already exists");
        }

        const passwordHash = await bcrypt.hash(parsed.data.password, 12);
        const user = await User.create({
            username: parsed.data.username,
            password: passwordHash,
            role: parsed.data.role,
            mspId: normalizedMspId,
        });

        return res.status(201).json({
            success: true,
            data: {
                id: user._id.toString(),
                username: user.username,
                role: user.role,
                mspId: user.mspId,
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
                role: user.role,
                mspId: user.mspId,
            },
            config.jwtSecret,
            { expiresIn: config.jwtExpiresIn },
        );

        return res.status(200).json({
            success: true,
            data: {
                token,
            },
        });
    });

    return { register, login };
};
