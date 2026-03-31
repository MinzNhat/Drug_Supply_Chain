# Blockchain Architecture And Developer Guide

What this guide explains:

- How this blockchain project runs.
- Where it runs (containers, binaries, scripts).
- How data is stored and updated.
- What every important file does.
- What every chaincode function does.
- End-to-end transaction flows.
- Fast local checklist to continue development safely.

## 1) Mental Model: Fabric in 90 Seconds

Think of this project as a shared, permissioned database with immutable history.

- **Permissioned**: only known organizations can write transactions.
- **Immutable history**: every write is stored in blocks and cannot be rewritten.
- **World state**: a fast key-value snapshot for latest values.
- **Chaincode**: business logic that validates and applies writes.

In this project, the primary key is `batchID`, and each value is a JSON batch record.

## 2) Runtime: Where the Project Executes

When running locally, components execute as Docker containers (via test-network):

- **Orderer**: orders transactions into blocks.
- **Peer**: endorses and commits transactions.
- **Chaincode container**: hosts the Node.js contract at runtime.
- **CA (optional flow)**: identity enrollment/signing in some topologies.

Local binaries used by scripts:

- `peer`, `configtxgen`, `configtxlator`, `cryptogen`, `jq`.

## 3) Repository Structure (Blockchain Scope)

- `chaincode-js/lib/drugTracker.js`
    - Main smart contract implementation.
- `chaincode-js/index.js`
    - Contract export entrypoint for Fabric chaincode runtime.
- `chaincode-js/package.json`
    - Node.js dependencies for chaincode.
- `chaincode-js/META-INF/statedb/couchdb/indexes/indexBatchDocType.json`
    - CouchDB index definition for efficient state queries.
- `scripts/blockchain/blockchain-run.sh`
    - Main operational script: prereq/up/deploy/upgrade/down.
- `scripts/blockchain/blockchain-smoke-test.sh`
    - End-to-end smoke flow for regression checks.
- `scripts/blockchain/update-code-centralized.sh`
    - Chaincode lifecycle flow (package/install/approve/commit).
- `scripts/blockchain/add-org-centralized.sh`
    - Dynamic organization add-on to channel config.
- `infrastructure/canonical/configtx/configtx.yaml`
    - Canonical policy/topology config profile.
- `infrastructure/canonical/compose/compose-canonical.yaml`
    - Canonical Docker topology.
- `infrastructure/canonical/scripts/canonical_bootstrap.sh`
    - Canonical artifact generation and validation.

## 4) Data Model: What Is Stored On-Chain

Primary ledger record: **Batch**

Core fields:

- `docType`
- `batchID`
- `drugName`
- `manufacturerMSP`
- `ownerMSP`
- `expiryDate`
- `totalSupply`
- `scanCount`
- `warningThreshold`
- `suspiciousThreshold`
- `status`
- `documents` (package image and quality certificate CIDs)
- `targetOwnerMSP`
- `transferStatus`
- `transferHistory`
- `protected_qr`

`protected_qr` fields:

- `data_hash` (8 hex)
- `metadata_series` (16 hex)
- `metadata_issued` (16 hex)
- `metadata_expiry` (16 hex)
- `token_digest` (64 hex)
- `last_bound_at`
- `bound_by`
- `history`
- `verification_policy`
- `verification_history`

## 5) Storage Semantics: How Data Persists

Each `submit` call does two things:

1. Appends immutable transaction history to blockchain blocks.
2. Updates world state key-value snapshot for fast reads.

Each `evaluate` call:

- Reads peer state only, no block write, no state mutation.

## 6) Chaincode Function-by-Function Explanation

File: `chaincode-js/lib/drugTracker.js`

### 6.1 Validation and Normalization Helpers

- `_requireNonEmptyString(value, fieldName)`
    - Ensures required fields are present.
- `_requireOptionalString(value)`
    - Converts nullable values to empty string.
- `_assertHex(value, expectedLength, fieldName)`
    - Enforces fixed-length hexadecimal contract.
- `_parseBoolean(value, fieldName)`
    - Parses `true/false/1/0`.
- `_parseConfidenceScore(value)`
    - Parses and validates score in `[0,1]`.

### 6.2 Identity and Organization Helpers

- `_getClientMSP(ctx)`
    - Gets caller MSP.
- `_toCanonicalMSP(mspID)`
    - Maps aliases (`Org1MSP`) to canonical roles (`RegulatorMSP`).
- `_isCanonicalMSP(mspID, targetCanonical)`
    - Checks canonical role.
- `_sameMSP(mspA, mspB)`
    - Compares MSPs after canonical mapping.
