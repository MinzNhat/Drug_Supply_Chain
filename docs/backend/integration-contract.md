# Backend Integration Contract

## Scope

This document maps Backend API endpoints to Hyperledger Fabric chaincode functions in `drugtracker`.

## Changelog

- 2026-04-08: corrected `POST /api/v1/batches/:batchId/events` mode semantics from Query to Submit.

## Endpoint To Chaincode Mapping

| Backend Endpoint                                  | Chaincode Function              | Mode     | Notes                                                          |
| ------------------------------------------------- | ------------------------------- | -------- | -------------------------------------------------------------- |
| `POST /api/v1/batches`                            | `CreateBatchWithExpiry`         | Submit   | Creates ledger batch state.                                    |
| `POST /api/v1/batches`                            | `BindProtectedQR`               | Submit   | Internal step after QR generation to bind digest and metadata. |
| `GET /api/v1/batches`                             | Off-chain `BatchState` snapshot | Query    | FE list/search for operational screens with pagination/filter. |
| `GET /api/v1/batches/:batchId`                    | `ReadBatch`                     | Evaluate | Read-only query by batch id.                                   |
| `POST /api/v1/verify`                             | `VerifyProtectedQR`             | Evaluate | Checks token digest match against anchored protected QR.       |
| `POST /api/v1/verify`                             | `RecordProtectedQRVerification` | Submit   | Anchors physical verification result and confidence.           |
| `POST /api/v1/verify`                             | `VerifyBatch`                   | Submit   | Records scan telemetry and updates risk status.                |
| `POST /api/v1/batches/:batchId/protected-qr/bind` | `BindProtectedQR`               | Submit   | Manufacturer-only rebind for protected QR payload.             |
| `POST /api/v1/batches/:batchId/protected-qr/token-policy` | `UpdateProtectedQRTokenPolicy` | Submit | Regulator token lifecycle actions (`BLOCKLIST|REVOKE|RESTORE`). |
| `POST /api/v1/batches/:batchId/ship`              | `ShipBatch`                     | Submit   | Transfer step 1 with optional distributor unit target semantics. |
| `POST /api/v1/batches/:batchId/receive`           | `ReceiveBatch`                  | Submit   | Transfer step 2 validates target distributor unit when present. |
| `POST /api/v1/batches/:batchId/confirm-delivered-to-consumption` | `ConfirmDeliveredToConsumption` | Submit | Distributor owner confirms delivery to consumption point before scan growth. |
| `POST /api/v1/batches/:batchId/documents`         | `UpdateDocument`                | Submit   | Dual mode: legacy CID payload or multipart direct upload.      |
| `POST /api/v1/batches/:batchId/recall`            | `EmergencyRecall`               | Submit   | Regulator-only emergency recall.                               |
| `POST /api/v1/batches/:batchId/events`            | Off-chain `BatchGeoEvent` write | Submit   | Ingest lat/lng events for timeline and heatmap.                |
| `GET /api/v1/batches/:batchId/events`             | Off-chain `BatchGeoEvent` read  | Query    | Batch timeline for FE traceability view.                       |
| `GET /api/v1/analytics/heatmap`                   | Off-chain geo bucket aggregate  | Query    | Heatmap data for FE map layer.                                 |
| `GET /api/v1/regulator/alerts`                    | Off-chain `AlertArchive` read   | Query    | Regulator-only paginated alert retrieval.                      |
| `GET /api/v1/regulator/alerts/:alertId`           | Off-chain `AlertArchive` read   | Query    | Regulator-only alert detail by id.                             |
| `GET /api/v1/regulator/reports/export`            | Off-chain `AlertArchive` export | Query    | Regulator-only JSON/CSV export with sink publish metadata.     |

## Public Scan Decision Contract

`POST /api/v1/verify` execution order:

1. Verify protected QR image through Protected QR service.
2. Optional parallel lane: verify package image through AI service adapter (`packagingImage`) when enabled.
3. Compute `tokenDigest = sha256(token)` from service output.
4. Evaluate `VerifyProtectedQR(batchID, tokenDigest)`.
5. Submit `RecordProtectedQRVerification(batchID, isAuthentic, confidenceScore, tokenDigest)`.
6. Submit `VerifyBatch(batchID)` to update telemetry and risk state.
7. Return merged decision to client.

Multipart request fields:

- `image` (required): QR image payload.
- `packagingImage` (optional): package photo used by AI adapter.

AI service contract used by backend adapter:

- Endpoint: `POST /api/v1/verify` (multipart field `image`).
- Base URL: `AI_VERIFICATION_URL`.
- Response fields consumed by backend adapter: `accepted` (preferred) or legacy `is_authentic` and `confidence_score`, normalized to internal camelCase fields.

