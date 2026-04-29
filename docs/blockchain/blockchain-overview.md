# Drug Guard — Blockchain Overview

Permissioned Hyperledger Fabric network for pharmaceutical anti-counterfeit supply-chain workflows.

## Key Guarantees

- Immutable batch lifecycle history on ledger.
- Strict on-chain Protected QR metadata validation.
- Confidence-based physical verification evidence recorded on-chain.
- Deterministic submit/evaluate transaction boundary.
- Scripted chaincode lifecycle governance.

---

## MSP Identity Model

| MSP | Role |
|-----|------|
| **RegulatorMSP** | Chaincode lifecycle governance, emergency recall, cross-org monitoring |
| **ManufacturerMSP** | Batch creation, QR binding, document updates, shipment initiation |
| **DistributorMSP** | Batch receipt, ownership continuation, consumption delivery confirmation |
| **Client backends** | Integrate through Fabric Gateway with role-scoped identities |

---

## Directory Layout (Blockchain Scope)

```
blockchain/
├── asset-transfer-drug/
│   ├── chaincode-js/
│   │   ├── lib/
│   │   │   ├── drugTracker.js          # Contract entry point
│   │   │   ├── services/               # Chaincode business logic per domain
│   │   │   ├── repositories/           # Ledger read/write helpers
│   │   │   └── helpers/                # Validation, identity, time utilities
│   │   ├── index.js
│   │   ├── package.json
│   │   └── META-INF/statedb/couchdb/indexes/
│   └── infrastructure/
│       └── canonical/                  # configtx, compose, crypto-config
├── scripts/
│   ├── blockchain/blockchain-run.sh          # Main lifecycle: prereq/full/upgrade/down
│   ├── blockchain/blockchain-smoke-test.sh   # Regression smoke flow
│   └── blockchain/update-code-centralized.sh
├── test-network/
└── .env.example
```

---

## On-Chain API Reference

### Evaluate (read-only, no ledger write)

| Function | Description |
|----------|-------------|
| `BatchExists(batchID)` | Check batch existence |
| `ReadBatch(batchID)` | Read full batch state |
| `EvaluateBatchRisk(batchID)` | Read-only risk snapshot |
| `ReadProtectedQR(batchID)` | Read anchored Protected QR state |
| `VerifyProtectedQR(batchID, tokenDigest)` | Token digest match check |

### Submit (state-changing, writes ledger block)

| Function | Required MSP | Description |
|----------|--------------|-------------|
| `CreateBatchWithExpiry(batchID, drugName, qty, expiry)` | ManufacturerMSP | Create new batch |
| `VerifyBatch(batchID)` | Any | Increment scanCount, update risk status |
| `BindProtectedQR(batchID, ...)` | Owner (Manufacturer) | Anchor QR digest on-chain |
| `RecordProtectedQRVerification(batchID, ...)` | Owner or Regulator | Record physical verification evidence |
| `UpdateDocument(batchID, docType, cid)` | Current owner | Update IPFS CID reference |
| `UpdateProtectedQRTokenPolicy(batchID, ...)` | RegulatorMSP | BLOCKLIST / REVOKE / RESTORE token |
| `ShipBatch(batchID, receiverMSP, ...)` | Current owner | Initiate ownership transfer |
| `ReceiveBatch(batchID, ...)` | targetOwnerMSP | Confirm batch receipt |
| `ConfirmDeliveredToConsumption(batchID)` | DistributorMSP (owner) | Confirm delivery to consumption point |
| `EmergencyRecall(batchID)` | RegulatorMSP | Emergency recall |

---

## Protected QR Metadata Contract — Hex Format

| Field | Length |
|-------|--------|
| `data_hash` | 8 hex chars (4 bytes) |
| `metadata_series` | 16 hex chars (8 bytes) |
| `metadata_issued` | 16 hex chars (8 bytes) |
| `metadata_expiry` | 16 hex chars (8 bytes) |
| `token_digest` | 64 hex chars — `sha256(token)` |

---

## Chaincode Events

| Event | Trigger Condition |
|-------|-------------------|
| `GovMonitor` | scanCount exceeds `warningThreshold`, or scan before consumption is confirmed |
| `PublicAlert` | scanCount exceeds `suspiciousThreshold` |
| `PinningRequest` | Document CID updated — triggers external IPFS pinning workflow |
| `ProtectedQRBound` | Protected QR metadata anchored |
| `ProtectedQRVerificationRecorded` | Physical verification evidence persisted |
| `RecallAlert` | Emergency recall triggered |
| `ProtectedQRTokenPolicyUpdated` | Regulator changed token policy |

---

## Local Operations

### First-time setup

```bash
# From repository root
./scripts/run-all.sh prereq
```

### Start network and deploy chaincode

```bash
./scripts/run-all.sh up
```

### On-chain smoke test

```bash
./scripts/blockchain/blockchain-smoke-test.sh
```

### Upgrade chaincode after changes

```bash
CC_VERSION=1.1 CC_SEQUENCE=2 ./scripts/blockchain/blockchain-run.sh upgrade
./scripts/blockchain/blockchain-smoke-test.sh
```

### Tear down

```bash
./scripts/run-all.sh down
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CHANNEL_NAME` | No | Fabric channel name (default: `mychannel`) |
| `CC_NAME` | No | Chaincode name (default: `drugtracker`) |
| `CC_VERSION` | No | Chaincode version label |
| `CC_SEQUENCE` | No | Lifecycle sequence number |
| `QR_DATA_HASH` | No | Protected QR hash (8 hex) — smoke test input |
| `QR_TOKEN_DIGEST` | No | SHA-256 token digest (64 hex) — smoke test input |

---

## Operational Notes

- Use `submit` for state-changing methods; use `evaluate` for read-only methods.
- Always increment `CC_SEQUENCE` when updating the chaincode definition.
- Keep MSP keys and Fabric wallet material outside source control.
- Smoke test generates a random batch ID — safe to run multiple times.

---

## Troubleshooting

| Symptom | Resolution |
|---------|-----------|
| `peer` binary not found | Run `./scripts/run-all.sh prereq` |
| Lifecycle commit fails | Verify `CC_SEQUENCE` and `CC_VERSION` are incremented |
| Authorization error | Check caller MSP and batch ownership fields |
| QR check fails | Verify hex field lengths; confirm `token_digest` matches anchored digest |
