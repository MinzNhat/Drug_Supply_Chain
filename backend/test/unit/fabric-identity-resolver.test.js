import assert from "node:assert/strict";
import test from "node:test";
import { resolveFabricIdentityReference } from "../../src/integrations/fabric/fabric-identity-resolver.js";

const baseFabricConfig = {
    organizations: {
        Manufacturer: {
            mspId: "ManufacturerMSP",
            peerEndpoint: "localhost:7051",
            peerHostAlias: "peer0.manufacturer.drugguard.vn",
            tlsCertPath: "/tmp/manufacturer/tls.crt",
            certPath: "/tmp/manufacturer/signcert.pem",
            keyPath: "/tmp/manufacturer/keystore",
        },
        Distributor: {
            mspId: "DistributorMSP",
            peerEndpoint: "localhost:9051",
            peerHostAlias: "peer0.distributor.drugguard.vn",
            tlsCertPath: "/tmp/distributor/tls.crt",
            certPath: "/tmp/distributor/signcert.pem",
            keyPath: "/tmp/distributor/keystore",
        },
        Regulator: {
            mspId: "RegulatorMSP",
            peerEndpoint: "localhost:11051",
            peerHostAlias: "peer0.regulator.drugguard.vn",
            tlsCertPath: "/tmp/regulator/tls.crt",
            certPath: "/tmp/regulator/signcert.pem",
            keyPath: "/tmp/regulator/keystore",
        },
    },
    distributorIdentityBridge: {
        enabled: true,
        requireUnitForDistributor: true,
        units: {
            "dist-unit-hcm": {
                identityLabel: "Distributor HCM Unit",
                mspId: "DistributorMSP",
                peerEndpoint: "localhost:9051",
                peerHostAlias: "peer0.distributor.drugguard.vn",
                tlsCertPath: "/tmp/distributor/tls.crt",
                certPath: "/tmp/distributor/hcm/signcert.pem",
                keyPath: "/tmp/distributor/hcm/keystore",
            },
        },
    },
};

test("resolveFabricIdentityReference maps distributor unit to unit identity", () => {
    const resolved = resolveFabricIdentityReference(
        {
            role: "Distributor",
            mspId: "DistributorMSP",
            distributorUnitId: "DIST-UNIT-HCM",
        },
        baseFabricConfig,
    );

    assert.equal(resolved.sessionKey, "distributor-unit:dist-unit-hcm");
    assert.equal(resolved.source, "distributor-unit");
    assert.equal(
        resolved.certPath,
        "/tmp/distributor/hcm/signcert.pem",
    );
});

test("resolveFabricIdentityReference rejects unauthorized distributor unit", () => {
    assert.throws(
        () =>
            resolveFabricIdentityReference(
                {
                    role: "Distributor",
                    mspId: "DistributorMSP",
                    distributorUnitId: "dist-unit-dn",
                },
                baseFabricConfig,
            ),
        (error) => {
            assert.equal(error.status, 403);
            assert.equal(error.code, "DISTRIBUTOR_UNIT_NOT_AUTHORIZED");
            return true;
        },
    );
});

test("resolveFabricIdentityReference rejects distributor without unit when required", () => {
    assert.throws(
        () =>
            resolveFabricIdentityReference(
                {
                    role: "Distributor",
                    mspId: "DistributorMSP",
                },
                baseFabricConfig,
            ),
        (error) => {
            assert.equal(error.status, 403);
            assert.equal(error.code, "DISTRIBUTOR_UNIT_REQUIRED");
            return true;
        },
    );
});

test("resolveFabricIdentityReference accepts alias MSP mapping for distributor unit", () => {
    const resolved = resolveFabricIdentityReference(
        {
            role: "Distributor",
            mspId: "DistributorMSP",
            distributorUnitId: "dist-unit-hcm",
        },
        {
            ...baseFabricConfig,
            distributorIdentityBridge: {
                ...baseFabricConfig.distributorIdentityBridge,
                units: {
                    "dist-unit-hcm": {
                        ...baseFabricConfig.distributorIdentityBridge.units[
                            "dist-unit-hcm"
                        ],
                        mspId: "DistributorMSP",
                    },
                },
            },
        },
    );

    assert.equal(resolved.mspId, "DistributorMSP");
});
