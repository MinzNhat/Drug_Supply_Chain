# Real-Life Pharma Supply Chain Checklist (Nationwide)

## A. API Coverage

- [x] Batch create/read lifecycle APIs.
- [x] Public verify (QR + ledger + optional AI adapter).
- [x] Transfer ownership (ship/receive).
- [x] Document CID update and recall.
- [x] Batch listing API for FE operational views.
- [x] Geospatial event ingest API with lat/lng.
- [x] Batch timeline API.
- [x] Heatmap aggregation API for FE map layer.

## B. Data And Observability

- [x] Request trace id propagation (`x-trace-id`).
- [x] Structured logs with service metadata.
- [x] Standardized error contract (`code`, `message`, `trace_id`, `details`).
- [x] Ledger snapshot cache (`BatchState`) for FE query performance.
- [x] Geo event model with geospatial index (`2dsphere`).

## C. Supply Chain Governance And Security

- [x] Role/MSP normalization and validation in auth flow.
- [x] Regulator authority for recall.
- [x] Chaincode lifecycle script enforces regulator participation in commit.
- [x] Org auto-detection for installation targets in lifecycle script.

## D. Deployment And Runtime Tooling

- [x] Unified stack orchestration (`./scripts/run-all.sh full`).
- [x] Full local E2E runtime script and CI workflow.
- [x] Docker compose health checks for core services.

## E. Gaps Before Nationwide Production Rollout

- [ ] External alerting pipeline (SIEM/SOC, SMS/email, incident workflow) for `SCAN_REJECTED` and `RECALL_ALERT`.
- [ ] Multi-region infra with DR and data residency policy per regulation.
- [ ] HSM/KMS-backed key custody and rotation policy for all org identities.
- [ ] Audit reporting portal for regulator with immutable evidence exports.
- [ ] SLA/SLO monitoring dashboards and on-call runbooks.
- [ ] Performance/capacity tests at nationwide peak traffic.
- [ ] Formal privacy and compliance hardening (PII minimization, retention, legal logs).

## F. Go-Live Recommendation

Current implementation is strong for pilot and phased rollout.

Recommended rollout stages:

1. Province-level pilot with real pharmacies and distributors.
2. Regional scale-up with alerting + SOC integration.
3. Nationwide rollout after load test and compliance sign-off.
