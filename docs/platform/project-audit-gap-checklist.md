# Project Audit Gap Checklist

## Scope

This checklist summarizes current gaps after root-level centralization work and recent runtime/transfer E2E updates.

## 1) Supply-Chain Functional Gaps

1. Geospatial event APIs exist, but no dedicated automated E2E scenario validates end-to-end behavior for event ingest, timeline query, and heatmap aggregation.
2. Role-based negative-path tests are still thin for transfer lifecycle (forbidden actor, wrong owner, repeated receive).
3. Counterfeit alerting is still response-level only; no external alert sink (email/SIEM/case management) is wired.
4. AI packaging verification lane is adapter-ready but still optional and not validated in runtime E2E with a real service.

## 2) Test Coverage Gaps

1. Runtime transfer E2E is now separated and logged, but current E2E focus remains batch create/verify/ship/receive/read.
2. No automated E2E for these frontend-facing APIs:
   - POST /api/v1/batches/:batchId/events
   - GET /api/v1/batches/:batchId/events
   - GET /api/v1/analytics/heatmap
3. Existing backend tests are mostly mapper/error/msp utilities plus selected service integration cases; API-level contract regressions are still under-covered.

## 3) Convention And Repository Structure Gaps

1. DATN is now a single git root with centralized ignore/governance policy at workspace level.
2. Root orchestration is canonical, but standalone scripts/compose files should be treated as compatibility layers and documented as such.

## 4) Docker Centralization Decision

1. Keep root docker-compose.yml as canonical integration stack.
2. Keep protected-qr/docker-compose.yml for isolated service development.
3. Keep blockchain/test-network scripts and compose topology because Fabric bootstrap concerns are domain-specific and not practical to flatten into one generic compose file.

## 5) Recommended Next Iteration (Priority)

1. Add one E2E script for geo/timeline/heatmap flow and wire it into scripts/test-all.sh as a dedicated logged step.
2. Add negative-path transfer E2E assertions (unauthorized ship/receive, invalid target owner MSP).
3. Add CI gate to fail when any generated test-output step status is FAILED.
4. Add alert sink interface and one minimal implementation stub for counterfeit/recalled batch events.
