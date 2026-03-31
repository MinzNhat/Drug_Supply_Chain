# Cross-Project Convention Checklist

## Purpose

Apply one consistent style between Backend, Protected QR, and Blockchain integration-facing code.

## Applied Rules

### Naming

- [x] Use `camelCase` inside Backend service/domain code.
- [x] Use `snake_case` at external protocol boundaries (Protected QR payloads and chaincode-like fields).
- [x] Use explicit mapper functions for boundary conversion.
- [x] Normalize MSP aliases (`Org1MSP/Org2MSP/Org3MSP`) to canonical app MSPs (`RegulatorMSP/ManufacturerMSP/DistributorMSP`) at auth boundary.

### Error Model

- [x] Standardized error payload with `code`, `message`, `trace_id`.
- [x] Include optional `details` for validation and troubleshooting context.

### Logging

- [x] Structured JSON logs via Winston in both Backend and Protected QR.
- [x] Include `service` default metadata.
- [x] Propagate `trace_id` via `x-trace-id` middleware.

### DTO And Docs

- [x] Document endpoint to chaincode mapping in Backend integration contract.
- [x] Document environment variables and local runbook.
- [x] Document optional AI verification adapter contract for `packagingImage` lane.
- [x] Provide root-level one-command orchestration (`scripts/run-all.sh`).

### Markdown Style

- [x] Use concise heading hierarchy (`#`, `##`, `###`).
- [x] Use simple checklists for implementation status.
- [x] Keep examples in fenced code blocks.

## Reference Files

- `src/mappers/ledger.mapper.js`
- `src/middleware/error-handler.js`
- `src/middleware/request-context.js`
- `../protected-qr/src/middleware/error-handler.ts`
- `../protected-qr/src/middleware/request-context.ts`
- `integration-contract.md`
- `runbook-local-e2e.md`
- `../docs/platform/flow-conformance-matrix.md`
