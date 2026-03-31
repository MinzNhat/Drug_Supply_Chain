# Drug Guard Unified Stack

Drug Guard is a root-orchestrated monorepo for pharmaceutical traceability.

It combines:

- Hyperledger Fabric network and chaincode for immutable supply-chain state.
- Backend API for auth, batch lifecycle, transfer, recall, event timeline, and analytics.
- Protected QR service (Node + Python core) for anti-counterfeit verification.

## Repository Layout

- `backend/`: business API, Fabric gateway integration, service-layer logic.
- `blockchain/`: Fabric network assets and chaincode source.
- `protected-qr/`: QR generation and verification services.
- `scripts/`: centralized orchestration and operational scripts.
- `docs/`: centralized technical, operational, and governance documentation.
- `test-output/`: standardized execution logs from root test orchestration.

## Local Architecture

Local E2E uses one root Docker Compose and root orchestration scripts:

1. Fabric network + chaincode come up.
2. Mongo + Protected QR + Backend services start.
3. Runtime API tests run against healthy services.
4. Transfer-batch E2E runs as a dedicated step.

## Prerequisites

- Docker Desktop (or compatible Docker engine) is running.
- Bash shell available.
- Host has enough memory for Fabric + app services.

## Canonical Commands

All commands are executed from repository root.

### Stack lifecycle

```bash
./scripts/run-all.sh prereq
./scripts/run-all.sh up
./scripts/run-all.sh test
./scripts/run-all.sh test-transfer
./scripts/run-all.sh full
./scripts/run-all.sh status
./scripts/run-all.sh down
```

### Standardized test-output logs

```bash
./scripts/test-all.sh full
./scripts/test-all.sh test
./scripts/test-all.sh transfer
```

### Baseline quality gate

```bash
./scripts/quality-gate.sh quick
./scripts/quality-gate.sh full
```

Generated artifacts follow the centralized schema described in `test-output/README.md`.

## Standard Test-Output Schema

Every generated step file contains:

1. `description`: what this step validates.
2. `input`: exact command executed.
3. `started_at`: UTC timestamp.
4. `output`: full stdout/stderr captured.
5. `ended_at`: UTC timestamp.
6. `status`: `SUCCESS` or `FAILED`.

## Documentation Map

- Docs index: `docs/README.md`
- Contributor guide: `CONTRIBUTING.md`
- Platform conformance matrix: `docs/platform/flow-conformance-matrix.md`
- Deployment readiness: `docs/platform/deployment-readiness.md`
- Nationwide readiness checklist: `docs/platform/nationwide-readiness-checklist.md`
- Project audit checklist: `docs/platform/project-audit-gap-checklist.md`
- Repository development standard: `docs/platform/repository-development-standard.md`
- Backend integration contract: `docs/backend/integration-contract.md`
- Backend supply-chain API: `docs/backend/supply-chain-api.md`
- Backend conventions: `docs/backend/conventions.md`
- Backend local E2E runbook: `docs/backend/runbook-local-e2e.md`
- Blockchain overview: `docs/blockchain/blockchain-overview.md`
- Protected QR overview: `docs/protected-qr/service-overview.md`

## Repository Standards

- Root-level scripts are the canonical operational interface.
- Root baseline standardization files are `.editorconfig`, `.gitattributes`, and `CONTRIBUTING.md`.
- Root `docker-compose.yml` is the primary local stack definition.
- DATN now uses a single git root at workspace level.
- Root `.gitignore` is the canonical ignore policy for the entire repository.
- Module-level `.gitignore` files are avoided unless a folder is intentionally split into a separate repository in the future.
- Docs are centralized under `docs/` and should not be duplicated in subprojects.

## Current Scope and Known Follow-ups

- Runtime and transfer ownership flows are covered by root E2E scripts.
- Geospatial event, timeline, and heatmap endpoints are available in backend APIs and should be expanded with dedicated E2E cases.
- Production hardening tasks remain in platform readiness documents (security, observability, and policy automation).
