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
    assert.equal(normalizeMspId("RegulatorMSP"), "RegulatorMSP");
    assert.equal(normalizeMspId("ManufacturerMSP"), "ManufacturerMSP");
    assert.equal(normalizeMspId("DistributorMSP"), "DistributorMSP");
    assert.equal(normalizeMspId("UnknownMSP"), "");
});

test("normalizeRole accepts role and msp aliases", () => {
    assert.equal(normalizeRole("regulator"), "Regulator");
    assert.equal(normalizeRole("ManufacturerMSP"), "Manufacturer");
    assert.equal(normalizeRole("Manufacturer"), "Manufacturer");
    assert.equal(normalizeRole(""), "");
});

test("isMspIdForRole validates canonical mapping", () => {
    assert.equal(isMspIdForRole("Distributor", "DistributorMSP"), true);
    assert.equal(isMspIdForRole("Manufacturer", "DistributorMSP"), false);
});

test("toCanonicalMspForRole resolves canonical msp", () => {
    assert.equal(toCanonicalMspForRole("Regulator"), "RegulatorMSP");
    assert.equal(toCanonicalMspForRole("DistributorMSP"), "DistributorMSP");
    assert.equal(toCanonicalMspForRole("invalid"), "");
});
