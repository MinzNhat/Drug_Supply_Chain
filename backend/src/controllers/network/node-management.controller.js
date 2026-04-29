import { exec } from "child_process";
import { asyncHandler } from "../../utils/async-handler/async-handler.js";
import { logger } from "../../utils/logger/logger.js";
import { HttpException } from "../../utils/http-exception/http-exception.js";
import fs from "fs";
import path from "path";
import { User } from "../../models/user/user.model.js";
import { auditLog } from "../../utils/logger/audit-logger.js";

/**
 * Controller to handle node management actions like restart.
 */
export const createNodeManagementController = () => {
    /**
     * Restart a blockchain node (Docker container).
     * Only Admin can perform this action.
     */
    const restartNode = asyncHandler(async (req, res) => {
        const { nodeId } = req.body;

        if (req.user.role !== "Admin") {
            throw new HttpException(403, "Only Admin can restart nodes");
        }

        if (!nodeId) {
            throw new HttpException(400, "nodeId (container name) is required");
        }

        // Basic validation for container name to prevent shell injection
        if (!/^[a-zA-Z0-9.-]+$/.test(nodeId)) {
            throw new HttpException(400, "Invalid nodeId format");
        }

        logger.info(`Restarting node: ${nodeId} by ${req.user.username}`);

        return new Promise((resolve, reject) => {
            exec(`docker restart ${nodeId}`, (error, stdout, stderr) => {
                if (error) {
                    const errorMsg = `Failed to restart node ${nodeId}: ${error.message}`;
                    
                    // If container is missing, clean up the registry (Zombie node)
                    if (stderr.includes("No such container") || error.message.includes("No such container")) {
                        logger.warn(`Cleaning up zombie node ${nodeId} from registry (container missing)`);
                        const registryPath = path.join(process.cwd(), "blockchain", "on-demand-nodes.json");
                        if (fs.existsSync(registryPath)) {
                            const nodes = JSON.parse(fs.readFileSync(registryPath, "utf8"));
                            const filteredNodes = nodes.filter(n => n.id !== nodeId);
                            fs.writeFileSync(registryPath, JSON.stringify(filteredNodes, null, 2));
                        }
                        User.findOneAndUpdate({ blockchainNodeId: nodeId }, { blockchainNodeId: "" }).exec();
                    }

                    auditLog({
                        level: "error",
                        category: "NETWORK",
                        action: "RESTART_NODE",
                        message: errorMsg,
                        details: { nodeId, stderr },
                        req
                    });
                    return res.status(500).json({
                        success: false,
                        message: `Failed to restart node: ${error.message}`
                    });
                }
                
                auditLog({
                    level: "info",
                    category: "NETWORK",
                    action: "RESTART_NODE",
                    message: `Node ${nodeId} restarted successfully by ${req.user.username}`,
                    details: { nodeId },
                    req
                });

                return res.status(200).json({
                    success: true,
                    message: `Node ${nodeId} restarted successfully.`,
                    data: stdout.trim()
                });
            });
        });
    });

    /**
     * Delete a blockchain node (on-demand nodes only).
     * Only Admin can perform this action.
     */
    const deleteNode = asyncHandler(async (req, res) => {
        const { nodeId } = req.params;

        if (req.user.role !== "Admin") {
            throw new HttpException(403, "Only Admin can delete nodes");
        }

        if (!nodeId) {
            throw new HttpException(400, "nodeId is required");
        }

        // Basic validation for container name to prevent shell injection
        if (!/^[a-zA-Z0-9.-]+$/.test(nodeId)) {
            throw new HttpException(400, "Invalid nodeId format");
        }

        logger.info(`Deleting node: ${nodeId} by ${req.user.username}`);

        // 1. Remove from on-demand registry
        const registryPath = path.join(process.cwd(), "blockchain", "on-demand-nodes.json");
        let nodeFound = false;
        if (fs.existsSync(registryPath)) {
            const nodes = JSON.parse(fs.readFileSync(registryPath, "utf8"));
            const filteredNodes = nodes.filter(n => n.id !== nodeId);
            if (nodes.length !== filteredNodes.length) {
                fs.writeFileSync(registryPath, JSON.stringify(filteredNodes, null, 2));
                nodeFound = true;
            }
        }

        if (!nodeFound) {
            // Check if it's a static node (not allowed to delete via this API)
            throw new HttpException(400, "Only on-demand nodes can be deleted via this API");
        }

        // 2. Unlink from user and reset request status
        await User.findOneAndUpdate(
            { blockchainNodeId: nodeId }, 
            { 
                blockchainNodeId: "",
                nodeRequestStatus: "NONE",
                nodeRequestedBy: null
            }
        );

        // 3. Stop and remove Docker container
        return new Promise((resolve, reject) => {
            exec(`docker rm -f ${nodeId}`, (error, stdout, stderr) => {
                if (error) {
                    const errorMsg = `Failed to remove container ${nodeId}: ${error.message}`;
                    
                    // If container is missing, we consider the deletion successful as the goal was removal
                    if (stderr.includes("No such container") || error.message.includes("No such container")) {
                        auditLog({
                            level: "info",
                            category: "NETWORK",
                            action: "DELETE_NODE",
                            message: `Node ${nodeId} (missing container) removed from registry by ${req.user.username}.`,
                            details: { nodeId },
                            req
                        });
                        return res.status(200).json({
                            success: true,
                            message: `Node ${nodeId} metadata removed (container was already missing).`
                        });
                    }

                    auditLog({
                        level: "error",
                        category: "NETWORK",
                        action: "DELETE_NODE",
                        message: `Failed to remove container ${nodeId} (by ${req.user.username}): ${error.message}`,
                        details: { nodeId, stderr },
                        req
                    });
                    // We already removed it from registry, so we return 200 but warn about container
                    return res.status(200).json({
                        success: true,
                        message: `Node metadata removed, but container removal failed: ${error.message}`
                    });
                }
                
                auditLog({
                    level: "info",
                    category: "NETWORK",
                    action: "DELETE_NODE",
                    message: `Node ${nodeId} deleted successfully by ${req.user.username}`,
                    details: { nodeId },
                    req
                });
                return res.status(200).json({
                    success: true,
                    message: `Node ${nodeId} deleted successfully.`
                });
            });
        });
    });

    return { restartNode, deleteNode };
};
