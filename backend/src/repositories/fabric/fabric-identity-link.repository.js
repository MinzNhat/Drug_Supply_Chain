import { FabricIdentityLink } from "../../models/fabric/fabric-identity-link.model.js";
import { logger } from "../../utils/logger/logger.js";

/**
 * Persist actor-to-fabric identity linkage record without impacting request path on failure.
 *
 * @param {Record<string, unknown>} payload - Linkage payload.
 * @returns {Promise<void>} Resolve after best-effort persistence.
 */
export const recordFabricIdentityLink = async (payload) => {
    try {
        await FabricIdentityLink.create(payload);
    } catch (error) {
        logger.warn({
            message: "fabric-identity-link-persist-failed",
            error: error instanceof Error ? error.message : String(error),
            traceId: payload?.traceId ?? "",
            transactionName: payload?.transaction?.name ?? "",
        });
    }
};
