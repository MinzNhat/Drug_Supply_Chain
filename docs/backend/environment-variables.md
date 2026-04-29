# Environment Variables

## Backend (`backend/.env`)

| Variable                             | Required | Example                                               | Description                                          |
| ------------------------------------ | -------- | ----------------------------------------------------- | ---------------------------------------------------- |
| `PORT`                               | Yes      | `8090`                                                | Backend HTTP port.                                   |
| `MONGO_URI`                          | Yes      | `mongodb://mongo:27017`                               | Mongo connection for backend metadata/indexes.       |
| `MONGO_DB`                           | Yes      | `drug_guard`                                          | Backend database name.                               |
| `QR_SERVICE_URL`                     | Yes      | `http://localhost:8080`                               | Protected QR API base URL.                           |
| `JWT_SECRET`                         | Yes      | `set-via-secret-manager`                              | JWT signing key (or use `JWT_SECRET_FILE`).          |
| `JWT_SECRET_FILE`                    | No       | `/run/secrets/backend_jwt_secret`                     | File path containing JWT secret.                     |
| `JWT_EXPIRES_IN`                     | No       | `8h`                                                  | JWT expiration.                                      |
| `LOG_LEVEL`                          | No       | `info`                                                | Logging level.                                       |
| `REQUEST_TIMEOUT_MS`                 | No       | `10000`                                               | Inter-service HTTP timeout.                          |
| `AI_VERIFICATION_ENABLED`            | No       | `false`                                               | Enables optional packaging AI verification.          |
| `AI_VERIFICATION_PROFILE`            | No       | `local`                                               | AI policy profile (`local\|staging\|prod`).         |
| `AI_VERIFICATION_PROFILE_FILE`       | No       | `backend/config/ai-profiles/staging.example.json`     | Optional JSON profile for AI endpoint and ownership policy. |
| `AI_VERIFICATION_STRICT_CONFIG`      | No       | `false` (local), `true` (staging/prod)                | Enforce strict non-local endpoint and ownership metadata checks. |
| `AI_VERIFICATION_URL`                | No       | `http://localhost:8701`                               | AI verification API base URL (Node AI gateway).      |
| `AI_VERIFICATION_TIMEOUT_MS`         | No       | `10000`                                               | Timeout for AI verification calls.                   |
| `AI_VERIFICATION_FAIL_OPEN`          | No       | `true`                                                | Allow verification to continue if AI is down.        |
| `AI_VERIFICATION_OWNER_SERVICE`      | No       | `platform-backend@company.example`                    | Service owner accountable for backend AI integration. |
| `AI_VERIFICATION_OWNER_ML`           | No       | `ml-quality@company.example`                          | Model owner accountable for model quality/rollout.   |
| `AI_VERIFICATION_OWNER_ONCALL`       | No       | `#supplychain-ai-prod`                                | On-call contact/channel for AI incident escalation.  |
| `AI_VERIFICATION_RUNBOOK_PATH`       | No       | `docs/ai-service/service-overview.md`                 | Runbook path used for operational reference.         |
| `AI_VERIFICATION_RUNBOOK_ESCALATION` | No       | `sev-incident-ai-verification`                        | Escalation policy identifier or runbook section.     |
| `DOC_UPLOAD_ENABLED`                 | No       | `false`                                               | Enables direct multipart upload mode for batch documents. |
| `DOC_UPLOAD_PROVIDER`                | No       | `mock`                                                | Upload provider (`mock\|kubo\|pinata`).             |
| `DOC_UPLOAD_TIMEOUT_MS`              | No       | `15000`                                               | Timeout for upload call to storage provider.         |
| `DOC_UPLOAD_MAX_BYTES`               | No       | `5242880`                                             | Max accepted document size in bytes.                 |
| `DOC_UPLOAD_REQUIRE_PINNED`          | No       | `true`                                                | Target policy flag: uploaded artifact should be pinned. |
| `DOC_UPLOAD_PACKAGE_IMAGE_MEDIA_TYPES` | No     | `image/jpeg,image/png,image/webp`                     | Allowed media types for `docType=packageImage`.      |
| `DOC_UPLOAD_QUALITY_CERT_MEDIA_TYPES` | No      | `application/pdf,image/jpeg,image/png`                | Allowed media types for `docType=qualityCert`.       |
| `DOC_UPLOAD_KUBO_API_URL`            | No       | `http://127.0.0.1:5001`                               | Kubo RPC URL for `provider=kubo`.                    |
| `DOC_UPLOAD_KUBO_AUTH_TOKEN`         | No       | `Bearer <token>`                                      | Optional Kubo auth header value.                     |
| `DOC_UPLOAD_PINATA_API_URL`          | No       | `https://api.pinata.cloud`                            | Pinata API URL for `provider=pinata`.                |
| `DOC_UPLOAD_PINATA_JWT`              | No       | `<jwt>`                                               | Required when `provider=pinata`.                     |
| `ALERT_SINK_ENABLED`                 | No       | `true`                                                | Enable canonical alert sink delivery workflow.       |
| `ALERT_SINK_TYPE`                    | No       | `logger`                                              | Sink adapter type (`logger\|webhook`).               |
| `ALERT_SINK_RETRY_MAX_ATTEMPTS`      | No       | `3`                                                   | Max retry attempts for sink delivery.                |
| `ALERT_SINK_RETRY_BASE_DELAY_MS`     | No       | `200`                                                 | Retry backoff base delay (ms).                       |
| `ALERT_SINK_RETRY_MAX_DELAY_MS`      | No       | `2000`                                                | Retry backoff upper bound (ms).                      |
| `ALERT_SINK_WEBHOOK_URL`             | No       | `https://sink.example/alerts`                         | Webhook endpoint for sink adapter.                   |
| `ALERT_SINK_WEBHOOK_TIMEOUT_MS`      | No       | `5000`                                                | Webhook request timeout.                             |
| `ALERT_SINK_WEBHOOK_AUTH_HEADER`     | No       | `authorization`                                       | Header name carrying webhook auth token.             |
| `ALERT_SINK_WEBHOOK_AUTH_TOKEN`      | No       | `Bearer <token>`                                      | Webhook auth token value.                            |
| `FABRIC_ENABLED`                     | Yes      | `true`                                                | Enables Fabric Gateway integration.                  |
| `FABRIC_PROFILE`                     | No       | `local`                                               | Fabric runtime profile (`local\|staging\|prod`).     |
| `FABRIC_PROFILE_FILE`                | No       | `backend/config/fabric-profiles/staging.example.json` | JSON profile file for org endpoints and credentials. |
| `FABRIC_STRICT_CREDENTIALS`          | No       | `false` (local), `true` (staging/prod)                | Fail startup on invalid/missing Fabric material.     |
| `FABRIC_CHANNEL_NAME`                | Yes      | `mychannel`                                           | Fabric channel name.                                 |
| `FABRIC_CHAINCODE_NAME`              | Yes      | `drugtracker`                                         | Chaincode/contract name.                             |
| `FABRIC_EVALUATE_TIMEOUT_MS`         | No       | `5000`                                                | Evaluate call deadline.                              |
| `FABRIC_SUBMIT_TIMEOUT_MS`           | No       | `15000`                                               | Submit call deadline.                                |
| `FABRIC_COMMIT_STATUS_TIMEOUT_MS`    | No       | `20000`                                               | Commit status deadline.                              |
| `FABRIC_EVALUATE_RETRY_MAX_ATTEMPTS` | No       | `3`                                                   | Evaluate retry attempts.                             |
| `FABRIC_SUBMIT_RETRY_MAX_ATTEMPTS`   | No       | `1`                                                   | Submit retry attempts.                               |
| `FABRIC_PUBLIC_SCAN_ROLE`            | No       | `Regulator`                                           | Role identity for public scan ledger calls.          |
| `FABRIC_DISTRIBUTOR_IDENTITY_BRIDGE_ENABLED` | No | `false`                                               | Enable distributor unit -> Fabric identity bridge.   |
| `FABRIC_DISTRIBUTOR_IDENTITY_BRIDGE_REQUIRE_UNIT` | No | `true`                                            | Require `distributorUnitId` for distributor actors when bridge is enabled. |
| `FABRIC_DISTRIBUTOR_IDENTITY_BRIDGE_UNITS_JSON` | No | `{"dist-unit-hcm":{"certPath":"...","keyPath":"..."}}` | JSON object mapping distributor units to dedicated Fabric identity config. |

