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
- `POST /batches/:batchId/ship`
- `POST /batches/:batchId/receive`
- `POST /batches/:batchId/documents`
- `POST /batches/:batchId/recall`