- `_isOwnerOrRegulator(clientOrgID, batch)`
    - Access control helper for specific write operations.

### 6.3 Time, Policy, and Defaulting Helpers

- `_getTimestampISO(ctx)`
    - Converts Fabric tx timestamp to ISO string.
- `_normalizeExpiryDate(expiryDate)`
    - Validates optional expiry date.
- `_normalizeProtectedQrPolicy(policy)`
    - Applies/validates QR verification thresholds.
- `_buildProtectedQrDefaults(protectedQrState)`
    - Ensures complete `protected_qr` object structure.
- `_ensureBatchDefaults(batch)`
    - Migrates/normalizes batch state consistently.
- `_evaluateRisk(batch)`
    - Computes batch risk level from status and scan volume.
- `_evaluateProtectedQrVerdict(isAuthentic, confidenceScore, verificationPolicy)`
    - Computes `AUTHENTIC`/`FAKE`/`REVIEW_REQUIRED`.
- `_buildDefaultBatch(...)`
    - Constructs initial batch state.

### 6.4 Ledger Read/Write Helpers

- `_getBatchOrThrow(ctx, batchID)`
    - Loads batch state or throws if missing.
- `_putBatch(ctx, batchID, batch)`
    - Writes normalized batch state.

### 6.5 Public Contract API

#### Existence and Read APIs

- `BatchExists(ctx, batchID)`
    - Read-only existence check.
    - **Type**: evaluate.

- `ReadBatch(ctx, batchID)`
    - Read full batch payload.
    - **Type**: evaluate.

#### Batch Creation APIs

- `CreateBatch(ctx, batchID, drugName, quantityStr)`
    - Creates batch without expiry.
    - Manufacturer role required.
    - **Type**: submit.

- `CreateBatchWithExpiry(ctx, batchID, drugName, quantityStr, expiryDate)`
    - Creates batch with expiry validation.
    - Manufacturer role required.
    - **Type**: submit.

#### Scan and Risk APIs

- `VerifyBatch(ctx, batchID)`
    - Increments `scanCount`.
    - Updates status with thresholds (`WARNING`, `SUSPICIOUS`).
    - Emits risk events.
    - **Type**: submit.

- `EvaluateBatchRisk(ctx, batchID)`
    - Returns read-only risk snapshot.
    - **Type**: evaluate.

#### Document API

- `UpdateDocument(ctx, batchID, docType, newCID)`
    - Current owner updates CID and keeps history.
    - Emits `PinningRequest`.
    - **Type**: submit.

#### Protected QR APIs

- `BindProtectedQR(ctx, batchID, data_hash, metadata_series, metadata_issued, metadata_expiry, token_digest)`
    - Anchors strict metadata and digest.
    - Current owner required.
    - Emits `ProtectedQRBound`.
    - **Type**: submit.

- `ReadProtectedQR(ctx, batchID)`
    - Reads anchored Protected QR state.
    - **Type**: evaluate.

- `VerifyProtectedQR(ctx, batchID, token_digest)`
    - Read-only digest match check.
    - Returns policy and compatibility aliases.
    - **Type**: evaluate.

- `RecordProtectedQRVerification(ctx, batchID, is_authentic, confidence_score, token_digest)`
    - Persists physical verification evidence.
    - Owner or Regulator required.
    - Digest must match anchored digest.
    - Computes verdict from thresholds.
    - Emits `ProtectedQRVerificationRecorded`.
    - **Type**: submit.

#### Transfer and Recall APIs

- `ShipBatch(ctx, batchID, receiverMSP)`
    - Marks batch as in transit.
    - Current owner required.
    - **Type**: submit.

- `ReceiveBatch(ctx, batchID)`
    - Target owner confirms receipt.
    - Updates owner and transfer history.
    - **Type**: submit.

- `EmergencyRecall(ctx, batchID)`
    - Regulator-only recall action.
    - Sets status to `RECALLED`.
    - **Type**: submit.

## 7) Events and Their Purpose

- `GovMonitor`
    - Soft warning threshold reached.
- `PublicAlert`
    - Suspicious threshold reached.
- `PinningRequest`
    - Document CID changed; external pinning workflow can react.
- `ProtectedQRBound`
    - Protected QR metadata was anchored.
- `ProtectedQRVerificationRecorded`
    - Physical QR evidence was persisted.

## 8) End-to-End Blockchain Flows

### Flow A: Batch Creation

1. Submit `CreateBatch` or `CreateBatchWithExpiry`.
2. Chaincode validates role and inputs.
3. Batch is persisted under `batchID`.

