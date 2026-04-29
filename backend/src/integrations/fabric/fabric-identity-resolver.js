import { HttpException } from "../../utils/http-exception/http-exception.js";
import { normalizeMspId } from "../../utils/msp/msp.js";

const DISTRIBUTOR_UNIT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{1,62}$/i;

/**
 * Normalize distributor unit id for lookup keys.
 *
 * @param {unknown} value - Raw unit id.
 * @returns {string} Normalized lower-case id or empty string.
 */
export const normalizeDistributorUnitId = (value) => {
    if (typeof value !== "string") {
        return "";
    }

    const normalized = value.trim().toLowerCase();
    if (!DISTRIBUTOR_UNIT_ID_PATTERN.test(normalized)) {
        return "";
    }

    return normalized;
};

/**
 * Resolve effective Fabric identity configuration for one actor.
 *
 * @param {{ role?: string, mspId?: string, distributorUnitId?: string, transportUnitId?: string, unitId?: string }} actor
 * @param {{ organizations: Record<string, Record<string, string>>, distributorIdentityBridge?: { enabled?: boolean, requireUnitForDistributor?: boolean, units?: Record<string, Record<string, string>> } }} fabricConfig
 * @returns {{ sessionKey: string, identityLabel: string, source: string, role: string, mspId: string, peerEndpoint: string, peerHostAlias: string, tlsCertPath: string, certPath: string, keyPath: string, distributorUnitId: string }}
 */
export const resolveFabricIdentityReference = (actor, fabricConfig) => {
    if (!actor?.role) {
        throw new HttpException(401, "UNAUTHORIZED", "Missing actor role");
    }

    const role = actor.role;
    if (!["Manufacturer", "Distributor", "Regulator"].includes(role)) {
        throw new HttpException(
            400,
            "INVALID_ACTOR_ROLE",
            "Unsupported actor role",
            {
                role,
            },
        );
    }

    const roleOrg = fabricConfig?.organizations?.[role];
    if (!roleOrg) {
        throw new HttpException(
            500,
            "FABRIC_CONFIG_ERROR",
            `Missing Fabric org config for role ${role}`,
        );
    }

    const defaultIdentity = {
        sessionKey: `role:${role}`,
        identityLabel: `${role}:default`,
        source: "role-default",
        role,
        mspId: roleOrg.mspId,
        peerEndpoint: roleOrg.peerEndpoint,
        peerHostAlias: roleOrg.peerHostAlias,
        tlsCertPath: roleOrg.tlsCertPath,
        certPath: roleOrg.certPath,
        keyPath: roleOrg.keyPath,
        distributorUnitId: "",
    };

    if (role !== "Distributor") {
        return defaultIdentity;
    }

    const bridge = fabricConfig?.distributorIdentityBridge ?? {};
    if (!bridge.enabled) {
        return defaultIdentity;
    }

    const unitId = normalizeDistributorUnitId(
        actor.distributorUnitId ?? actor.transportUnitId ?? actor.unitId,
    );

    if (!unitId && bridge.requireUnitForDistributor) {
        throw new HttpException(
            403,
            "DISTRIBUTOR_UNIT_REQUIRED",
            "Distributor unit identity is required for Fabric access",
        );
    }

    if (!unitId) {
        return defaultIdentity;
    }

    const unitConfig = bridge?.units?.[unitId];
    if (!unitConfig) {
        throw new HttpException(
            403,
            "DISTRIBUTOR_UNIT_NOT_AUTHORIZED",
            "Distributor unit is not authorized for Fabric identity mapping",
            {
                distributorUnitId: unitId,
            },
        );
    }

    const actorCanonicalMspId = normalizeMspId(actor.mspId);
    const mappedCanonicalMspId = normalizeMspId(unitConfig.mspId);
    const hasCanonicalMismatch =
        actorCanonicalMspId &&
        mappedCanonicalMspId &&
        actorCanonicalMspId !== mappedCanonicalMspId;
    const hasRawMismatch =
        typeof actor.mspId === "string" &&
        actor.mspId &&
        typeof unitConfig.mspId === "string" &&
        unitConfig.mspId &&
        !mappedCanonicalMspId &&
        actor.mspId !== unitConfig.mspId;

    if (hasCanonicalMismatch || hasRawMismatch) {
        throw new HttpException(
            403,
            "DISTRIBUTOR_UNIT_MSP_MISMATCH",
            "Distributor unit mapping does not match authenticated MSP",
            {
                distributorUnitId: unitId,
                actorMspId: actor.mspId,
                mappedMspId: unitConfig.mspId,
                actorCanonicalMspId,
                mappedCanonicalMspId,
            },
        );
    }

    return {
        sessionKey: `distributor-unit:${unitId}`,
        identityLabel: unitConfig.identityLabel || `distributor-unit:${unitId}`,
        source: "distributor-unit",
        role,
        mspId: unitConfig.mspId || roleOrg.mspId,
        peerEndpoint: unitConfig.peerEndpoint || roleOrg.peerEndpoint,
        peerHostAlias: unitConfig.peerHostAlias || roleOrg.peerHostAlias,
        tlsCertPath: unitConfig.tlsCertPath || roleOrg.tlsCertPath,
        certPath: unitConfig.certPath,
        keyPath: unitConfig.keyPath,
        distributorUnitId: unitId,
    };
};
