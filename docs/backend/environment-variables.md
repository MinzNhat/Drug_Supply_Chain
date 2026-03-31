# Environment Variables

## Backend (`backend/.env`)

| Variable                             | Required | Example                 | Description                                    |
| ------------------------------------ | -------- | ----------------------- | ---------------------------------------------- |
| `PORT`                               | Yes      | `8090`                  | Backend HTTP port.                             |
| `MONGO_URI`                          | Yes      | `mongodb://mongo:27017` | Mongo connection for backend metadata/indexes. |
| `MONGO_DB`                           | Yes      | `drug_guard`            | Backend database name.                         |
| `QR_SERVICE_URL`                     | Yes      | `http://localhost:8080` | Protected QR API base URL.                     |
| `JWT_SECRET`                         | Yes      | `set-via-secret-manager` | JWT signing key (or use `JWT_SECRET_FILE`).    |
| `JWT_SECRET_FILE`                    | No       | `/run/secrets/backend_jwt_secret` | File path containing JWT secret. |
| `JWT_EXPIRES_IN`                     | No       | `8h`                    | JWT expiration.                                |
| `LOG_LEVEL`                          | No       | `info`                  | Logging level.                                 |
| `REQUEST_TIMEOUT_MS`                 | No       | `10000`                 | Inter-service HTTP timeout.                    |
| `AI_VERIFICATION_ENABLED`            | No       | `false`                 | Enables optional packaging AI verification.    |
| `AI_VERIFICATION_URL`                | No       | `http://localhost:8700` | AI verification API base URL.                  |
| `AI_VERIFICATION_TIMEOUT_MS`         | No       | `10000`                 | Timeout for AI verification calls.             |
| `AI_VERIFICATION_FAIL_OPEN`          | No       | `true`                  | Allow verification to continue if AI is down.  |
| `FABRIC_ENABLED`                     | Yes      | `true`                  | Enables Fabric Gateway integration.            |
| `FABRIC_PROFILE`                     | No       | `local`                 | Fabric runtime profile (`local|staging|prod`). |
| `FABRIC_PROFILE_FILE`                | No       | `backend/config/fabric-profiles/staging.example.json` | JSON profile file for org endpoints and credentials. |
| `FABRIC_STRICT_CREDENTIALS`          | No       | `false` (local), `true` (staging/prod) | Fail startup on invalid/missing Fabric material. |
| `FABRIC_CHANNEL_NAME`                | Yes      | `mychannel`             | Fabric channel name.                           |
| `FABRIC_CHAINCODE_NAME`              | Yes      | `drugtracker`           | Chaincode/contract name.                       |
| `FABRIC_EVALUATE_TIMEOUT_MS`         | No       | `5000`                  | Evaluate call deadline.                        |
| `FABRIC_SUBMIT_TIMEOUT_MS`           | No       | `15000`                 | Submit call deadline.                          |
| `FABRIC_COMMIT_STATUS_TIMEOUT_MS`    | No       | `20000`                 | Commit status deadline.                        |
| `FABRIC_EVALUATE_RETRY_MAX_ATTEMPTS` | No       | `3`                     | Evaluate retry attempts.                       |
| `FABRIC_SUBMIT_RETRY_MAX_ATTEMPTS`   | No       | `1`                     | Submit retry attempts.                         |
| `FABRIC_PUBLIC_SCAN_ROLE`            | No       | `Regulator`             | Role identity for public scan ledger calls.    |

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

Resolution priority for Fabric org fields:

1. `FABRIC_<ROLE>_*` environment variables
2. `FABRIC_PROFILE_FILE` JSON values
3. Role default MSP fallback (`ManufacturerMSP`, `DistributorMSP`, `RegulatorMSP`)

MSP alias behavior:

- API auth accepts both canonical MSPs (`ManufacturerMSP`, `DistributorMSP`, `RegulatorMSP`) and test-network aliases (`Org2MSP`, `Org3MSP`, `Org1MSP`).
- Backend stores and uses canonical MSPs internally for consistent API contracts.
- Fabric Gateway `*_MSP_ID` must match your actual certificate MSP (for Fabric test-network defaults: `Org2MSP`, `Org3MSP`, `Org1MSP`).

Each role needs:

- `*_MSP_ID`
- `*_PEER_ENDPOINT`
- `*_PEER_HOST_ALIAS`
- `*_TLS_CERT_PATH`
- `*_CERT_PATH`
- `*_KEY_PATH`

Example for Fabric test-network identities:

- `FABRIC_MANUFACTURER_MSP_ID=Org2MSP`
- `FABRIC_MANUFACTURER_CERT_PATH=.../User1@org2.example.com/msp/signcerts/User1@org2.example.com-cert.pem`
- `FABRIC_MANUFACTURER_KEY_PATH=.../User1@org2.example.com/msp/keystore`
- `FABRIC_DISTRIBUTOR_MSP_ID=Org3MSP`
- `FABRIC_REGULATOR_MSP_ID=Org1MSP`

## Protected QR (`protected-qr/.env`)

| Variable             | Required | Example                 |
| -------------------- | -------- | ----------------------- |
| `PORT`               | Yes      | `8080`                  |
| `MONGO_URI`          | Yes      | `mongodb://mongo:27017` |
| `MONGO_DB`           | Yes      | `protected_qr`          |
| `PYTHON_SERVICE_URL` | Yes      | `http://localhost:8000` |
| `HMAC_SECRET`        | Yes      | `set-via-secret-manager` |
| `HMAC_SECRET_FILE`   | No       | `/run/secrets/qr_hmac_secret` |
| `LOG_LEVEL`          | No       | `info`                  |
| `REQUEST_TIMEOUT_MS` | No       | `10000`                 |

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

- `/fabric/organizations/peerOrganizations/org1.example.com/...`
- `/fabric/organizations/peerOrganizations/org2.example.com/...`
- `/fabric/organizations/peerOrganizations/org3.example.com/...`

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