### Flow B: Scan Verification

1. Submit `VerifyBatch`.
2. `scanCount` increments.
3. Status/events update by threshold logic.

### Flow C: Protected QR Anchoring

1. Submit `BindProtectedQR` with strict hex fields.
2. Chaincode stores digest and metadata.
3. Event `ProtectedQRBound` emitted.

### Flow D: Digest Consistency Check

1. Evaluate `VerifyProtectedQR`.
2. Compare provided digest to anchored digest.
3. Receive deterministic match result.

### Flow E: Physical Verification Evidence

1. Submit `RecordProtectedQRVerification`.
2. Access, digest, and score are validated.
3. Verdict is computed and appended to history.

### Flow F: Transfer Lifecycle

1. Submit `ShipBatch` from current owner.
2. Submit `ReceiveBatch` by target owner.
3. Ownership and history are updated.

### Flow G: Emergency Recall

1. Submit `EmergencyRecall` as Regulator.
2. Batch status is forced to `RECALLED`.

## 9) Script-by-Script Operational Explanation

### `scripts/blockchain/blockchain-run.sh`

Key functions:

- `install_prereqs`: installs required binaries/images.
- `check_prereqs`: enforces runtime dependencies.
- `up_channel`: starts network and creates channel.
- `deploy_chaincode`: triggers lifecycle deployment script.
- `upgrade_chaincode`: redeploys new sequence/version.
- `down_network`: tears down network containers/resources.

### `scripts/blockchain/blockchain-smoke-test.sh`

Runs full blockchain regression sequence:

1. Create batch.
2. Verify scan multiple times.
3. Bind Protected QR metadata.
4. Verify digest read-only.
5. Record physical verification evidence.
6. Update document.
7. Ship batch.
8. Receive batch (if org3 exists).

Then asserts:

- `scanCount` equals `VERIFY_TIMES` (if enabled).
- `protected_qr.verification_history` has at least one record.

### `scripts/blockchain/update-code-centralized.sh`

Lifecycle flow:

1. Package chaincode.
2. Install on selected orgs.
3. Resolve package ID.
4. Approve definition.
5. Check commit readiness.
6. Commit definition.
7. Query committed definition.

### `scripts/blockchain/add-org-centralized.sh`

Channel config update flow:

1. Fetch current channel config.
2. Merge new org definition.
3. Build config update envelope.
4. Sign as regulator org.
5. Submit channel update.
6. Optional join and anchor steps.

## 10) Submit vs Evaluate (Critical Rule)

Submit (writes ledger):

- `CreateBatch`
- `CreateBatchWithExpiry`
- `VerifyBatch`
- `UpdateDocument`
- `BindProtectedQR`
- `RecordProtectedQRVerification`
- `ShipBatch`
- `ReceiveBatch`
- `EmergencyRecall`

Evaluate (read-only):

- `BatchExists`
- `ReadBatch`
- `EvaluateBatchRisk`
- `ReadProtectedQR`
- `VerifyProtectedQR`

## 11) Fast Local Checklist (Continue Development)

### Step 1: Install prerequisites

```bash
cd Drug_Chain
./scripts/blockchain/blockchain-run.sh prereq
```

### Step 2: Start network and deploy chaincode

```bash
cd Drug_Chain
./scripts/blockchain/blockchain-run.sh full
```

### Step 3: Run full smoke flow

```bash
cd Drug_Chain
./scripts/blockchain/blockchain-smoke-test.sh
```

### Step 4: Modify chaincode

Edit:

- `chaincode-js/lib/drugTracker.js`

### Step 5: Upgrade after changes

```bash
cd Drug_Chain
CC_VERSION=2.0 CC_SEQUENCE=2 ./scripts/blockchain/blockchain-run.sh upgrade
./scripts/blockchain/blockchain-smoke-test.sh
```

### Step 6: Stop network

```bash
cd Drug_Chain
./scripts/blockchain/blockchain-run.sh down
```

## 12) Debug Checklist

If authorization fails:

- Check caller MSP and ownership fields.

If QR checks fail:

- Validate strict hex lengths.
- Verify `token_digest` equals anchored digest.

If smoke test fails:

- Confirm network is up.
- Confirm chaincode sequence/version was committed.
- Re-run with fresh batch ID (script auto-suffixes when needed).

## 13) Definition of Done for Blockchain Changes

- `blockchain-run.sh full` succeeds.
- `blockchain-smoke-test.sh` succeeds.
- Protected QR digest match is true for valid payload.
- Verification history receives persisted records.
- Documentation is updated for any contract change.