Compatibility note:

- Backend adapter keeps fallback to legacy `POST /verify` if upstream returns `404`.

Decision rules in Backend:

- `SCAN_ACCEPTED`: QR physical check authentic, digest matched, ledger safety not `DANGER`, and AI lane (if enabled and provided) accepted.
- `SCAN_REJECTED`: otherwise, with normalized error payload.

## Document Update Contract

Endpoint: `POST /api/v1/batches/:batchId/documents`

Supported modes:

1. Legacy CID mode (backward-compatible JSON)

```json
{
  "docType": "qualityCert",
  "newCID": "Qm..."
}
```

2. Direct upload mode (multipart/form-data)

- `docType`: `packageImage | qualityCert`
- `document`: file payload

Backend behavior:

- Uploads file to configured provider (`mock|kubo|pinata`).
- Computes and stores integrity metadata (`digestSha256`, `sizeBytes`, `mediaType`) in off-chain artifact storage.
- Submits only resulting `cid` to chaincode `UpdateDocument(batchID, docType, cid)`.
- If upload succeeded but ledger update fails, artifact is persisted with `pinStatus=orphaned` and `ledgerUpdated=false` for compensation tracking.

## Protected QR Token Policy Contract

Endpoint: `POST /api/v1/batches/:batchId/protected-qr/token-policy`

Auth rules:

- Requires Bearer token.
- Requires role `Regulator` at API middleware level.

Request payload:

```json
{
  "actionType": "REVOKE",
  "tokenDigest": "<64-hex>",
  "reason": "counterfeit signal confirmed",
  "note": "incident-2026-04-06"
}
```

Supported actions:

- `BLOCKLIST`: temporary deny for current anchored digest.
- `REVOKE`: terminal deny for current anchored digest.
- `RESTORE`: reactivate digest only from `BLOCKLISTED` state.

Chaincode behavior:

- Persists audit trail in `protected_qr.token_policy.history` (`status_before`, `status_after`, actor, timestamp, reason).
- Emits event `ProtectedQRTokenPolicyUpdated`.
- `VerifyProtectedQR` response becomes policy-aware (`policy_status`, `policy_blocked`) and returns `matched=false` when digest is blocked/revoked.
- `RecordProtectedQRVerification` denies writes when token policy is blocked/revoked.

## Distributor Unit Identity Bridge

Purpose:

- Map one authenticated API distributor actor to one exact Fabric certificate/key identity.
- Keep authorization/audit at distributor-unit granularity instead of shared role identity.

Runtime behavior:

- API JWT claim `distributorUnitId` is propagated to backend actor context.
- Fabric gateway resolves identity in this order:
  1. Role default identity (`organizations.Distributor`) when bridge is disabled.
  2. Unit-mapped identity (`distributorIdentityBridge.units[distributorUnitId]`) when bridge is enabled.
- Unauthorized or missing unit mapping (when required) returns `403` with code:
  - `DISTRIBUTOR_UNIT_REQUIRED`
  - `DISTRIBUTOR_UNIT_NOT_AUTHORIZED`
  - `DISTRIBUTOR_UNIT_MSP_MISMATCH`

Audit linkage:

- Every evaluate/submit call writes one linkage record to `FabricIdentityLink` with:
  - API actor identity (`userId`, `role`, `mspId`, `distributorUnitId`)
  - Resolved Fabric identity (`sessionKey`, `label`, `source`, cert/key paths, peer target)
  - Chaincode transaction metadata (`name`, `mode`, `status`, `errorCode`, `traceId`)

Related backend runtime modules:

- `backend/src/integrations/fabric/fabric-identity-resolver.js`
- `backend/src/integrations/fabric/fabric-gateway.client.js`
- `backend/src/models/fabric/fabric-identity-link.model.js`

## Inter-Distributor Transfer Semantics

Purpose:

- Enable Distributor -> Distributor handover between different transport units under the same canonical `DistributorMSP`.
- Preserve unit-level source/destination traceability in transfer history.

API request contract for ship:

```json
{
  "targetOwnerMSP": "DistributorMSP",
  "targetDistributorUnitId": "dist-unit-b"
}
```

Runtime rules:

- `targetDistributorUnitId` is allowed only when `targetOwnerMSP=DistributorMSP`.
- Distributor -> Distributor transfer requires `targetDistributorUnitId`.
- Same-unit transfer is rejected (`SAME_DISTRIBUTOR_UNIT_TRANSFER_NOT_ALLOWED`).

Chaincode argument mapping:

