# Supply Chain Flow Conformance Matrix

Reference model: 3 phases from provided supply-chain diagram.

## Phase 1: Production And Protection

| Diagram Step | Current Implementation | Status |
| --- | --- | --- |
| Input drug batch info | `POST /api/v1/batches` accepts product + quantity + expiry | Implemented |
| Generate protected QR | Backend calls Protected QR `/api/v1/qr/generate` | Implemented |
| Print and attach QR | Outside system boundary (physical process) | Operational process |
| Producer signs transaction | Fabric client identity signs submit via Gateway | Implemented |
| Submit signed data | Backend submits `CreateBatchWithExpiry` and `BindProtectedQR` | Implemented |
| Upload metadata/IPFS | `POST /api/v1/batches/:batchId/documents` updates CID metadata | Implemented (manual CID workflow) |
| Record on blockchain | Chaincode stores batch + protected_qr state | Implemented |

## Phase 2: Handover And Ownership Transfer

| Diagram Step | Current Implementation | Status |
| --- | --- | --- |
| Scan QR at handover point | `POST /api/v1/verify` | Implemented |
| Verify integrity and status | Protected QR + `VerifyProtectedQR` + `VerifyBatch` | Implemented |
| Block transfer when invalid | API returns `SCAN_REJECTED` | Implemented |
| Input receiver + sign | `POST /api/v1/batches/:batchId/ship` with authenticated owner | Implemented |
| Transfer ownership complete | `POST /api/v1/batches/:batchId/receive` by target owner | Implemented |

## Phase 3: Multi-Factor Verification

| Diagram Step | Current Implementation | Status |
| --- | --- | --- |
| Scan QR and capture package image | `image` required, `packagingImage` optional in verify endpoint | Implemented |
| Parse token and image | Token parsing implemented; package image adapter path added | Partially implemented |
| Layer 1 digital integrity | Protected QR + on-chain checks | Implemented |
| Layer 2 physical AI integrity | Optional adapter in backend (`AI_VERIFICATION_*`) | Adapter ready |
| Aggregate decision | Backend merges QR, ledger, and AI adapter result | Implemented |
| Fraud warning and alerting | Canonical taxonomy mapper + alert archive + regulator alert/report APIs + baseline report sink adapter (`logger`) | Implemented (baseline) |

## Gap Summary

1. AI service itself is not bundled in this workspace. Adapter contract is ready.
2. Automated counterfeit alert delivery pipeline (email/SIEM/case mgmt with retry/dead-letter) is not yet implemented.
3. IPFS pinning automation is not yet integrated; CID update endpoint is available.
