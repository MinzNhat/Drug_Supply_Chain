# Unified API Inventory

This inventory is the single publication point for active and planned APIs across Backend, Protected QR, and AI Service.

## Classification Rules

- `public`: Intended for external clients (web/mobile/operator/regulator).
- `internal`: Intended for service-to-service traffic, orchestration probes, or internal adapters.
- `planned`: Reserved path not implemented in runtime routes.

## Ownership and Versioning Rules

- Backend external APIs are versioned by path (`/api/v1`).
- Protected QR and AI Node APIs are versioned by path (`/api/v1/...`) and tracked in OpenAPI `info.version`.
- Python core APIs are unversioned internal paths and versioned by service runtime version (`1.0.0`).

## Source Registry

- Backend route sources:
  - `backend/src/app.js`
  - `backend/src/routes/auth/auth.routes.js`
  - `backend/src/routes/product/product.routes.js`
  - `backend/src/routes/regulator/regulator.routes.js`
- Backend contract sources:
  - `docs/backend/integration-contract.md`
  - `docs/backend/supply-chain-api.md`
- Protected QR contract sources:
  - `docs/protected-qr/swagger.yaml`
  - `protected-qr/src/app.ts`
  - `protected-qr/src/routes/qr.routes.ts`
  - `protected-qr/python-core/app.py`
- AI Service contract sources:
  - `docs/ai-service/swagger.yaml`
  - `ai-service/src/app.js`
  - `ai-service/src/routes/ai.routes.js`
  - `ai-service/python-core/app.py`

## Active Endpoints

### Public

| Service | Method | Path | Class | Owner | Versioning | Source |
| --- | --- | --- | --- | --- | --- | --- |
| backend | POST | `/api/v1/auth/register` | public | backend-auth | `v1` | `backend/src/routes/auth/auth.routes.js` |
| backend | POST | `/api/v1/auth/login` | public | backend-auth | `v1` | `backend/src/routes/auth/auth.routes.js` |
| backend | POST | `/api/v1/auth/refresh` | public | backend-auth | `v1` | `backend/src/routes/auth/auth.routes.js` |
| backend | POST | `/api/v1/batches` | public | backend-supply-chain | `v1` | `backend/src/routes/product/product.routes.js` |
| backend | GET | `/api/v1/batches` | public | backend-supply-chain | `v1` | `backend/src/routes/product/product.routes.js` |
| backend | GET | `/api/v1/batches/:batchId` | public | backend-supply-chain | `v1` | `backend/src/routes/product/product.routes.js` |
| backend | POST | `/api/v1/verify` | public | backend-supply-chain | `v1` | `backend/src/routes/product/product.routes.js` |
| backend | GET | `/api/v1/batches/:batchId/protected-qr` | public | backend-supply-chain | `v1` | `backend/src/routes/product/product.routes.js` |
| backend | POST | `/api/v1/batches/:batchId/protected-qr/bind` | public | backend-supply-chain | `v1` | `backend/src/routes/product/product.routes.js` |
| backend | POST | `/api/v1/batches/:batchId/protected-qr/token-policy` | public | backend-supply-chain | `v1` | `backend/src/routes/product/product.routes.js` |
| backend | POST | `/api/v1/batches/:batchId/ship` | public | backend-supply-chain | `v1` | `backend/src/routes/product/product.routes.js` |
| backend | POST | `/api/v1/batches/:batchId/receive` | public | backend-supply-chain | `v1` | `backend/src/routes/product/product.routes.js` |
| backend | POST | `/api/v1/batches/:batchId/confirm-delivered-to-consumption` | public | backend-supply-chain | `v1` | `backend/src/routes/product/product.routes.js` |
| backend | POST | `/api/v1/batches/:batchId/documents` | public | backend-supply-chain | `v1` | `backend/src/routes/product/product.routes.js` |
| backend | POST | `/api/v1/batches/:batchId/recall` | public | backend-supply-chain | `v1` | `backend/src/routes/product/product.routes.js` |
| backend | POST | `/api/v1/batches/:batchId/events` | public | backend-supply-chain | `v1` | `backend/src/routes/product/product.routes.js` |
| backend | GET | `/api/v1/batches/:batchId/events` | public | backend-supply-chain | `v1` | `backend/src/routes/product/product.routes.js` |
| backend | GET | `/api/v1/analytics/heatmap` | public | backend-supply-chain | `v1` | `backend/src/routes/product/product.routes.js` |
| backend | GET | `/api/v1/regulator/alerts` | public | backend-regulator-ops | `v1` | `backend/src/routes/regulator/regulator.routes.js` |
| backend | GET | `/api/v1/regulator/alerts/:alertId` | public | backend-regulator-ops | `v1` | `backend/src/routes/regulator/regulator.routes.js` |
| backend | GET | `/api/v1/regulator/reports/export` | public | backend-regulator-ops | `v1` | `backend/src/routes/regulator/regulator.routes.js` |

### Internal

| Service | Method | Path | Class | Owner | Versioning | Source |
| --- | --- | --- | --- | --- | --- | --- |
| backend | GET | `/health` | internal | backend-platform | unversioned probe | `backend/src/app.js` |
| protected-qr-node | GET | `/health` | internal | protected-qr-platform | unversioned probe | `protected-qr/src/app.ts` |
| protected-qr-node | POST | `/api/v1/qr/generate` | internal | protected-qr-platform | `v1` + OpenAPI `1.0.0` | `protected-qr/src/routes/qr.routes.ts`, `docs/protected-qr/swagger.yaml` |
| protected-qr-node | POST | `/api/v1/qr/verify` | internal | protected-qr-platform | `v1` + OpenAPI `1.0.0` | `protected-qr/src/routes/qr.routes.ts`, `docs/protected-qr/swagger.yaml` |
| protected-qr-python-core | GET | `/health` | internal | protected-qr-core | unversioned + runtime `1.0.0` | `protected-qr/python-core/app.py` |
| protected-qr-python-core | POST | `/generate-protected-qr` | internal | protected-qr-core | unversioned + runtime `1.0.0` | `protected-qr/python-core/app.py` |
| protected-qr-python-core | POST | `/verify-protected-qr` | internal | protected-qr-core | unversioned + runtime `1.0.0` | `protected-qr/python-core/app.py` |
| ai-node | GET | `/health` | internal | ai-platform | unversioned probe | `ai-service/src/app.js`, `docs/ai-service/swagger.yaml` |
| ai-node | POST | `/api/v1/verify` | internal | ai-platform | `v1` + OpenAPI `1.0.0` | `ai-service/src/routes/ai.routes.js`, `docs/ai-service/swagger.yaml` |
| ai-python-core | GET | `/health` | internal | ai-core | unversioned + runtime `1.0.0` | `ai-service/python-core/app.py` |
| ai-python-core | POST | `/verify` | internal | ai-core | unversioned + runtime `1.0.0` | `ai-service/python-core/app.py` |

### Planned

No unpublished API paths are currently reserved in runtime route trees. Planned changes are tracked in backlog items rather than pre-allocating paths.

## Validation Summary

- Route-level extraction was performed from all active route files in:
  - `backend/src/routes/`
  - `protected-qr/src/routes/`
  - `ai-service/src/routes/`
- Internal Python core paths were validated from:
  - `protected-qr/python-core/app.py`
  - `ai-service/python-core/app.py`
- Contract linkage was validated against:
  - `docs/backend/integration-contract.md`
  - `docs/backend/supply-chain-api.md`
  - `docs/protected-qr/swagger.yaml`
  - `docs/ai-service/swagger.yaml`