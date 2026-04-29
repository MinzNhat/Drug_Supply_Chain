# Blockchain Architecture and Developer Guide

This guide explains:

- How the blockchain component runs and where it executes.
- How data is stored, structured, and updated on-chain.
- What every significant file and chaincode function does.
- End-to-end transaction flows.
- Local development checklist.

---

## 1. Mental Model: Fabric in 90 Seconds

Think of this project as a shared, permissioned database with immutable history.

- **Permissioned**: only known organizations can write transactions.
- **Immutable history**: every write is stored in blocks and cannot be rewritten.
- **World state**: a fast key-value snapshot of the latest values.
- **Chaincode**: the business logic layer that validates and applies writes.

In this project, the primary ledger key is `batchID`, and each value is a JSON batch record.

---

## 2. Runtime: Where the Project Executes

When running locally, components execute as Docker containers via the test-network:

- **Orderer**: sequences transactions into blocks.
- **Peers**: endorse and commit transactions.
- **Chaincode container**: hosts the Node.js contract at runtime.

Local binaries used by scripts: `peer`, `configtxgen`, `cryptogen`, `jq`.

---

## 3. Repository Structure

```
blockchain/asset-transfer-drug/
├── chaincode-js/
│   ├── lib/
│   │   ├── drugTracker.js              # Contract entry point (delegates to services)
│   │   ├── services/
│   │   │   ├── batchService.js         # Batch CRUD and risk escalation
│   │   │   ├── protectedQrService.js   # QR binding, verification, token policy
│   │   │   ├── transferService.js      # Ship/receive ownership transfer
│   │   │   ├── documentService.js      # IPFS CID document updates
│   │   │   └── recallService.js        # Emergency recall
│   │   ├── repositories/
│   │   │   └── batchRepository.js      # getBatchOrThrow, putBatch, batchExists
│   │   ├── helpers/
│   │   │   ├── identity.js             # MSP resolution and role checks
│   │   │   ├── validation.js           # Input sanitizers and hex validators
│   │   │   └── time.js                 # Fabric timestamp → ISO
│   │   └── drugTracker.constants.js    # Verification policy defaults
│   ├── index.js                        # Chaincode export entrypoint
│   ├── package.json
│   └── META-INF/statedb/couchdb/indexes/indexBatchDocType.json
└── infrastructure/canonical/          # configtx, compose, crypto-config
```

---

## 4. Data Model: What Is Stored On-Chain

### Primary record: Batch

```json
{
  "docType": "batch",
  "batchID": "BATCH_001",
  "drugName": "Paracetamol 500mg",
  "manufacturerMSP": "ManufacturerMSP",
  "ownerMSP": "DistributorMSP",
  "expiryDate": "2027-12-31",
  "totalSupply": 10000,
  "scanCount": 42,
  "warningThreshold": 10500,
  "suspiciousThreshold": 11000,
  "status": "ACTIVE",
  "consumptionConfirmed": false,
  "consumptionConfirmedAt": "",
  "consumptionConfirmedByMSP": "",
  "transferStatus": "NONE",
  "targetOwnerMSP": "",
  "ownerUnitId": "",
  "targetOwnerUnitId": "",
  "transferHistory": [],
  "documents": {
    "packageImage": { "currentCID": "", "lastUpdated": "", "pinned": false, "history": [] },
    "qualityCert":  { "currentCID": "", "lastUpdated": "", "pinned": true,  "history": [] }
  },
  "protected_qr": {
    "data_hash": "a1b2c3d4",
    "metadata_series": "1234567890abcdef",
    "metadata_issued": "0011223344556677",
    "metadata_expiry": "8899aabbccddeeff",
    "token_digest": "<64-hex>",
    "verification_policy": { "authentic_threshold": 0.70, "fake_threshold": 0.55 },
    "verification_history": [],
    "token_policy": { "status": "ACTIVE", ... }
  }
}
```

---

## 5. Storage Semantics

- **Submit** call: appends an immutable transaction to a block AND updates the world state key-value snapshot.
- **Evaluate** call: reads peer world state only — no block write, no state mutation.

---

## 6. Chaincode Function Reference

### 6.1 Batch APIs

| Function | Type | Access | Description |
|----------|------|--------|-------------|
| `CreateBatchWithExpiry` | Submit | ManufacturerMSP | Create new batch with expiry date |
| `ReadBatch` | Evaluate | Any | Read full batch state |
| `BatchExists` | Evaluate | Any | Existence check |
| `VerifyBatch` | Submit | Any | Increment `scanCount`, escalate risk status, emit events |
| `EvaluateBatchRisk` | Evaluate | Any | Read-only risk snapshot |
| `ConfirmDeliveredToConsumption` | Submit | DistributorMSP (owner) | Allow scan growth before public consumption |

### 6.2 Protected QR APIs

| Function | Type | Access | Description |
|----------|------|--------|-------------|
| `BindProtectedQR` | Submit | Owner (Manufacturer) | Anchor hex metadata and token digest |
| `ReadProtectedQR` | Evaluate | Any | Read anchored QR state |
| `VerifyProtectedQR` | Evaluate | Any | Read-only digest match + policy check |
| `RecordProtectedQRVerification` | Submit | Owner or Regulator | Persist physical verification evidence |
| `UpdateProtectedQRTokenPolicy` | Submit | RegulatorMSP | BLOCKLIST / REVOKE / RESTORE token digest |

### 6.3 Transfer APIs