- `ShipBatch(batchID, receiverMSP, senderUnitId, receiverUnitId)`
- `ReceiveBatch(batchID, receiverUnitId)`

Ledger batch fields used for audit:

- `ownerUnitId`
- `targetOwnerUnitId`
- `transferHistory[].fromUnitId`
- `transferHistory[].toUnitId`

## Consumption Delivery Confirmation Gate

Purpose:

- Ensure public verification scan-count growth starts only after confirmed delivery to consumption point.
- Enforce deterministic red-path for pre-confirmation scans.

API contract:

- Confirm transition endpoint:
  - `POST /api/v1/batches/:batchId/confirm-delivered-to-consumption`

Chaincode mapping:

- `ConfirmDeliveredToConsumption(batchID)`

Verification runtime behavior:

- Before `consumptionConfirmed=true`: `VerifyBatch` proceeds and increments scan count. A `GovMonitor` event with `code=WARN_UNCONFIRMED_CONSUMPTION` is emitted on-chain for regulator visibility.
- Backend returns `verificationResult=SAFE` — the pre-confirmation scan is surfaced as a warning, not a hard reject.
- After confirmation: behavior is identical; scan-count growth and threshold escalation continue normally.

Ledger fields:

- `consumptionConfirmed`
- `consumptionConfirmedAt`
- `consumptionConfirmedByMSP`

## Unified Alert Taxonomy

Canonical codebook used by Backend, chaincode-event mapping, and outbound sink IDs:

| Canonical Key                        | Backend Decision         | Chaincode Event                   | Sink Event ID                             |
| ------------------------------------ | ------------------------ | --------------------------------- | ----------------------------------------- |
| `SCAN_ACCEPTED`                      | `SCAN_ACCEPTED`          | n/a                               | `DATN_SCAN_ACCEPTED`                      |
| `SCAN_REJECTED`                      | `SCAN_REJECTED`          | n/a                               | `DATN_SCAN_REJECTED`                      |
| `RECALL_ALERT`                       | `EmergencyRecall` action | `RecallAlert`                     | `DATN_RECALL_ALERT`                       |
| `LEDGER_SCAN_WARNING`                | n/a                      | `GovMonitor`                      | `DATN_LEDGER_SCAN_WARNING`                |
| `LEDGER_SCAN_SUSPICIOUS`             | n/a                      | `PublicAlert`                     | `DATN_LEDGER_SCAN_SUSPICIOUS`             |
| `PROTECTED_QR_BOUND`                 | n/a                      | `ProtectedQRBound`                | `DATN_PROTECTED_QR_BOUND`                 |
| `PROTECTED_QR_VERIFICATION_RECORDED` | n/a                      | `ProtectedQRVerificationRecorded` | `DATN_PROTECTED_QR_VERIFICATION_RECORDED` |

Backend mapper module:

- `backend/src/services/alerts/alert-taxonomy.mapper.js`

Notes:

- `POST /api/v1/verify` emits standardized taxonomy payload from decision code.
- `POST /api/v1/batches/:batchId/recall` emits standardized `RECALL_ALERT` payload.
- Emitted verify/recall alerts are archived in `AlertArchive` for regulator retrieval/export APIs.
- `SCAN_REJECTED` and `RECALL_ALERT` are now delivered through sink adapter interface (`logger|webhook`) with deterministic idempotency key.
- Delivery state is tracked in `AlertDelivery` with retry/backoff and dead-letter fallback in `AlertDeadLetter`.
- Sink delivery failures are observable by structured logs and do not fail core verify/recall API path.

## Error Contract

All API errors use:

```json
{
  "success": false,
  "error": {
    "code": "STRING_CODE",
    "message": "Human readable message",
    "traceId": "request-trace-id",
    "trace_id": "request-trace-id",
    "details": {}
  }
}
```

Migration note:

- `traceId` is the canonical error key.
- `trace_id` is retained as a deprecated compatibility alias during migration.

## Logging Contract

All services emit structured JSON logs with:

- `timestamp`
- `service`
- `level`
- `message`
- `traceId` (for request context)

## Naming Contract

- Public JSON API boundary (Backend and Protected QR): `camelCase`.
- Internal service/domain model: `camelCase`.
- Python core and legacy external integrations may emit `snake_case`; adapter mappers must normalize these fields at integration boundaries.
- Chaincode function names are PascalCase and argument order is positional; JSON naming policy does not apply to chaincode transaction argument names.
- Keep explicit mapper helpers at boundaries to avoid mixed naming in one layer.
- MSP identifiers on API input accept canonical values and Fabric test-network aliases, but API output is normalized to canonical MSP names.
