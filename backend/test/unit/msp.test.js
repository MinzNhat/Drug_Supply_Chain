import assert from "node:assert/strict";
import test from "node:test";
import {
    isMspIdForRole,
    normalizeMspId,
    normalizeRole,
    toCanonicalMspForRole,
} from "../../src/utils/msp/msp.js";

/**
 * Unit tests for MSP/role normalization helpers.
 */

test("normalizeMspId accepts org aliases", () => {
    assert.equal(normalizeMspId("Org1MSP"), "RegulatorMSP");
    assert.equal(normalizeMspId("Org2MSP"), "ManufacturerMSP");
    assert.equal(normalizeMspId("Org3MSP"), "DistributorMSP");
    assert.equal(normalizeMspId("UnknownMSP"), "");
});

test("normalizeRole accepts role and msp aliases", () => {
    assert.equal(normalizeRole("regulator"), "Regulator");
    assert.equal(normalizeRole("Org2MSP"), "Manufacturer");
    assert.equal(normalizeRole("Manufacturer"), "Manufacturer");
    assert.equal(normalizeRole(""), "");
});

test("isMspIdForRole validates canonical mapping", () => {
    assert.equal(isMspIdForRole("Distributor", "Org3MSP"), true);
    assert.equal(isMspIdForRole("Manufacturer", "DistributorMSP"), false);
});

test("toCanonicalMspForRole resolves canonical msp", () => {
    assert.equal(toCanonicalMspForRole("Regulator"), "RegulatorMSP");
    assert.equal(toCanonicalMspForRole("Org3MSP"), "DistributorMSP");
    assert.equal(toCanonicalMspForRole("invalid"), "");
});
