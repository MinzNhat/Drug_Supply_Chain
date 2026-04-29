"use strict";

/**
 * This module provides helper functions for validating and normalizing input data related to drug batches and protected QR codes. It includes functions to ensure required fields are present, validate formats, and apply default values where necessary. These functions are used across the chaincode to maintain consistent data integrity and enforce business rules.
 * The validation functions throw errors with descriptive messages when the input data does not meet the expected criteria, which helps in debugging and ensures that only valid data is processed by the contract logic.
 *
 * @param {string} value - The input value to validate.
 * @param {string} fieldName - The name of the field being validated, used in error messages.
 * @returns {string} The normalized string value.
 */
function requireNonEmptyString(value, fieldName) {
    const normalized = value ? String(value).trim() : "";

    if (!normalized) {
        throw new Error(`Denied: ${fieldName} must be provided.`);
    }

    return normalized;
}

/**
 * requireOptionalString validates an optional string field. If the value is undefined or null, it returns an empty string. Otherwise, it converts the value to a string.
 *
 * @param {string} value - The input value to validate.
 * @returns {string} The normalized string value or an empty string if the input is undefined or null.
 */
function requireOptionalString(value) {
    if (value === undefined || value === null) {
        return "";
    }

    return String(value);
}

/**
 * assertHex validates that a given string is a hexadecimal string of a specified length. It normalizes the input by trimming whitespace and converting it to lowercase before validation.
 *
 * @param {string} value - The input value to validate as a hexadecimal string.
 * @param {number} expectedLength - The expected length of the hexadecimal string.
 * @param {string} fieldName - The name of the field being validated, used in error messages.
 * @returns {string} The normalized hexadecimal string if valid.
 * @throws Will throw an error if the input is not a valid hexadecimal string of the expected length.
 */
function assertHex(value, expectedLength, fieldName) {
    const normalized = requireNonEmptyString(value, fieldName).toLowerCase();
    const regex = new RegExp(`^[0-9a-f]{${expectedLength}}$`);

    if (!regex.test(normalized)) {
        throw new Error(
            `Denied: ${fieldName} must be ${expectedLength} hex chars.`,
        );
    }
    return normalized;
}

/**
 * parseBoolean validates a boolean value and converts it to a boolean type.
 *
 * @param {string} value - The input value to validate as a boolean.
 * @param {string} fieldName - The name of the field being validated, used in error messages.
 * @returns {boolean} The parsed boolean value.
 * @throws Will throw an error if the input is not a valid boolean string.
 */
function parseBoolean(value, fieldName) {
    const normalized = requireNonEmptyString(value, fieldName).toLowerCase();

    if (normalized === "true" || normalized === "1") {
        return true;
    }

    if (normalized === "false" || normalized === "0") {
        return false;
    }

    throw new Error(`Denied: ${fieldName} must be true/false or 1/0.`);
}

/**
 * parseConfidenceScore validates that a given value is a number between 0 and 1, inclusive. It converts the input to a number and checks the range.
 *
 * @param {string} value - The input value to validate as a confidence score.
 * @returns {number} The parsed confidence score as a number.
 * @throws Will throw an error if the input is not a valid number in the range [0, 1].
 */
function parseConfidenceScore(value) {
    const parsed = Number(requireNonEmptyString(value, "confidence_score"));

    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
        throw new Error(
            "Denied: confidence_score must be a number in range [0, 1].",
        );
    }

    return parsed;
}

/**
 * normalizeExpiryDate normalizes the expiry date string by trimming whitespace and validating its format.
 *
 * @param {string} expiryDate - The input expiry date string to normalize.
 * @returns {string} The normalized expiry date string or an empty string if the input is undefined or null.
 * @throws Will throw an error if the input is not a valid date string.
 */
function normalizeExpiryDate(expiryDate) {
    const normalizedExpiryDate = expiryDate ? String(expiryDate).trim() : "";

    if (
        normalizedExpiryDate &&
        Number.isNaN(Date.parse(normalizedExpiryDate))
    ) {
        throw new Error(
            "Denied: expiryDate must be a valid date string (ISO-8601 recommended).",
        );
    }

    return normalizedExpiryDate;
}

/**
 * normalizeProtectedQrPolicy normalizes the protected QR verification policy by converting threshold values to numbers and validating them.
 *
 * @param {Object} policy - The input policy object.
 * @param {Object} defaultPolicy - The default policy object.
 * @returns {Object} The normalized policy object.
 * @throws Will throw an error if the policy is invalid.
 */
function normalizeProtectedQrPolicy(policy, defaultPolicy) {
    const authenticThreshold = Number(
        policy && policy.authentic_threshold !== undefined
            ? policy.authentic_threshold
            : defaultPolicy.authentic_threshold,
    );

    const fakeThreshold = Number(
        policy && policy.fake_threshold !== undefined
            ? policy.fake_threshold
            : defaultPolicy.fake_threshold,
    );

    if (
        !Number.isFinite(authenticThreshold) ||
        !Number.isFinite(fakeThreshold)
    ) {
        throw new Error("Denied: protected QR verification policy is invalid.");
    }

    return {
        authentic_threshold: authenticThreshold,
        fake_threshold: fakeThreshold,
    };
}

module.exports = {
    requireNonEmptyString,
    requireOptionalString,
    assertHex,
    parseBoolean,
    parseConfidenceScore,
    normalizeExpiryDate,
    normalizeProtectedQrPolicy,
};
