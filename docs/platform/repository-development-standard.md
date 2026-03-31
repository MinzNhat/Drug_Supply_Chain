# Repository Development Standard

## 1. Scope

This standard defines shared engineering rules for the DATN workspace before further supply-chain feature development.

Applies to:

- `backend/`
- `protected-qr/`
- `blockchain/`
- root orchestration scripts and deployment assets

## 2. Code Convention Baseline

### 2.1 Naming and boundaries

- Use `camelCase` in backend/protected-qr internal domain logic.
- Use boundary mappers when converting naming conventions at external interfaces.
- Keep route/controller code thin; place orchestration logic in services.
- Keep persistence and external system interactions in repositories/integration clients.

### 2.2 Error and logging

- Standardize errors as `code`, `message`, `trace_id`, optional `details`.
- Propagate `x-trace-id` from edge middleware through service logs.
- Keep logs structured JSON in runtime services.

### 2.3 Formatting and text normalization

- Root `.editorconfig` is mandatory baseline.
- Root `.gitattributes` enforces LF normalization for text files.

### 2.4 Commenting standard

- Prefer self-explanatory code; add comments only for non-obvious intent.
- Avoid redundant comments that restate the code.
- Keep comments action-oriented and boundary-focused (assumptions, constraints, side effects).
- Use API doc comments for exported/public functions and integration boundaries.

## 3. Infrastructure Convention Baseline

- Root `docker-compose.yml` is canonical integration stack.
- Root scripts are canonical lifecycle entry points (`scripts/run-all.sh`, `scripts/test-all.sh`, `scripts/quality-gate.sh`).
- DATN is managed as a single git root with centralized ignore and standards policy.
- Secrets must not be hardcoded for non-local environments.

## 4. Structure Convention Baseline

- Keep technical docs in `docs/` only.
- Keep agent operational notes and implementation memory in `agent-memory/` only.
- Keep test execution artifacts under `test-output/` with standardized schema.
- Avoid introducing duplicate orchestration entrypoints unless compatibility requires it.

## 5. Development Process Baseline

### 5.1 Pre-merge validation

Run from root:

```bash
./scripts/quality-gate.sh quick
```

For integration-sensitive changes:

```bash
./scripts/quality-gate.sh full
```

### 5.2 Commit standard

- Use Conventional Commits.
- Keep each commit logically isolated (infra, api, docs, tests).

### 5.3 Documentation and memory policy

- Update docs for public behavior changes.
- Update `agent-memory/` for architecture decisions, infra decisions, and process updates.

## 6. Implementation Flow Standard

Before coding:

1. Confirm affected module boundaries (route/service/repository/integration).
2. Confirm impact on root orchestrator (`scripts/run-all.sh`, `scripts/test-all.sh`).

During coding:

1. Keep changes scoped and avoid unrelated refactors.
2. Preserve existing API contract unless explicitly changing versioned behavior.

Before merge:

1. Run `./scripts/quality-gate.sh quick`.
2. For infra/integration sensitive changes, run `./scripts/quality-gate.sh full`.
3. Update docs and `agent-memory/` notes for significant decisions.
