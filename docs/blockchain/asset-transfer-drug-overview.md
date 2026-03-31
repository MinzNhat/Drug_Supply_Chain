# Drug Supply Chain Blockchain

[![status: stable](https://img.shields.io/badge/status-stable-1f7a1f)](.)
[![scope: anti-counterfeit](https://img.shields.io/badge/scope-anti--counterfeit-2b4c7e)](.)

Standalone Hyperledger Fabric module for pharmaceutical anti-counterfeit workflows.

This repository is intentionally scoped to blockchain only.
External clients should integrate through Fabric Gateway and on-chain contract APIs.

Deep-dive onboarding guide for new developers:

- [ARCHITECTURE_AND_DEV_GUIDE.md](ARCHITECTURE_AND_DEV_GUIDE.md)

## Key Guarantees

- Blockchain runtime is independent from off-chain services.
- Protected QR metadata is validated on-chain with strict hex-size rules.
- Scan verification is ledger-writing (`VerifyBatch` is a submit transaction).
- Physical verification evidence can be anchored on-chain (`RecordProtectedQRVerification`).

## Architecture

- RegulatorMSP: governance, chaincode lifecycle, emergency recall.
- ManufacturerMSP: batch creation, QR binding, document updates, shipping.
- DistributorMSP: receiving and downstream operations.
- Client access is through Fabric Gateway identities.

## Project Layout

```text
asset-transfer-drug/
    chaincode-js/
        lib/drugTracker.js
        META-INF/statedb/couchdb/indexes/indexBatchDocType.json
        package.json
    scripts/
        blockchain-run.sh
        blockchain-smoke-test.sh
        update-code-centralized.sh
        add-org-centralized.sh
    infrastructure/
        canonical/
            configtx/
            compose/
            crypto-config/
            scripts/
    README.md
```

## On-Chain API Overview

### Batch Workflow

- `CreateBatch(batchID, drugName, quantity)`
- `CreateBatchWithExpiry(batchID, drugName, quantity, expiryDate)`
- `ReadBatch(batchID)`
- `VerifyBatch(batchID)`
- `EvaluateBatchRisk(batchID)`
- `UpdateDocument(batchID, docType, newCID)`
- `ShipBatch(batchID, receiverMSP)`
- `ReceiveBatch(batchID)`
- `EmergencyRecall(batchID)`

### Protected QR Workflow

- `BindProtectedQR(batchID, data_hash, metadata_series, metadata_issued, metadata_expiry, token_digest)`
- `ReadProtectedQR(batchID)`
- `VerifyProtectedQR(batchID, token_digest)`
- `RecordProtectedQRVerification(batchID, is_authentic, confidence_score, token_digest)`

## Protected QR Metadata Contract

All fields are required hex strings:

- `data_hash`: 8 hex chars
- `metadata_series`: 16 hex chars
- `metadata_issued`: 16 hex chars
- `metadata_expiry`: 16 hex chars
- `token_digest`: 64 hex chars (`sha256(token)`)

On-chain verification policy defaults:

- `authentic_threshold`: `0.70`
- `fake_threshold`: `0.55`

`RecordProtectedQRVerification` computes verdict:

- `AUTHENTIC` when `is_authentic=true` and `confidence_score > 0.70`
- `FAKE` when `is_authentic=false` and `confidence_score < 0.55`
- `REVIEW_REQUIRED` otherwise

## Submit vs Evaluate Matrix

Use `submitTransaction` for:

- `CreateBatch*`
- `VerifyBatch`
- `UpdateDocument`
- `ShipBatch`
- `ReceiveBatch`
- `EmergencyRecall`
- `BindProtectedQR`
- `RecordProtectedQRVerification`

Use `evaluateTransaction` for:

- `ReadBatch`
- `EvaluateBatchRisk`
- `ReadProtectedQR`
- `VerifyProtectedQR`

## Chaincode Events

- `GovMonitor`
- `PublicAlert`
- `PinningRequest`
- `ProtectedQRBound`
- `ProtectedQRVerificationRecorded`

## Quick Start (Blockchain Only)

### Prerequisites

- Docker + Docker Compose
- Hyperledger Fabric test-network dependencies

### Install Fabric binaries/images

```bash
cd Drug_Chain
./scripts/blockchain/blockchain-run.sh prereq
```

### Start network and deploy chaincode

```bash
cd Drug_Chain
./scripts/blockchain/blockchain-run.sh full
```

### Run smoke test

```bash
cd Drug_Chain
./scripts/blockchain/blockchain-smoke-test.sh
```

### Stop network

```bash
cd Drug_Chain
./scripts/blockchain/blockchain-run.sh down
```

## Upgrade Chaincode

```bash
cd Drug_Chain
CC_VERSION=2.0 CC_SEQUENCE=2 ./scripts/blockchain/blockchain-run.sh upgrade
./scripts/blockchain/blockchain-smoke-test.sh
```

Rules:

- Always increment `CC_SEQUENCE` for each definition update.
- Never reuse one version label for different source content.
- `INSTALL_ORGS` auto-detects available peers (includes Org3 when present).
- `COMMIT_ORGS` automatically includes `REGULATOR_ORG` if omitted.

## Add New Organization

```bash
cd Drug_Chain
NEW_ORG_MSP=DistributorMSP \
NEW_ORG_NUMBER=3 \
NEW_ORG_JSON=blockchain/test-network/organizations/peerOrganizations/org3.example.com/org3.json \
./scripts/blockchain/add-org-centralized.sh
```

## Common Gateway Operations (Read And Take Over)

Use these examples from any Fabric Gateway client.

### 1) Read Batch Data (Read-Only)

```javascript
const batchJson = await contract.evaluateTransaction("ReadBatch", batchId);
const batch = JSON.parse(batchJson.toString());
console.log(batch.ownerMSP, batch.status, batch.transferStatus);
```

### 2) Transfer Ownership (Take Over)

Ownership transfer is a two-step flow:

1. Current owner submits `ShipBatch(batchID, receiverMSP)`.
2. Target owner submits `ReceiveBatch(batchID)`.

```javascript
// Step A: called by current owner identity
await contract.submitTransaction("ShipBatch", batchId, "DistributorMSP");

// Step B: called by target owner identity
await contract.submitTransaction("ReceiveBatch", batchId);
```

Quick validation:

```javascript
const updated = await contract.evaluateTransaction("ReadBatch", batchId);
const state = JSON.parse(updated.toString());
// Expect: state.ownerMSP = DistributorMSP, state.transferStatus = NONE
```

Transfer preconditions enforced by chaincode:

- `ShipBatch`: caller must be current owner, batch must be `ACTIVE`, and `transferStatus` must be `NONE`.
- `ReceiveBatch`: caller must match `targetOwnerMSP`, and batch must be `IN_TRANSIT`.

## Client Integration Contract

Implement a Fabric Gateway client and follow the transaction matrix in this document.

Recommended public scan flow:

1. Client computes `token_digest = sha256(token)` from off-chain verification output.
2. Client evaluates `VerifyProtectedQR` against the digest.
3. Client submits `RecordProtectedQRVerification` with confidence result.
4. Client submits `VerifyBatch` to update scan telemetry and eventing.
5. Client returns combined decision to the caller.

## Security and Operations

- Keep wallet keys outside repository.
- Use TLS and rate limiting at API gateway level.
- Store event offsets/checkpoints in gateway workers.
- Monitor chaincode invoke failures and event lag.

## Canonical Infrastructure Bundle

Canonical deployment artifacts are available under `infrastructure/canonical`.

```bash
cd Drug_Chain/asset-transfer-drug
./infrastructure/canonical/scripts/canonical_bootstrap.sh validate
./infrastructure/canonical/scripts/canonical_bootstrap.sh generate
docker compose -f infrastructure/canonical/compose/compose-canonical.yaml up -d
```

## Deployment (Docker)

For a root-level Docker workflow similar to standard GitHub service templates:

```bash
cd Drug_Chain/asset-transfer-drug
./infrastructure/canonical/scripts/canonical_bootstrap.sh generate
cd ..
docker compose up -d
```

This uses the top-level `docker-compose.yml` as a convenience entrypoint.

## Environment Variables

See root [.env.example](../.env.example).

| Name                  | Required | Description                                        |
| --------------------- | -------- | -------------------------------------------------- |
| `CHANNEL_NAME`        | No       | Fabric channel name used by scripts.               |
| `CC_NAME`             | No       | Chaincode name.                                    |
| `CC_VERSION`          | No       | Chaincode version label.                           |
| `CC_SEQUENCE`         | No       | Chaincode definition sequence.                     |
| `INSTALL_ORGS`        | No       | Install targets; auto-detected by default.         |
| `COMMIT_ORGS`         | No       | Commit targets; regulator org auto-enforced.       |
| `REGULATOR_ORG`       | No       | Governance org id used for approve/commit caller.  |
| `VERIFY_TIMES`        | No       | Number of verification iterations in smoke test.   |
| `QR_DATA_HASH`        | No       | Protected QR data hash (8 hex).                    |
| `QR_METADATA_SERIES`  | No       | Protected QR series metadata (16 hex).             |
| `QR_METADATA_ISSUED`  | No       | Protected QR issued metadata (16 hex).             |
| `QR_METADATA_EXPIRY`  | No       | Protected QR expiry metadata (16 hex).             |
| `QR_TOKEN_DIGEST`     | No       | Anchored SHA-256 digest (64 hex).                  |
| `QR_IS_AUTHENTIC`     | No       | Physical verification authenticity flag.           |
| `QR_CONFIDENCE_SCORE` | No       | Physical verification confidence score in `[0,1]`. |

## Troubleshooting

- If `peer` binary is missing, run `./scripts/blockchain/blockchain-run.sh prereq`.
- If lifecycle commit fails, increase `CC_SEQUENCE` and retry.
- If smoke test fails due existing default batch ID, rerun (script auto-suffixes).
- If canonical compose fails, ensure `canonical_bootstrap.sh generate` was run first.

## Bug Reports

Found a bug? Please open an issue at [GitHub Issues](https://github.com/MinzNhat/Drug_Chain/issues/new).

## Feature Requests

Have an idea for a new feature? Submit it at [GitHub Issues](https://github.com/MinzNhat/Drug_Chain/issues/new).

## License

This project is licensed under the Apache-2.0 License - see `docs/legal/blockchain-license.txt` for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/MinzNhat/Drug_Chain/issues)
- **Discussions**: [GitHub Discussions](https://github.com/MinzNhat/Drug_Chain/discussions)
- **Email**: nhat.dang2004.cv@gmail.com
