import { exec } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { logger } from "../../utils/logger/logger.js";
import { User } from "../../models/user/user.model.js";
import { auditLog } from "../../utils/logger/audit-logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Standardize name into a valid Fabric organization slug (alphanumeric only).
 * Removes Vietnamese accents and appends a short unique suffix.
 */
const normalizeSlug = (text, suffix = "") => {
    if (!text) return "org" + suffix;
    
    // Remove Vietnamese accents
    const normalized = text.normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[đĐ]/g, "d");

    // Keep only alphanumeric, lowercase
    const slug = normalized.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    
    // Truncate to 10 chars then append suffix
    return slug.substring(0, 10) + suffix;
};

/**
 * Service to handle blockchain node creation by executing local shell scripts.
 */
export class NodeCreationService {
    /**
     * Trigger the creation of a new organization and node on the Fabric network.
     * 
     * @param {string} orgName - The display name of the organization.
     * @param {string} role - The role of the organization (Manufacturer/Distributor).
     * @param {string} province - The province of the organization.
     * @param {string} userId - The ID of the user who will own this node.
     * @returns {Promise<{success: boolean, message: string}>}
     */
    static async createNode(orgName, role, province, userId, req = null) {
        // Resolve script path relative to project root
        const scriptPath = path.resolve(process.cwd(), "scripts/blockchain/on-demand-node.sh");
        
        if (!fs.existsSync(scriptPath)) {
            logger.error(`Node creation script NOT found at: ${scriptPath}`);
            throw new Error(`System configuration error: Node creation script not found.`);
        }
        
        // Clean parameters to prevent shell injection
        // Standardized slug: [Normalized Business Name] + [Last 4 chars of userId]
        const shortId = userId ? userId.toString().slice(-4) : "";
        const safeOrgName = normalizeSlug(orgName, shortId);
        const safeRole = role.replace(/[^a-zA-Z0-9]/g, "");
        const safeProvince = province.replace(/[^a-zA-Z0-9\s]/g, "");

        return new Promise((resolve, reject) => {
            logger.info(`Starting node creation script for ${safeOrgName} (Display: ${orgName}, Role: ${safeRole}, Prov: ${safeProvince})...`);
            
            const command = `bash "${scriptPath}" "${safeOrgName}" "${safeRole}" "${safeProvince}"`;
            
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    const errorMsg = `Blockchain node creation failed: ${error.message}`;
                    logger.error(errorMsg);
                    logger.error(`Stderr: ${stderr}`);
                    
                    auditLog({
                        level: "error",
                        category: "NETWORK",
                        action: "CREATE_NODE",
                        message: errorMsg,
                        details: { orgName, role, province, userId, stderr },
                        req
                    });

                    return reject(new Error(errorMsg));
                }
                
                if (stderr) {
                    logger.warn(`Node creation script stderr: ${stderr}`);
                }
                
                logger.info(`Node creation script finished successfully: ${stdout}`);
                
                // Link node to user
                const slug = safeOrgName.toLowerCase();
                const nodeId = `peer0.${slug}.drugguard.vn`;
                
                User.findByIdAndUpdate(userId, { blockchainNodeId: nodeId })
                    .then(() => {
                        logger.info(`Linked node ${nodeId} to user ${userId}`);
                        auditLog({
                            level: "info",
                            category: "NETWORK",
                            action: "CREATE_NODE",
                            message: `Node for ${safeOrgName} (${role}) created and linked to user.`,
                            details: { nodeId, orgName, userId, province },
                            req
                        });
                    })
                    .catch(err => logger.error(`Failed to link node ${nodeId} to user ${userId}: ${err.message}`));

                resolve({
                    success: true,
                    message: `Node for ${safeOrgName} created and joined to channel.`,
                    output: stdout
                });
            });
        });
    }
}
