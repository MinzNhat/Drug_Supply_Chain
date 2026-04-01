# Secret Management Standard

## Purpose

Define how secrets are handled across `dev`, `staging`, and `prod` for DATN services.

## Secret Matrix

| Secret                     | Service         | Dev Source                                                    | Staging Source                             | Prod Source                                    | Rotation Owner            |
| -------------------------- | --------------- | ------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------- | ------------------------- |
| `DATN_BACKEND_JWT_SECRET`  | Backend         | Auto-generated per `scripts/run-all.sh` run (or local `.env`) | CI/CD secret store injects env or file     | Secret manager injects env/file at deploy time | Backend platform owner    |
| `DATN_QR_HMAC_SECRET`      | Protected QR    | Auto-generated per `scripts/run-all.sh` run (or local `.env`) | CI/CD secret store injects env or file     | Secret manager injects env/file at deploy time | Protected-QR owner        |
| Fabric identity keys/certs | Backend gateway | Local mounted test-network artifacts                          | Environment-specific secure artifact store | HSM/KMS-backed identity store policy target    | Blockchain platform owner |

## Loading Mechanism

### Root compose runtime

Root `docker-compose.yml` now consumes:

- `DATN_BACKEND_JWT_SECRET` or `DATN_BACKEND_JWT_SECRET_FILE`
- `DATN_QR_HMAC_SECRET` or `DATN_QR_HMAC_SECRET_FILE`

### Application-level fallback

- Backend accepts `JWT_SECRET` or `JWT_SECRET_FILE`.
- Protected-QR accepts `HMAC_SECRET` or `HMAC_SECRET_FILE`.

### Local safety behavior

`scripts/run-all.sh` auto-generates ephemeral secrets if secure values are not provided:

- `DATN_BACKEND_JWT_SECRET`
- `DATN_QR_HMAC_SECRET`

Disable auto-generation by setting:

- `STACK_AUTO_GENERATE_SECRETS=false`

### CI behavior

Workflow injects secrets from repository/organization secrets:

- `secrets.DATN_BACKEND_JWT_SECRET`
- `secrets.DATN_QR_HMAC_SECRET`

If unavailable (for example fork-safe contexts), workflow generates short-lived random values for the job.

## Rotation Runbook

### Backend JWT secret

1. Generate new secret in secret manager.
2. Update staging secret value.
3. Deploy staging and verify login/token flows.
4. Update prod secret value.
5. Deploy prod during maintenance window.
6. Revoke old secret from manager and rotation logs.

### Protected-QR HMAC secret

1. Generate new HMAC secret in secret manager.
2. Roll out to staging and validate generate/verify flows.
3. Roll out to prod with controlled cutover.
4. Revoke old value after post-deploy verification.

## Revocation Procedure

Trigger revocation immediately when any secret exposure is suspected.

1. Mark incident and freeze deployments.
2. Rotate affected secret(s) in manager.
3. Redeploy impacted services with new values.
4. Invalidate active sessions/tokens where applicable.
5. Audit logs for suspicious usage by trace window.
6. Close incident with root cause and preventive actions.

## Security Checklist

- No plaintext production secrets committed to git.
- No weak placeholder secret strings in deployable runtime profiles.
- CI injects secrets from secure context, not repository plaintext.
- Secret rotation evidence logged per environment.
- Docs and env examples show secure loading path.
