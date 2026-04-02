"use strict";

/*
 * MSP_CANONICAL maps various organizational MSP identifiers to a canonical form for consistent access control checks.
 * This allows the contract to treat different MSP identifiers as equivalent when enforcing permissions.
 */
const MSP_CANONICAL = Object.freeze({
    RegulatorMSP: "RegulatorMSP",
    Org1MSP: "RegulatorMSP",
    ManufacturerMSP: "ManufacturerMSP",
    Org2MSP: "ManufacturerMSP",
    DistributorMSP: "DistributorMSP",
    Org3MSP: "DistributorMSP",
});

/*
 * PROTECTED_QR_VERIFICATION_POLICY defines thresholds for determining the authenticity of QR codes.
 * These thresholds can be used in contract logic to classify QR codes as authentic, fake, or uncertain.
 */
const PROTECTED_QR_VERIFICATION_POLICY = Object.freeze({
    authentic_threshold: 0.7,
    fake_threshold: 0.55,
});

module.exports = {
    MSP_CANONICAL,
    PROTECTED_QR_VERIFICATION_POLICY,
};
