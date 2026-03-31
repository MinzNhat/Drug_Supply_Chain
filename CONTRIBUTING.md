# Contributing Guide

This workspace uses a root-orchestrated development model for three domains:

- `backend/`
- `protected-qr/`
- `blockchain/`

## 1. Development Principles

- Keep business logic in service/repository layers.
- Keep protocol boundary translation in mappers.
- Keep transport-level concerns (HTTP schema, status code, auth headers) in routes/controllers/middleware.
- Keep shell orchestration centralized in `scripts/`.
- Keep documentation in `docs/` and operational memory in `agent-memory/`.

### Commenting standard

- Prefer clear naming and small functions over excessive comments.
- Add comments only for non-obvious intent, assumptions, constraints, or side effects.
- Keep exported function documentation up to date when behavior changes.

## 2. Branch And Commit Convention

Use short-lived branches:

- `feat/<scope>-<short-topic>`
- `fix/<scope>-<short-topic>`
- `chore/<scope>-<short-topic>`
- `docs/<scope>-<short-topic>`

Use Conventional Commit style:

- `feat(backend): add heatmap e2e scenario`
- `fix(infra): correct workflow trigger paths`
- `docs(platform): update rollout checklist`

## 3. Local Quality Gate

Run from workspace root:

```bash
./scripts/quality-gate.sh quick
```

Before merging integration-sensitive changes:

```bash
./scripts/quality-gate.sh full
```

`quick` runs module-level checks.

`full` runs module-level checks plus full orchestrated E2E via `scripts/test-all.sh full`.

## 4. Definition Of Done

- Code follows conventions in `docs/backend/conventions.md`.
- Code and process also follow `docs/platform/repository-development-standard.md`.
- Relevant tests pass.
- No broken runtime flow in root orchestrator.
- Documentation is updated when API/behavior changes.
- Memory notes in `agent-memory/` are updated for architecture or process decisions.

## 5. Repository Governance Note

DATN is governed as a single git root at workspace level.

- Keep ignore and standardization policy centralized at root unless intentionally splitting repositories in the future.
- Keep cross-domain changes reviewable by preserving clear scope in commits and pull requests.
