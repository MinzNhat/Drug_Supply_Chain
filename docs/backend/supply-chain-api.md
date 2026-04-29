# Supply Chain API (Operational + Heatmap)

Base URL: `/api/v1`

## 1) List Batches

Endpoint:

`GET /batches`

Auth: Bearer token.

Query params:

- `page` (default 1)
- `pageSize` (default 20, max 100)
- `ownerMSP` (Regulator can query all MSPs; others only own MSP)
- `status` (`ACTIVE|WARNING|SUSPICIOUS|RECALLED`)
- `transferStatus` (`NONE|IN_TRANSIT`)
- `drugName` (substring search)

## 2) Record Geospatial Event

Endpoint:

`POST /batches/:batchId/events`

Auth: Bearer token.

Request body:

```json
{
  "eventType": "SCAN",
  "source": "MANUAL",
  "lat": 10.7769,
  "lng": 106.7009,
  "accuracyM": 12,
  "address": "District 1, Ho Chi Minh City",
  "note": "Retail pharmacy scan",
  "occurredAt": "2026-03-26T10:30:00.000Z",
  "metadata": {
    "deviceId": "scanner-001",
    "channel": "mobile-app"
  }
}
```

`eventType` supported:

- `SCAN`
- `HANDOVER_OUT`
- `HANDOVER_IN`
- `WAREHOUSE`
- `DELIVERY`
- `RECALL_ALERT`
- `INSPECTION`

`source` supported:

- `MANUAL`
- `VERIFY`
- `SHIP`
- `RECEIVE`
- `SYSTEM`

## 3) Batch Timeline

Endpoint:

`GET /batches/:batchId/events`

Auth: Bearer token.

Query params:

- `limit` (default 100, max 500)
- `from` (ISO datetime)
- `to` (ISO datetime)
- `eventType` (optional enum)

## 4) Heatmap For FE

Endpoint:

`GET /analytics/heatmap`

Auth: Bearer token.

Query params:

- `from` / `to` (ISO datetime)
- `eventType`
- `source`
- `actorMSP` (Regulator only cross-MSP)
- `minLat`, `maxLat`, `minLng`, `maxLng` (bounding box)
- `precision` (2..4, default 3)
- `limit` (default 5000, max 10000)

Response shape:

```json
{
  "success": true,
  "data": {
    "precision": 3,
    "totalPoints": 1234,
    "buckets": [
      {
        "lat": 10.777,
        "lng": 106.701,
        "count": 42,
        "eventTypes": ["SCAN", "DELIVERY"],
        "sources": ["MANUAL", "SYSTEM"],
        "lastOccurredAt": "2026-03-26T10:30:00.000Z"
      }
    ]
  }
}
```

## 5) Existing Core Flow APIs (already available)

- `POST /batches`
- `GET /batches/:batchId`
- `POST /verify`
- `POST /batches/:batchId/protected-qr/bind`
- `POST /batches/:batchId/protected-qr/token-policy`
- `POST /batches/:batchId/ship`
- `POST /batches/:batchId/receive`
- `POST /batches/:batchId/confirm-delivered-to-consumption`
- `POST /batches/:batchId/documents`
- `POST /batches/:batchId/recall`

### 5.1) Document Upload Modes

Endpoint:

`POST /batches/:batchId/documents`

Auth: Bearer token.

Mode A - legacy CID mode (`application/json`):

```json
{
  "docType": "qualityCert",
  "newCID": "QmLegacyCid1234567890"
}
```

Mode B - direct upload mode (`multipart/form-data`):

- `docType`: `packageImage | qualityCert`
- `document`: binary file

Response includes ledger batch payload plus `upload` metadata block (`source`, `provider`, `pinStatus`, and integrity metadata for direct-upload mode).

### 5.2) Protected QR Token Policy

Endpoint:

`POST /batches/:batchId/protected-qr/token-policy`

Auth: Bearer token, role must be `Regulator`.

Request body:

```json
{
  "actionType": "BLOCKLIST",
  "tokenDigest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "reason": "counterfeit signal confirmed",
  "note": "manual review ticket #INC-42"
}
```

Action semantics:

- `BLOCKLIST`: temporary deny (verification returns rejected while status is blocked).
- `REVOKE`: terminal deny for anchored digest.
- `RESTORE`: allowed only when current policy status is `BLOCKLISTED`.

Verification impact:

- `POST /verify` receives policy-aware protected-QR result and rejects when digest is blocked/revoked.
- Ledger verification record write is denied for blocked/revoked digest.

