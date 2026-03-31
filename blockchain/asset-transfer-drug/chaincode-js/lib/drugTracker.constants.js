"use strict";

const MSP_CANONICAL = Object.freeze({
    RegulatorMSP: "RegulatorMSP",
    Org1MSP: "RegulatorMSP",
    ManufacturerMSP: "ManufacturerMSP",
    Org2MSP: "ManufacturerMSP",
    DistributorMSP: "DistributorMSP",
    Org3MSP: "DistributorMSP",
});

const PROTECTED_QR_VERIFICATION_POLICY = Object.freeze({
    authentic_threshold: 0.7,
    fake_threshold: 0.55,
});

module.exports = {
    MSP_CANONICAL,
    PROTECTED_QR_VERIFICATION_POLICY,
};
