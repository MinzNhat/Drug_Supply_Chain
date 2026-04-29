#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

BACKEND_URL="${DATN_STAGING_BACKEND_URL:-http://localhost:8090}"
QR_SERVICE_URL="${DATN_STAGING_QR_URL:-http://localhost:8080}"
AI_SERVICE_URL="${DATN_STAGING_AI_URL:-http://localhost:8701}"

MAX_RETRIES="${DATN_STAGING_SMOKE_RETRIES:-30}"
RETRY_DELAY_SECONDS="${DATN_STAGING_SMOKE_DELAY_SECONDS:-2}"
RUN_CHAINCODE_SMOKE="${DATN_STAGING_CHAINCODE_SMOKE:-true}"
BOOTSTRAP_E2E_DEPS="${DATN_STAGING_BOOTSTRAP_E2E_DEPS:-false}"

require_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "Missing required command: $1" >&2
        exit 1
    fi
}

wait_for_health() {
    local name="$1"
    local url="$2"
    local attempt=1

    while [[ "${attempt}" -le "${MAX_RETRIES}" ]]; do
        local status
        status="$(curl -sS -o /dev/null -w "%{http_code}" "${url}" || true)"

        if [[ "${status}" == "200" ]]; then
            echo "[smoke] ${name} healthy at ${url}"
            return 0
        fi

        echo "[smoke] waiting for ${name} (${attempt}/${MAX_RETRIES}, status=${status})"
        attempt=$((attempt + 1))
        sleep "${RETRY_DELAY_SECONDS}"
    done

    echo "[smoke] ${name} did not become healthy at ${url}" >&2
    return 1
}

maybe_bootstrap_e2e_deps() {
    if [[ "${BOOTSTRAP_E2E_DEPS}" != "true" ]]; then
        return 0
    fi

    if [[ ! -f "${ROOT_DIR}/backend/package.json" ]]; then
        echo "[smoke] backend package.json not found for dependency bootstrap" >&2
        return 1
    fi

    echo "[smoke] bootstrapping backend dependencies for chaincode smoke"
    (
        cd "${ROOT_DIR}/backend"
        npm ci --no-audit --no-fund
    )
}

run_chaincode_smoke() {
    if [[ "${RUN_CHAINCODE_SMOKE}" != "true" ]]; then
        echo "[smoke] chaincode connectivity smoke skipped"
        return 0
    fi

    require_cmd node
    maybe_bootstrap_e2e_deps

    echo "[smoke] running chaincode connectivity probe via e2e-runtime flow"
    (
        cd "${ROOT_DIR}"
        BASE_URL="${BACKEND_URL}" node scripts/backend/e2e-runtime.mjs
    )
}

main() {
    require_cmd curl

    wait_for_health "backend" "${BACKEND_URL}/health"
    wait_for_health "protected-qr" "${QR_SERVICE_URL}/health"
    wait_for_health "ai-service" "${AI_SERVICE_URL}/health"
    run_chaincode_smoke

    echo "[smoke] staging smoke checks passed"
}

main "$@"