| Function | Type | Access | Description |
|----------|------|--------|-------------|
| `ShipBatch` | Submit | Current owner | Mark batch IN_TRANSIT to new MSP |
| `ReceiveBatch` | Submit | targetOwnerMSP | Confirm receipt, update ownership |

### 6.4 Document and Recall APIs

| Function | Type | Access | Description |
|----------|------|--------|-------------|
| `UpdateDocument` | Submit | Current owner | Update IPFS CID; emit `PinningRequest` |
| `EmergencyRecall` | Submit | RegulatorMSP | Set status to RECALLED; emit `RecallAlert` |

---

## 7. Risk Escalation Logic

`VerifyBatch` applies the following state machine on each scan:

```
scanCount++

if status == RECALLED         → verificationResult = DANGER_RECALLED
if status == SUSPICIOUS       → verificationResult = DANGER_FAKE
if scanCount > suspiciousThreshold → status = SUSPICIOUS; emit PublicAlert
elif scanCount > warningThreshold  → status = WARNING;    emit GovMonitor
if !consumptionConfirmed           → emit GovMonitor(code=WARN_UNCONFIRMED_CONSUMPTION)

verificationResult = SAFE (unless RECALLED or SUSPICIOUS)
```

`warningThreshold = ceil(totalSupply × 1.05)`
`suspiciousThreshold = ceil(totalSupply × 1.10)`

---

## 8. Chaincode Events

| Event | Trigger |
|-------|---------|
| `GovMonitor` | Warning threshold exceeded, or scan before consumption confirmation |
| `PublicAlert` | Suspicious threshold exceeded |
| `PinningRequest` | Document CID updated |
| `ProtectedQRBound` | QR metadata anchored |
| `ProtectedQRVerificationRecorded` | Physical evidence persisted |
| `RecallAlert` | Emergency recall |
| `ProtectedQRTokenPolicyUpdated` | Token policy changed by regulator |

---

## 9. End-to-End Transaction Flows

### Flow A — Batch Creation
1. Submit `CreateBatchWithExpiry` as ManufacturerMSP.
2. Chaincode validates role, quantity, and expiry format.
3. Batch is persisted under `batchID`.

### Flow B — Public Scan
1. Submit `VerifyBatch`.
2. `scanCount` increments.
3. Status and events update per threshold logic.

### Flow C — Protected QR Anchoring
1. Submit `BindProtectedQR` with strict hex fields.
2. Digest and metadata stored in `protected_qr`.
3. Event `ProtectedQRBound` emitted.

### Flow D — QR Digest Verification
1. Evaluate `VerifyProtectedQR`.
2. Provided digest compared to anchored digest.
3. Token policy checked (BLOCKLIST/REVOKE state blocks match).

### Flow E — Physical Verification Evidence
1. Submit `RecordProtectedQRVerification`.
2. Access, digest, score validated.
3. Verdict computed and appended to `verification_history`.

### Flow F — Transfer Lifecycle
1. Submit `ShipBatch` from current owner (sets IN_TRANSIT).
2. Submit `ReceiveBatch` by target owner (updates ownership).
3. `transferHistory` records each hop with unit-level traceability.

### Flow G — Emergency Recall
1. Submit `EmergencyRecall` as RegulatorMSP.
2. Batch status forced to `RECALLED`.
3. `RecallAlert` event emitted.

---

## 10. Submit vs Evaluate Reference

**Submit** (writes ledger block):
`CreateBatchWithExpiry`, `VerifyBatch`, `BindProtectedQR`, `RecordProtectedQRVerification`,
`UpdateDocument`, `UpdateProtectedQRTokenPolicy`, `ShipBatch`, `ReceiveBatch`,
`ConfirmDeliveredToConsumption`, `EmergencyRecall`

**Evaluate** (read-only, no block write):
`BatchExists`, `ReadBatch`, `EvaluateBatchRisk`, `ReadProtectedQR`, `VerifyProtectedQR`

---

## 11. Local Development Checklist

```bash
# Step 1 — Install prerequisites (first time)
./scripts/run-all.sh prereq

# Step 2 — Start network and deploy chaincode
./scripts/run-all.sh up

# Step 3 — Run full smoke flow
./scripts/blockchain/blockchain-smoke-test.sh

# Step 4 — Modify chaincode source
# Edit: blockchain/asset-transfer-drug/chaincode-js/lib/services/

# Step 5 — Run unit tests
cd blockchain/asset-transfer-drug/chaincode-js
node --test test/*.test.js

# Step 6 — Upgrade deployed chaincode
CC_VERSION=1.1 CC_SEQUENCE=2 ./scripts/blockchain/blockchain-run.sh upgrade
./scripts/blockchain/blockchain-smoke-test.sh

# Step 7 — Tear down
./scripts/run-all.sh down
```

---

## 12. Troubleshooting

| Symptom | Resolution |
|---------|-----------|
| `peer` binary not found | Run `./scripts/run-all.sh prereq` |
| Lifecycle commit fails | Verify `CC_SEQUENCE` and `CC_VERSION` are incremented |
| Authorization error | Check caller MSP and current batch `ownerMSP` |
| QR digest check fails | Validate hex field lengths; confirm `sha256(token)` matches anchored digest |
| Smoke test batch ID conflict | Script auto-generates unique IDs — check logs for the actual ID used |

---

## 13. Definition of Done for Chaincode Changes

- `blockchain-run.sh full` succeeds end-to-end.
- `blockchain-smoke-test.sh` passes all assertions.
- `node --test test/*.test.js` passes all unit tests.
- Protected QR digest match is `true` for a valid payload.
- Documentation updated for any contract function change.
