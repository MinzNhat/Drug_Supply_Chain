# Local End-To-End Runbook

## Goal

Run Blockchain + Protected QR + Backend locally and verify end-to-end flows:

- Public scan verification flow.
- AI edge-path scan behavior (reject, fail-open, fail-close).
- Geo event ingest -> timeline -> heatmap API flow.
- Ownership transfer flow (Ship then Receive).
- Ownership transfer negative paths (forbidden actor, wrong receiver, repeated receive).
- Regulator alert retrieval and report export after alert-triggering actions.

## Fast Path (Unified Workspace Command)

From workspace root:

```bash
./scripts/run-all.sh full
```

This single command:

1. Boots Fabric and deploys chaincode.
2. Adds Org3 to `mychannel`.
3. Starts Mongo + Protected QR + AI Appearance + Backend via root `docker-compose.yml`.
4. Runs runtime E2E (`scripts/backend/e2e-runtime.mjs`).
5. Runs geo-flow E2E (`scripts/backend/e2e-geo-flow.mjs`).
6. Runs transfer-batch E2E (`scripts/backend/e2e-transfer-batch.mjs`).
7. Runs transfer negative-path E2E (`scripts/backend/e2e-transfer-negative.mjs`).
8. Runs AI edge-path + alert/report E2E (`scripts/backend/e2e-ai-alerting.mjs`).

Stop everything:

```bash
./scripts/run-all.sh down
```

## Prerequisites

- Docker and Docker Compose.
- Node.js 18+.
- Python 3.9+ (if running Protected QR Python core outside Docker).

## 1. Start Blockchain Network

From workspace root:

```bash
./scripts/blockchain/blockchain-run.sh full
```

Optional smoke test:

```bash
./scripts/blockchain/blockchain-smoke-test.sh
```

If Distributor org is missing in your topology:

```bash
cd ../test-network/addOrg3
./addOrg3.sh up -c mychannel
```

## 2. Start Protected QR Service

Option A: Docker

```bash
cd protected-qr
docker-compose up -d --build
```

Option B: Local dev

```bash
cd protected-qr
npm install
npm run dev
```

And in another terminal:

```bash
cd protected-qr/python-core
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

## 2.1 Start AI Appearance Service

The root stack already includes:

- `ai-python-core` on port `8700`
- `ai-service` (Node gateway) on port `8701`

To enable backend AI lane in root compose, set:

```bash
export DATN_AI_VERIFICATION_ENABLED=true
export DATN_AI_VERIFICATION_URL=http://ai-service:8701
```

Place trained model at `ai-service/models/best.pt` before enabling.

## 3. Configure Backend

Create env from template:

```bash
cd backend
cp .env.example .env
```

Update Fabric identity paths and peer endpoints in `.env` to match your local artifacts.

## 4. Start Backend

```bash
cd backend
npm install
npm run dev
```

## 5. Verify Flows

### 5.1 Public Scan Flow

1. Register and login Manufacturer user.
2. Create batch via `POST /api/v1/batches`.
3. Use returned QR image to call `POST /api/v1/verify` with `image` multipart field.
4. Optional future lane: include package photo in `packagingImage` multipart field for AI verification adapter.
5. Expect `SCAN_ACCEPTED` decision with merged ledger and protected QR evidence.

### 5.2 Ownership Transfer Flow

1. Manufacturer calls `POST /api/v1/batches/:batchId/ship` with `targetOwnerMSP=DistributorMSP`.
2. Distributor calls `POST /api/v1/batches/:batchId/receive`.
3. Read batch via `GET /api/v1/batches/:batchId` and verify owner changed.

### 5.3 One-Command Runtime E2E (Backend)

After all services are running, execute:

```bash
cd backend
npm run e2e:runtime
```

This script performs register/login, create batch, public verify, ship, receive, and final read assertions.

Dedicated transfer-only E2E:

```bash
cd backend
npm run e2e:transfer
```

Dedicated transfer negative-path E2E:

```bash
cd backend
npm run e2e:transfer:negative
```

Dedicated geo-flow E2E:

```bash
cd backend
npm run e2e:geo
```

Dedicated AI edge-path + alert/report E2E:

```bash
cd backend
npm run e2e:ai
```

## 6. Run Automated Tests

```bash
cd backend
npm test
```

## 7. FE Heatmap And Timeline APIs

After login, FE can consume:

- `GET /api/v1/batches` for paginated batch list.
- `POST /api/v1/batches/:batchId/events` to ingest geo events (`lat`, `lng`).
- `GET /api/v1/batches/:batchId/events` for timeline.
- `GET /api/v1/analytics/heatmap` for map buckets.

Detailed contract: `docs/backend/supply-chain-api.md`.

## 8. Shutdown

```bash
./scripts/run-all.sh down
```