Role-bound identity material:

- `FABRIC_MANUFACTURER_*`
- `FABRIC_DISTRIBUTOR_*`
- `FABRIC_REGULATOR_*`

Profile model:

- `local`: allows localhost/`host.docker.internal` and test-network credential layouts.
- `staging`: requires non-local endpoints and non-test-network credential paths.
- `prod`: same constraints as staging with production channel/peer targets.

Profile files:

- `backend/config/fabric-profiles/local.example.json`
- `backend/config/fabric-profiles/staging.example.json`
- `backend/config/fabric-profiles/prod.example.json`

AI profile files:

- `backend/config/ai-profiles/local.example.json`
- `backend/config/ai-profiles/staging.example.json`
- `backend/config/ai-profiles/prod.example.json`

Resolution priority for Fabric org fields:

1. `FABRIC_<ROLE>_*` environment variables
2. `FABRIC_PROFILE_FILE` JSON values
3. Role default MSP fallback (`ManufacturerMSP`, `DistributorMSP`, `RegulatorMSP`)

Distributor identity bridge mapping:

- `FABRIC_DISTRIBUTOR_IDENTITY_BRIDGE_UNITS_JSON` overrides profile-file bridge units when provided.
- Unit key format should be normalized lowercase id (for example `dist-unit-hcm`).
- Unit mapping fields:
	- Required: `certPath`, `keyPath`
	- Optional overrides: `identityLabel`, `mspId`, `peerEndpoint`, `peerHostAlias`, `tlsCertPath`