### 5.3) Protected QR Bind Authorization

Endpoint:

`POST /batches/:batchId/protected-qr/bind`

Auth: Bearer token, role must be `Manufacturer`.

Additional ledger guard:

- Caller must be current batch owner.
- Caller MSP must be `ManufacturerMSP`.

### 5.4) Inter-Distributor Transfer Semantics

Ship endpoint:

`POST /batches/:batchId/ship`

Receive endpoint:

`POST /batches/:batchId/receive`

Auth: Bearer token.

Ship request body:

```json
{
  "targetOwnerMSP": "DistributorMSP",
  "targetDistributorUnitId": "dist-unit-b"
}
```

Rules:

- `targetDistributorUnitId` is accepted only when `targetOwnerMSP` is `DistributorMSP`.
- Distributor -> Distributor transfer requires `targetDistributorUnitId`.
- Same-unit transfer is rejected (`SAME_DISTRIBUTOR_UNIT_TRANSFER_NOT_ALLOWED`).
- Manufacturer -> Distributor transfer may specify `targetDistributorUnitId` to lock receiver unit identity at receive step.

Audit fields in batch state:

- `ownerUnitId`: current distributor unit owner when `ownerMSP=DistributorMSP`.
- `targetOwnerUnitId`: expected receiver unit while `transferStatus=IN_TRANSIT`.
- `transferHistory[].fromUnitId` and `transferHistory[].toUnitId` for unit-level traceability.

### 5.5) Consumption Delivery Confirmation Gate

Confirm endpoint:

`POST /batches/:batchId/confirm-delivered-to-consumption`

Auth: Bearer token, role must be `Distributor`.

Rules:

- Caller must be current batch owner.
- Batch must not be in transit (`transferStatus=NONE`).
- Confirmation is idempotent (repeated call returns current confirmed state).

Verification gate behavior:

- Before confirmation, `POST /verify` **proceeds but emits a `GovMonitor` warning event** on the ledger (`WARN_UNCONFIRMED_CONSUMPTION`). Scan count still increments and the response returns `verificationResult=SAFE`.
- After confirmation, behavior is identical — scan count grows, threshold escalation remains active.
- Pre-confirmation scans are surfaced to regulators through the `GovMonitor` event and alert taxonomy.

## 6) Regulator Alert APIs

Base path:

`/api/v1/regulator`

All endpoints below require:

- Bearer token.
- Role must be `Regulator`.

### 6.1) List Archived Alerts

Endpoint:

`GET /regulator/alerts`

Query params:

- `page` (default 1)
- `pageSize` (default 20, max 200)
- `canonicalKey` (for example `SCAN_REJECTED`, `RECALL_ALERT`)
- `severity` (`info|warn|critical`)
- `batchID`
- `sourceType` (`backend_decision|chaincode_event|backend_action`)
- `sourceKey`
- `traceId`
- `from` / `to` (ISO datetime)

Response shape:

```json
{
  "success": true,
  "data": {
    "page": 1,
    "pageSize": 20,
    "total": 2,
    "items": [
      {
        "id": "67ea95fca7e6d9d5f2ecdcad",
        "canonicalKey": "SCAN_REJECTED",
        "sinkEventId": "DATN_SCAN_REJECTED",
        "severity": "warn",
        "source": {
          "type": "backend_decision",
          "key": "SCAN_REJECTED"
        },
        "batchID": "BATCH_001",
        "traceId": "trace-1",
        "occurredAt": "2026-03-31T12:00:00.000Z",
        "details": {}
      }
    ]
  }
}
```

### 6.2) Read One Alert

Endpoint:

`GET /regulator/alerts/:alertId`

Returns one archived alert by id.

### 6.3) Export Alert Report

Endpoint:

`GET /regulator/reports/export`

Query params:

- `format` (`json|csv`, default `json`)
- `limit` (default 1000, max 10000)
- Same filter params as alert list endpoint.

Behavior:

- `format=json`: returns `{ success: true, data: ... }` payload with summary + items.
- `format=csv`: returns `text/csv` attachment.
- Export metadata is published through baseline sink adapter (`logger` channel).

## 7) Alert Sink Side Effects

Trigger points:

- `POST /verify` when decision is `SCAN_REJECTED`.
- `POST /batches/:batchId/recall` when emitting `RECALL_ALERT`.

Delivery behavior:

- Canonical alert payload is archived first.
- Sink dispatch uses idempotency key + retry/backoff policy.
- If retries are exhausted, payload is moved to dead-letter storage.
- Sink failures are logged and do not fail the core API response path.
