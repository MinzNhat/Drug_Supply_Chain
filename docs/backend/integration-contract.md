# Backend Integration Contract

## Scope

This document maps Backend API endpoints to Hyperledger Fabric chaincode functions in `drugtracker`.

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
| `POST /api/v1/batches/:batchId/protected-qr/bind` | `BindProtectedQR`               | Submit   | Rebinds protected QR payload for a batch.                      |
| `POST /api/v1/batches/:batchId/ship`              | `ShipBatch`                     | Submit   | Transfer step 1, current owner ships to target MSP.            |
| `POST /api/v1/batches/:batchId/receive`           | `ReceiveBatch`                  | Submit   | Transfer step 2, target MSP receives ownership.                |
| `POST /api/v1/batches/:batchId/documents`         | `UpdateDocument`                | Submit   | Updates document CID metadata.                                 |
| `POST /api/v1/batches/:batchId/recall`            | `EmergencyRecall`               | Submit   | Regulator-only emergency recall.                               |
| `POST /api/v1/batches/:batchId/events`            | Off-chain `BatchGeoEvent` write | Query    | Ingest lat/lng events for timeline and heatmap.                |
| `GET /api/v1/batches/:batchId/events`             | Off-chain `BatchGeoEvent` read  | Query    | Batch timeline for FE traceability view.                       |
| `GET /api/v1/analytics/heatmap`                   | Off-chain geo bucket aggregate  | Query    | Heatmap data for FE map layer.                                 |

## Public Scan Decision Contract

`POST /api/v1/verify` execution order:

1. Verify protected QR image through Protected QR service.
2. Optional parallel lane: verify package image through AI service adapter (`packagingImage`) when enabled.
3. Compute `token_digest = sha256(token)` from service output.
4. Evaluate `VerifyProtectedQR(batchID, token_digest)`.
5. Submit `RecordProtectedQRVerification(batchID, is_authentic, confidence_score, token_digest)`.
6. Submit `VerifyBatch(batchID)` to update telemetry and risk state.
7. Return merged decision to client.

Multipart request fields:

- `image` (required): QR image payload.
- `packagingImage` (optional): package photo used by AI adapter.

Decision rules in Backend:

- `SCAN_ACCEPTED`: QR physical check authentic, digest matched, ledger safety not `DANGER`, and AI lane (if enabled and provided) accepted.
- `SCAN_REJECTED`: otherwise, with normalized error payload.

## Unified Alert Taxonomy

Canonical codebook used by Backend, chaincode-event mapping, and outbound sink IDs:

| Canonical Key | Backend Decision | Chaincode Event | Sink Event ID |
| --- | --- | --- | --- |
| `SCAN_ACCEPTED` | `SCAN_ACCEPTED` | n/a | `DATN_SCAN_ACCEPTED` |
| `SCAN_REJECTED` | `SCAN_REJECTED` | n/a | `DATN_SCAN_REJECTED` |
| `RECALL_ALERT` | `EmergencyRecall` action | `RecallAlert` | `DATN_RECALL_ALERT` |
| `LEDGER_SCAN_WARNING` | n/a | `GovMonitor` | `DATN_LEDGER_SCAN_WARNING` |
| `LEDGER_SCAN_SUSPICIOUS` | n/a | `PublicAlert` | `DATN_LEDGER_SCAN_SUSPICIOUS` |
| `PROTECTED_QR_BOUND` | n/a | `ProtectedQRBound` | `DATN_PROTECTED_QR_BOUND` |
| `PROTECTED_QR_VERIFICATION_RECORDED` | n/a | `ProtectedQRVerificationRecorded` | `DATN_PROTECTED_QR_VERIFICATION_RECORDED` |

Backend mapper module:

- `backend/src/services/alerts/alert-taxonomy.mapper.js`

Notes:

- `POST /api/v1/verify` emits standardized taxonomy payload from decision code.
- `POST /api/v1/batches/:batchId/recall` emits standardized `RECALL_ALERT` payload.
- External sink delivery adapter is tracked separately (P0-05), while canonical IDs are already stable.

## Error Contract

All API errors use:

```json
{
    "success": false,
    "error": {
        "code": "STRING_CODE",
        "message": "Human readable message",
        "trace_id": "request-trace-id",
        "details": {}
    }
}
```

## Logging Contract

All services emit structured JSON logs with:

- `timestamp`
- `service`
- `level`
- `message`
- `trace_id` (for request context)

## Naming Contract

- API boundary (external payloads): `snake_case` when interoperating with Protected QR and chaincode-like payloads.
- Backend internal service/domain: `camelCase`.
- Use explicit mappers at boundaries to avoid mixed naming in one layer.
- MSP identifiers on API input accept canonical values and Fabric test-network aliases, but API output is normalized to canonical MSP names.
