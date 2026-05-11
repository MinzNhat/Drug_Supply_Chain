#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BLOCKCHAIN_SCRIPT_DIR="${ROOT_DIR}/scripts/blockchain"

# Ensure Fabric binaries are in PATH
export PATH="${ROOT_DIR}/blockchain/bin:${ROOT_DIR}/blockchain/test-network/bin:${PATH}"
export FABRIC_CFG_PATH="${ROOT_DIR}/blockchain/config"

ADD_ORG3_DIR="${ROOT_DIR}/blockchain/test-network/addOrg3"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.yml"
MODE="${1:-full}"

STACK_CHANNEL_NAME="${STACK_CHANNEL_NAME:-mychannel}"
STACK_INCLUDE_ORG3="${STACK_INCLUDE_ORG3:-true}"
STACK_BUILD_IMAGES="${STACK_BUILD_IMAGES:-true}"
STACK_BUILD_E2E_RUNNER="${STACK_BUILD_E2E_RUNNER:-auto}"
STACK_AUTO_GENERATE_SECRETS="${STACK_AUTO_GENERATE_SECRETS:-true}"
E2E_RUNNER_PREPARED="false"

usage() {
    cat <<'EOF'
Usage:
    ./scripts/run-all.sh [prereq|up|test|test-geo|test-transfer|test-transfer-negative|test-ai|test-capacity|full|down|status]

Modes:
  prereq  Install Fabric prerequisites via test-network helper.
  up      Start Fabric network + chaincode + org3 and app services.
  test    Run runtime E2E against running stack.
    test-geo Run geo-flow E2E against running stack.
    test-transfer  Run transfer-batch E2E against running stack.
    test-transfer-negative  Run transfer negative-path E2E against running stack.
    test-ai Run AI edge-path + alert/report E2E against running stack.
        test-capacity Run SLO/capacity gate scenarios against running stack.
    full    Run up then runtime E2E, geo-flow E2E, transfer-batch E2E, transfer negative-path E2E, and AI edge-path E2E.
  down    Stop app services and tear down Fabric network.
  status  Print app and Fabric container status.
  setup-admin Create initial admin and high-level regulator users.

Optional environment variables:
  STACK_CHANNEL_NAME=mychannel
  STACK_INCLUDE_ORG3=true|false
  STACK_BUILD_IMAGES=true|false
    STACK_BUILD_E2E_RUNNER=auto|true|false
EOF
}

need_cmd() {
    local cmd="$1"
    if ! command -v "${cmd}" >/dev/null 2>&1; then
        echo "Missing required command: ${cmd}"
        exit 1
    fi
}

compose_cmd() {
    docker compose -f "${COMPOSE_FILE}" "$@"
}

is_insecure_secret() {
    local value="${1:-}"
    local lowered
    lowered="$(printf '%s' "${value}" | tr '[:upper:]' '[:lower:]')"

    case "${lowered}" in
        ""|change_me|changeme|replace_me|replace-with-strong-secret|replace_with_strong_secret)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

generate_secret() {
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -hex 32
        return
    fi

    od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
}

ensure_runtime_secret() {
    local env_key="$1"
    local file_env_key="$2"
    local label="$3"
    local current_value="${!env_key:-}"
    local file_value="${!file_env_key:-}"

    if [[ -n "${file_value}" ]]; then
        return
    fi

    if ! is_insecure_secret "${current_value}"; then
        return
    fi

    if [[ "${STACK_AUTO_GENERATE_SECRETS}" != "true" ]]; then
        echo "Missing secure ${label}. Set ${env_key} or ${file_env_key}."
        exit 1
    fi

    current_value="$(generate_secret)"
    export "${env_key}=${current_value}"
    echo "Generated ephemeral ${label} for this run (${env_key})."
}

prepare_runtime_secrets() {
    ensure_runtime_secret "DATN_BACKEND_JWT_SECRET" "DATN_BACKEND_JWT_SECRET_FILE" "backend JWT secret"
    ensure_runtime_secret "DATN_QR_HMAC_SECRET" "DATN_QR_HMAC_SECRET_FILE" "protected-qr HMAC secret"
}

ensure_e2e_runner_image() {
    if [[ "${E2E_RUNNER_PREPARED}" == "true" ]]; then
        return
    fi

    local should_build="false"
    case "${STACK_BUILD_E2E_RUNNER}" in
        true)
            should_build="true"
            ;;
        false)
            should_build="false"
            ;;
        auto)
            if [[ "${STACK_BUILD_IMAGES}" == "true" ]]; then
                should_build="true"
            elif ! docker image inspect datn-e2e-runner:latest >/dev/null 2>&1; then
                should_build="true"
            fi
            ;;
        *)
            echo "Invalid STACK_BUILD_E2E_RUNNER: ${STACK_BUILD_E2E_RUNNER}"
            exit 1
            ;;
    esac

    if [[ "${should_build}" == "true" ]]; then
        compose_cmd build e2e-runner
    fi

    E2E_RUNNER_PREPARED="true"
}

