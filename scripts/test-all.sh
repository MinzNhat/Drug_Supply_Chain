#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${TEST_OUTPUT_DIR:-${ROOT_DIR}/test-output}"
RUNNER="${ROOT_DIR}/scripts/run-all.sh"
MODE="${1:-full}"

mkdir -p "${OUTPUT_DIR}"

slugify() {
    local raw="$1"
    echo "${raw}" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g; s/-\{2,\}/-/g; s/^-//; s/-$//'
}

run_step() {
    local id="$1"
    local name="$2"
    local description="$3"
    shift 3

    local file="${OUTPUT_DIR}/test_$(printf "%03d" "${id}")_$(slugify "${name}").txt"
    local started_at
    local ended_at
    local status="SUCCESS"

    started_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

    {
        echo "description: ${description}"
        echo "input: $*"
        echo "started_at: ${started_at}"
        echo "output:"
    } > "${file}"

    if "$@" >> "${file}" 2>&1; then
        status="SUCCESS"
    else
        status="FAILED"
    fi

    ended_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    {
        echo
        echo "ended_at: ${ended_at}"
        echo "status: ${status}"
    } >> "${file}"

    if [[ "${status}" != "SUCCESS" ]]; then
        echo "Step failed. See ${file}"
        exit 1
    fi
}

run_full_suite() {
    run_step 1 "prerequisites" "Install Fabric prerequisites and validate base tooling." "${RUNNER}" prereq
    run_step 2 "bring-up" "Start full stack (Fabric + services) with centralized orchestration." "${RUNNER}" up
    run_step 3 "runtime-e2e" "Execute end-to-end runtime API flow against healthy services." env STACK_BUILD_IMAGES=false STACK_BUILD_E2E_RUNNER=true "${RUNNER}" test
    run_step 4 "geo-flow-e2e" "Validate event ingest -> timeline -> heatmap API flow with auth scope assertions." env STACK_BUILD_IMAGES=false STACK_BUILD_E2E_RUNNER=false "${RUNNER}" test-geo
    run_step 5 "transfer-batch" "Validate ownership transfer workflow with dedicated ship/receive E2E flow." env STACK_BUILD_IMAGES=false STACK_BUILD_E2E_RUNNER=false "${RUNNER}" test-transfer
    run_step 6 "teardown" "Stop all services and clean runtime artifacts after validation." "${RUNNER}" down
}

run_single_mode() {
    case "${MODE}" in
        prereq)
            run_step 1 "prerequisites" "Install Fabric prerequisites and validate base tooling." "${RUNNER}" prereq
            ;;
        up)
            run_step 2 "bring-up" "Start full stack (Fabric + services) with centralized orchestration." "${RUNNER}" up
            ;;
        test)
            run_step 3 "runtime-e2e" "Execute end-to-end runtime API flow against healthy services." "${RUNNER}" test
            ;;
        transfer)
            run_step 5 "transfer-batch" "Validate ownership transfer workflow with dedicated ship/receive E2E flow." "${RUNNER}" test-transfer
            ;;
        geo)
            run_step 4 "geo-flow-e2e" "Validate event ingest -> timeline -> heatmap API flow with auth scope assertions." "${RUNNER}" test-geo
            ;;
        down)
            run_step 6 "teardown" "Stop all services and clean runtime artifacts after validation." "${RUNNER}" down
            ;;
        full)
            run_full_suite
            ;;
        *)
            echo "Unknown mode: ${MODE}"
            echo "Usage: ./scripts/test-all.sh [full|prereq|up|test|geo|transfer|down]"
            exit 1
            ;;
    esac
}

run_single_mode
