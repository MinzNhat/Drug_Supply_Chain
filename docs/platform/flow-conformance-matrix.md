# Supply Chain Flow Conformance Matrix

Reference model: 3 phases from provided supply-chain diagram.

## Phase 1: Production And Protection

| Diagram Step               | Current Implementation                                         | Status                            |
| -------------------------- | -------------------------------------------------------------- | --------------------------------- |
| Input drug batch info      | `POST /api/v1/batches` accepts product + quantity + expiry     | Implemented                       |
| Generate protected QR      | Backend calls Protected QR `/api/v1/qr/generate`               | Implemented                       |
| Print and attach QR        | Outside system boundary (physical process)                     | Operational process               |
| Producer signs transaction | Fabric client identity signs submit via Gateway                | Implemented                       |
| Submit signed data         | Backend submits `CreateBatchWithExpiry` and `BindProtectedQR`  | Implemented                       |
| Upload metadata/IPFS       | `POST /api/v1/batches/:batchId/documents` supports legacy CID and direct upload -> CID binding | Implemented |
| Record on blockchain       | Chaincode stores batch + protected_qr state                    | Implemented                       |

## Phase 2: Handover And Ownership Transfer

| Diagram Step                | Current Implementation                                        | Status      |
| --------------------------- | ------------------------------------------------------------- | ----------- |
| Scan QR at handover point   | `POST /api/v1/verify`                                         | Implemented |
| Verify integrity and status | Protected QR + `VerifyProtectedQR` + token policy (`BLOCKLIST/REVOKE/RESTORE`) + `VerifyBatch` | Implemented |
| Confirm delivered to consumption point | `POST /api/v1/batches/:batchId/confirm-delivered-to-consumption` (Distributor owner) | Implemented |
| Block transfer when invalid | API returns `SCAN_REJECTED`                                   | Implemented |
| Input receiver + sign       | `POST /api/v1/batches/:batchId/ship` with authenticated owner and optional `targetDistributorUnitId` | Implemented |
| Transfer ownership complete | `POST /api/v1/batches/:batchId/receive` by target owner with unit-target validation when present | Implemented |

## Phase 3: Multi-Factor Verification

| Diagram Step                      | Current Implementation                                                                                                                    | Status                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Scan QR and capture package image | `image` required, `packagingImage` optional in verify endpoint                                                                            | Implemented           |
| Parse token and image             | Token parsing implemented; package image adapter path added                                                                               | Partially implemented |
| Layer 1 digital integrity         | Protected QR + on-chain checks                                                                                                            | Implemented           |
| Layer 2 physical AI integrity     | Optional adapter in backend (`AI_VERIFICATION_*`)                                                                                         | Adapter ready         |
| Aggregate decision                | Backend merges QR, ledger, and AI adapter result                                                                                          | Implemented           |
| Fraud warning and alerting        | Canonical taxonomy mapper + alert archive + regulator alert/report APIs + sink delivery for `SCAN_REJECTED` and `RECALL_ALERT` (`logger\|webhook`) with retry/backoff/dead-letter | Implemented           |

## Gap Summary

1. AI verify path is implemented and exercised by stack E2E; remaining gap is production model governance — `best.pt` must be provided externally before deploying AI service.
2. Advanced sink channels (email/SIEM/case-management vendor integrations) are not yet implemented; current baseline supports `logger|webhook` with retry/backoff/dead-letter.
3. Provider-level high-availability and replication policy for IPFS pinning still needs production hardening.
4. Package-image AI lane in `/verify` requires the `packagingImage` multipart field; this field is not yet surfaced in FE flows and requires FE integration work.
