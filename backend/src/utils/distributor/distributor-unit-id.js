/**
 * Pattern accepted for distributor unit identifiers.
 */
const DISTRIBUTOR_UNIT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{1,62}$/i;

/**
 * Normalize an optional distributor unit id input to canonical lower-case form.
 *
 * Empty string or invalid format returns empty string.
 *
 * @param {unknown} value - Raw user input.
 * @returns {string} Canonical lower-case unit id or empty string.
 */
export const normalizeDistributorUnitId = (value) => {
    if (typeof value !== "string") {
        return "";
    }

    const normalized = value.trim().toLowerCase();
    if (!normalized) {
        return "";
    }

    return DISTRIBUTOR_UNIT_ID_PATTERN.test(normalized) ? normalized : "";
};