- If bridge is enabled and `FABRIC_DISTRIBUTOR_IDENTITY_BRIDGE_REQUIRE_UNIT=true`, distributor JWT must contain `distributorUnitId` and a matching configured unit mapping.

MSP alias behavior:

- API auth accepts both canonical MSPs (`ManufacturerMSP`, `DistributorMSP`, `RegulatorMSP`) and test-network aliases (`ManufacturerMSP`, `DistributorMSP`, `RegulatorMSP`).
- Backend stores and uses canonical MSPs internally for consistent API contracts.
- Fabric Gateway `*_MSP_ID` must match your actual certificate MSP (for Fabric test-network defaults: `ManufacturerMSP`, `DistributorMSP`, `RegulatorMSP`).

Alert sink behavior:

- Canonical keys delivered to sink: `SCAN_REJECTED`, `RECALL_ALERT`.
- Delivery uses deterministic idempotency key and persists state in `AlertDelivery`.
- Failures follow retry/backoff policy and persist to dead-letter queue (`AlertDeadLetter`) when exhausted.
- Sink failures are non-blocking for core request flow (verify/recall still returns response).

Each role needs:

- `*_MSP_ID`
- `*_PEER_ENDPOINT`
- `*_PEER_HOST_ALIAS`
- `*_TLS_CERT_PATH`
- `*_CERT_PATH`
- `*_KEY_PATH`

Example for Fabric test-network identities:

- `FABRIC_MANUFACTURER_MSP_ID=ManufacturerMSP`
- `FABRIC_MANUFACTURER_CERT_PATH=.../User1@manufacturer.drugguard.vn/msp/signcerts/User1@manufacturer.drugguard.vn-cert.pem`
- `FABRIC_MANUFACTURER_KEY_PATH=.../User1@manufacturer.drugguard.vn/msp/keystore`
- `FABRIC_DISTRIBUTOR_MSP_ID=DistributorMSP`
- `FABRIC_REGULATOR_MSP_ID=RegulatorMSP`

## Protected QR (`protected-qr/.env`)

| Variable             | Required | Example                       |
| -------------------- | -------- | ----------------------------- |
| `PORT`               | Yes      | `8080`                        |
| `MONGO_URI`          | Yes      | `mongodb://mongo:27017`       |
| `MONGO_DB`           | Yes      | `protected_qr`                |
| `PYTHON_SERVICE_URL` | Yes      | `http://localhost:8000`       |
| `HMAC_SECRET`        | Yes      | `set-via-secret-manager`      |
| `HMAC_SECRET_FILE`   | No       | `/run/secrets/qr_hmac_secret` |
| `LOG_LEVEL`          | No       | `info`                        |
| `REQUEST_TIMEOUT_MS` | No       | `10000`                       |

## AI Appearance Service (`ai-service/.env`)

Node API gateway variables:

| Variable             | Required | Example                 | Description                                  |
| -------------------- | -------- | ----------------------- | -------------------------------------------- |
| `PORT`               | Yes      | `8701`                  | AI Node API port.                            |
| `PYTHON_SERVICE_URL` | Yes      | `http://localhost:8700` | Python core base URL consumed by Node API.   |
| `LOG_LEVEL`          | No       | `info`                  | Logging level for AI Node API.               |
| `REQUEST_TIMEOUT_MS` | No       | `10000`                 | Timeout for Node -> Python calls.            |

