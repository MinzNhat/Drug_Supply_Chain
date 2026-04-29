import assert from "node:assert/strict";
import test from "node:test";
import { resolveFabricIdentityReference } from "../../src/integrations/fabric/fabric-identity-resolver.js";

/**
 * Integration coverage for Distributor unit -> Fabric identity bridge mapping.
 */

const fabricConfig = {
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
                identityLabel: "Distributor Unit HCM",
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

test("integration: distributor unit maps to dedicated fabric identity", () => {
    const identity = resolveFabricIdentityReference(
        {
            role: "Distributor",
            mspId: "DistributorMSP",
            distributorUnitId: "DIST-UNIT-HCM",
        },
        fabricConfig,
    );

    assert.equal(identity.sessionKey, "distributor-unit:dist-unit-hcm");
    assert.equal(identity.identityLabel, "Distributor Unit HCM");
    assert.equal(identity.source, "distributor-unit");
    assert.equal(identity.certPath, "/tmp/distributor/hcm/signcert.pem");
});

test("integration: distributor unit mapping rejects unauthorized unit", () => {
    assert.throws(
        () =>
            resolveFabricIdentityReference(
                {
                    role: "Distributor",
                    mspId: "DistributorMSP",
                    distributorUnitId: "dist-unit-hn",
                },
                fabricConfig,
            ),
        (error) => {
            assert.equal(error.status, 403);
            assert.equal(error.code, "DISTRIBUTOR_UNIT_NOT_AUTHORIZED");
            return true;
        },
    );
});

test("integration: distributor mapping rejects missing unit when required", () => {
    assert.throws(
        () =>
            resolveFabricIdentityReference(
                {
                    role: "Distributor",
                    mspId: "DistributorMSP",
                },
                fabricConfig,
            ),
        (error) => {
            assert.equal(error.status, 403);
            assert.equal(error.code, "DISTRIBUTOR_UNIT_REQUIRED");
            return true;
        },
    );
});

