# Deployment Readiness Checklist

## 1) Unified Runtime Entry

Use root orchestration script:

```bash
./scripts/run-all.sh full
```

This provides a repeatable path for local deploy + test across blockchain, backend, and protected-qr.

Repository baseline quality gate:

```bash
./scripts/quality-gate.sh quick
./scripts/quality-gate.sh full
```

## 2) Chaincode Governance (Regulator / Ministry)

Lifecycle script: `scripts/blockchain/update-code-centralized.sh`

Hardening applied:

- `INSTALL_ORGS` auto-detects available org peers, including Org3 when present.
- `COMMIT_ORGS` auto-appends `REGULATOR_ORG` if omitted.
- approval and commit remain controlled by regulator identity.

Recommended release flow:

1. Prepare chaincode version and sequence bump.
2. Run `./scripts/blockchain/blockchain-run.sh full` in non-prod test environment.
3. Run `./scripts/blockchain/blockchain-smoke-test.sh`.
4. For upgrade, run `CC_VERSION=<x> CC_SEQUENCE=<y> ./scripts/blockchain/blockchain-run.sh upgrade`.
5. Verify `querycommitted` output and smoke test again.
6. Roll out backend/protected-qr image updates.

## 3) Operational Checks Before Deploy

1. Docker daemon healthy.
2. Fabric artifacts generated (`test-network/organizations`).
3. Backend health endpoint returns ok.
4. Protected QR service and Python core health endpoints return ok.
5. Runtime E2E returns `ok: true`.
6. Backend unit/integration tests pass.

## 4) Security And Secrets

- Never commit production private keys.
- Keep JWT/HMAC secrets outside source control.
- Keep Fabric user key directories mounted read-only in containers.
- Use environment-specific cert/key material per deployment stage.

## 5) Remaining Non-Blocking Improvements

- Plug real AI package-verification service into backend adapter endpoint.
- Add alert sink for counterfeit events.
- Add CI job that executes root `scripts/run-all.sh full` end-to-end.