Python core variables:

| Variable                     | Required | Example                       | Description                                                    |
| ---------------------------- | -------- | ----------------------------- | -------------------------------------------------------------- |
| `AI_MODEL_PATH`              | Yes      | `/models/best.pt`             | YOLO weights path used by `/verify`.                           |
| `AI_INFERENCE_DEVICE`        | No       | `cpu`                         | Inference device (`cpu`, `mps`, `cuda:0` depending on runtime). |
| `AI_INFERENCE_IMG_SIZE`      | No       | `640`                         | Inference image size.                                          |
| `AI_CONFIDENCE_THRESHOLD`    | No       | `0.5`                         | Minimum detection confidence used by YOLO predict (strict mode default). |
| `AI_COUNTERFEIT_MIN_SCORE`   | No       | `0.6`                         | Minimum counterfeit label confidence that forces reject.       |
| `AI_AUTHENTIC_MIN_SCORE`     | No       | `0.75`                        | Minimum authentic label confidence required for acceptance.    |
| `AI_COUNTERFEIT_LABELS`      | No       | `counterfeit,fake,gia`        | Comma-separated aliases interpreted as counterfeit class.      |
| `AI_AUTHENTIC_LABELS`        | No       | `authentic,genuine,real`      | Comma-separated aliases interpreted as authentic class.        |

Root compose convenience overrides:

- `DATN_AI_VERIFICATION_ENABLED`
- `DATN_AI_VERIFICATION_PROFILE`
- `DATN_AI_VERIFICATION_PROFILE_FILE`
- `DATN_AI_VERIFICATION_STRICT_CONFIG`
- `DATN_AI_VERIFICATION_URL`
- `DATN_AI_VERIFICATION_TIMEOUT_MS`
- `DATN_AI_VERIFICATION_FAIL_OPEN`
- `DATN_AI_VERIFICATION_OWNER_SERVICE`
- `DATN_AI_VERIFICATION_OWNER_ML`
- `DATN_AI_VERIFICATION_OWNER_ONCALL`
- `DATN_AI_VERIFICATION_RUNBOOK_PATH`
- `DATN_AI_VERIFICATION_RUNBOOK_ESCALATION`
- `DATN_AI_INFERENCE_DEVICE`
- `DATN_AI_INFERENCE_IMG_SIZE`
- `DATN_AI_CONFIDENCE_THRESHOLD`
- `DATN_AI_COUNTERFEIT_MIN_SCORE`
- `DATN_AI_AUTHENTIC_MIN_SCORE`
- `DATN_AI_COUNTERFEIT_LABELS`
- `DATN_AI_AUTHENTIC_LABELS`

## Blockchain Defaults (`blockchain/.env.example`)

| Variable          | Example       |
| ----------------- | ------------- |
| `CHANNEL_NAME`    | `mychannel`   |
| `CC_NAME`         | `drugtracker` |
| `CC_VERSION`      | `1.0`         |
| `CC_SEQUENCE`     | `1`           |
| `QR_DATA_HASH`    | `a1b2c3d4`    |
| `QR_TOKEN_DIGEST` | `6f1af1...`   |

## Unified Workspace Orchestration

When using root stack orchestration (`./scripts/run-all.sh`), backend Fabric paths are mounted into the container as:

- `/fabric/organizations/peerOrganizations/regulator.drugguard.vn/...`
- `/fabric/organizations/peerOrganizations/manufacturer.drugguard.vn/...`
- `/fabric/organizations/peerOrganizations/distributor.drugguard.vn/...`

Root stack secret inputs:

- `DATN_BACKEND_JWT_SECRET` or `DATN_BACKEND_JWT_SECRET_FILE`
- `DATN_QR_HMAC_SECRET` or `DATN_QR_HMAC_SECRET_FILE`

If missing in local runs, `scripts/run-all.sh` generates ephemeral runtime values by default.

For root local docker-compose, backend uses:

- `FABRIC_PROFILE=local`
- `FABRIC_STRICT_CREDENTIALS=false`

To test staging/prod style config locally, mount your credential bundle and set:

- `FABRIC_PROFILE=staging` (or `prod`)
- `FABRIC_PROFILE_FILE=/path/to/your-profile.json`
- `FABRIC_STRICT_CREDENTIALS=true`
