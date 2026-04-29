import { asyncHandler } from "../../utils/async-handler/async-handler.js";
import { getNetworkTopology } from "../../services/network/network-topology.service.js";
import { User } from "../../models/user/user.model.js";
import { NodeCreationService } from "../../services/network/node-creation.service.js";
import { HttpException } from "../../utils/http-exception/http-exception.js";
import { logger } from "../../utils/logger/logger.js";

/**
 * Build the network topology controller.
 *
 * No service dependency injection needed — topology is a pure infrastructure
 * read that derives its configuration from `config.fabric` directly.
 *
 * @returns {{ getTopology: import("express").RequestHandler }} Controller handlers.
 */
export const createNetworkController = () => {
    /**
     * Return live Fabric network topology for the FE node graph.
     *
     * The caller does not need to be authenticated because the response
     * contains only infrastructure status (up/down + host) — no ledger data.
     * Re-authentication on the FE polling interval would add unnecessary
     * overhead. If a stricter posture is required, attach `authMiddleware`
     * in the route registration instead.
     */
    const getTopology = asyncHandler(async (_req, res) => {
        const data = await getNetworkTopology();
        
        // Enrich on-demand nodes with Business Name from DB
        const enrichedNodes = await Promise.all(data.nodes.map(async (node) => {
            // Static nodes get a default mapping
            if (node.id === "peer0.regulator" || node.id.startsWith("orderer")) {
                return { ...node, businessName: "Cục Quản lý Dược" };
            }
            if (node.id === "peer0.manufacturer") {
                return { ...node, businessName: "Tổng công ty Dược Việt Nam" };
            }
            if (node.id === "peer0.distributor") {
                return { ...node, businessName: "Trung tâm Phân phối Quốc gia" };
            }

            // On-demand nodes lookup by their linked userId or blockchainNodeId
            const owner = await User.findOne({ blockchainNodeId: node.id }).select("businessName").lean();
            return {
                ...node,
                businessName: owner?.businessName || node.org
            };
        }));

        return res.status(200).json({ 
            success: true, 
            data: { ...data, nodes: enrichedNodes } 
        });
    });

    /**
     * Trigger creation of a new node (Admin or authorized Regulators).
     */
    const createNode = asyncHandler(async (req, res) => {
        const { orgName, role, province, userId } = req.body;

        const isAuthorized =
            req.user.role === "Admin" ||
            (req.user.role === "Regulator" &&
                req.user.regulatorLevel === "HIGH" &&
                ["Manufacturer", "Distributor"].includes(role)) ||
            (req.user.role === "Regulator" &&
                req.user.regulatorLevel === "LOW" &&
                ["Manufacturer", "Distributor"].includes(role) &&
                province === req.user.province);

        if (!isAuthorized) {
            throw new HttpException(403, "Insufficient permissions to create node");
        }

    const result = await NodeCreationService.createNode(orgName, role, province, userId, req);

    return res.status(201).json({
      success: true,
      message: result.message,
      data: result
    });
  });

  /**
   * GET /api/v1/network/nodes/:nodeId/owner
   */
  const getNodeOwner = asyncHandler(async (req, res) => {
    const { nodeId } = req.params;
    const owner = await User.findOne({ blockchainNodeId: nodeId }).select("username").lean();
    if (!owner) {
      throw new HttpException(404, "Owner not found for this node");
    }
    return res.status(200).json({
      success: true,
      data: { username: owner.username }
    });
  });

  return { getTopology, createNode, getNodeOwner };
};