wait_for_http() {
    local url="$1"
    local retries="${2:-80}"
    local delay="${3:-2}"

    for _ in $(seq 1 "${retries}"); do
        if curl -fsS "${url}" >/dev/null 2>&1; then
            return 0
        fi
        sleep "${delay}"
    done

    echo "Service not ready: ${url}"
    return 1
}

run_prereq() {
    "${BLOCKCHAIN_SCRIPT_DIR}/blockchain-run.sh" prereq
}

run_up() {
    "${BLOCKCHAIN_SCRIPT_DIR}/blockchain-run.sh" full

    if [[ "${STACK_INCLUDE_ORG3}" == "true" ]]; then
        (cd "${ADD_ORG3_DIR}" && ./addOrg3.sh up -c "${STACK_CHANNEL_NAME}")
    fi

    if [[ "${STACK_BUILD_IMAGES}" == "true" ]]; then
        compose_cmd up -d --build mongo ipfs qr-python-core qr-service ai-python-core ai-service backend
    else
        compose_cmd up -d mongo ipfs qr-python-core qr-service ai-python-core ai-service backend
    fi

    wait_for_http "http://localhost:8080/health" 80 2
    wait_for_http "http://localhost:8700/health" 80 2
    wait_for_http "http://localhost:8701/health" 80 2
    wait_for_http "http://localhost:8090/health" 80 2
    
    run_setup_data

    echo "Stack is ready."
}

run_test() {
    ensure_e2e_runner_image
    compose_cmd --profile e2e run --rm e2e-runner
}

run_test_geo() {
    ensure_e2e_runner_image
    compose_cmd --profile e2e run --rm e2e-runner node scripts/backend/e2e-geo-flow.mjs
}

run_test_transfer() {
    ensure_e2e_runner_image
    compose_cmd --profile e2e run --rm e2e-runner node scripts/backend/e2e-transfer-batch.mjs
}

run_test_transfer_negative() {
    ensure_e2e_runner_image
    compose_cmd --profile e2e run --rm e2e-runner node scripts/backend/e2e-transfer-negative.mjs
}

run_test_ai() {
    if [[ "${STACK_BUILD_IMAGES}" == "true" ]]; then
        compose_cmd --profile e2e-ai up -d --build --force-recreate --remove-orphans ai-verifier-mock backend-ai-reject backend-ai-open backend-ai-close
    else
        compose_cmd --profile e2e-ai up -d --force-recreate --remove-orphans ai-verifier-mock backend-ai-reject backend-ai-open backend-ai-close
    fi

    wait_for_http "http://localhost:8095/health" 80 2
    wait_for_http "http://localhost:8093/health" 80 2
    wait_for_http "http://localhost:8091/health" 80 2
    wait_for_http "http://localhost:8092/health" 80 2

    ensure_e2e_runner_image
    compose_cmd --profile e2e --profile e2e-ai run --rm \
        -e AI_REJECT_BASE_URL=http://backend-ai-reject:8090 \
        -e AI_FAIL_OPEN_BASE_URL=http://backend-ai-open:8090 \
        -e AI_FAIL_CLOSE_BASE_URL=http://backend-ai-close:8090 \
        e2e-runner node scripts/backend/e2e-ai-alerting.mjs
}

run_test_capacity() {
    ensure_e2e_runner_image
    compose_cmd --profile e2e run --rm e2e-runner node scripts/backend/e2e-capacity-gate.mjs
}

run_down() {
    compose_cmd down -v --remove-orphans || true
    "${BLOCKCHAIN_SCRIPT_DIR}/blockchain-run.sh" down || true
}

run_status() {
    compose_cmd ps
    echo
    docker ps --format '{{.Names}}\t{{.Status}}' | grep -E 'orderer|peer0\.org|ca_org|chaincode' || true
}

run_setup_data() {
    echo "Setting up initial admin and province data..."
    docker exec drug-guard-backend node /app/scripts/create-admin.mjs
    docker exec drug-guard-backend node /app/scripts/seed-provinces.mjs
}

main() {
    need_cmd docker
    need_cmd curl

    if [[ "${MODE}" == "-h" || "${MODE}" == "--help" ]]; then
        usage
        return 0
    fi

    prepare_runtime_secrets

    case "${MODE}" in
        prereq)
            run_prereq
            ;;
        up)
            run_up
            ;;
        test)
            run_test
            ;;
        test-geo)
            run_test_geo
            ;;
        test-transfer)
            run_test_transfer
            ;;
        test-transfer-negative)
            run_test_transfer_negative
            ;;
        test-ai)
            run_test_ai
            ;;
        test-capacity)
            run_test_capacity
            ;;
        full)
            run_up
            run_test
            run_test_geo
            run_test_transfer
            run_test_transfer_negative
            run_test_ai
            ;;
        down)
            run_down
            ;;
        status)
            run_status
            ;;
        setup-admin)
            run_setup_data
            ;;
        *)
            echo "Unknown mode: ${MODE}"
            usage
            exit 1
            ;;
    esac
}

main