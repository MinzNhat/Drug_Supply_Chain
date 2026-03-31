/**
 * Canonical role to canonical MSP mapping.
 */
const ROLE_TO_CANONICAL_MSP = Object.freeze({
    Manufacturer: "ManufacturerMSP",
    Distributor: "DistributorMSP",
    Regulator: "RegulatorMSP",
});

/**
 * Accepted MSP aliases mapped to canonical MSP identifiers.
 */
const MSP_ALIAS_TO_CANONICAL = Object.freeze({
    ManufacturerMSP: "ManufacturerMSP",
    Org2MSP: "ManufacturerMSP",
    DistributorMSP: "DistributorMSP",
    Org3MSP: "DistributorMSP",
    RegulatorMSP: "RegulatorMSP",
    Org1MSP: "RegulatorMSP",
});

/**
 * Canonical MSP to canonical role mapping.
 */
const CANONICAL_MSP_TO_ROLE = Object.freeze({
    ManufacturerMSP: "Manufacturer",
    DistributorMSP: "Distributor",
    RegulatorMSP: "Regulator",
});

/**
 * Accepted role aliases mapped to canonical role names.
 */
const ROLE_ALIAS_TO_CANONICAL = Object.freeze({
    manufacturer: "Manufacturer",
    distributor: "Distributor",
    regulator: "Regulator",
});

/**
 * Normalize a role-or-msp string into canonical application role.
 *
 * @param {unknown} value - Role or MSP alias.
 * @returns {"Manufacturer"|"Distributor"|"Regulator"|""}
 */
export const normalizeRole = (value) => {
    if (typeof value !== "string") {
        return "";
    }

    const trimmed = value.trim();
    const roleAlias = ROLE_ALIAS_TO_CANONICAL[trimmed.toLowerCase()];
    if (roleAlias) {
        return roleAlias;
    }

    const canonicalMsp = MSP_ALIAS_TO_CANONICAL[trimmed];
    if (canonicalMsp) {
        return CANONICAL_MSP_TO_ROLE[canonicalMsp];
    }

    return "";
};

/**
 * Normalize an MSP identifier into canonical application MSP.
 *
 * @param {unknown} value - MSP identifier or alias.
 * @returns {"ManufacturerMSP"|"DistributorMSP"|"RegulatorMSP"|""}
 */
export const normalizeMspId = (value) => {
    if (typeof value !== "string") {
        return "";
    }

    const trimmed = value.trim();
    return MSP_ALIAS_TO_CANONICAL[trimmed] ?? "";
};

/**
 * Resolve canonical MSP from role-like value.
 *
 * @param {unknown} role - Role or role alias.
 * @returns {"ManufacturerMSP"|"DistributorMSP"|"RegulatorMSP"|""}
 */
export const toCanonicalMspForRole = (role) => {
    const normalizedRole = normalizeRole(role);
    if (!normalizedRole) {
        return "";
    }

    return ROLE_TO_CANONICAL_MSP[normalizedRole] ?? "";
};

/**
 * Validate whether role and msp belong to the same canonical identity domain.
 *
 * @param {unknown} role - Role or alias.
 * @param {unknown} mspId - MSP id or alias.
 * @returns {boolean}
 */
export const isMspIdForRole = (role, mspId) => {
    const canonicalRoleMsp = toCanonicalMspForRole(role);
    const normalizedMspId = normalizeMspId(mspId);

    return (
        Boolean(canonicalRoleMsp && normalizedMspId) &&
        canonicalRoleMsp === normalizedMspId
    );
};
