#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-quick}"

usage() {
    cat <<'EOF'
Usage:
    ./scripts/quality-gate.sh [quick|full]

Modes:
    quick  Run backend tests + protected-qr build checks + chaincode unit tests.
  full   Run quick checks + full orchestrated stack validation.
EOF
}

ensure_cmd() {
    local cmd="$1"
    if ! command -v "${cmd}" >/dev/null 2>&1; then
        echo "Missing required command: ${cmd}"
        exit 1
    fi
}

install_node_deps() {
    local project_dir="$1"

    if [[ -d "${project_dir}/node_modules" ]]; then
        return
    fi

    if [[ -f "${project_dir}/package-lock.json" ]]; then
        (cd "${project_dir}" && npm ci --no-audit --no-fund)
    else
        (cd "${project_dir}" && npm install --no-audit --no-fund)
    fi
}

run_quick_checks() {
    echo "[quality-gate] Running quick checks"

    install_node_deps "${ROOT_DIR}/backend"
    (cd "${ROOT_DIR}/backend" && npm test && npm run test:integration)

    install_node_deps "${ROOT_DIR}/protected-qr"
    (cd "${ROOT_DIR}/protected-qr" && npm run build)

    install_node_deps "${ROOT_DIR}/blockchain/asset-transfer-drug/chaincode-js"
    (cd "${ROOT_DIR}/blockchain/asset-transfer-drug/chaincode-js" && npm run test:unit)
}

run_full_checks() {
    echo "[quality-gate] Running full checks"
    run_quick_checks
    "${ROOT_DIR}/scripts/test-all.sh" full
}

main() {
    ensure_cmd npm

    case "${MODE}" in
        quick)
            run_quick_checks
            ;;
        full)
            ensure_cmd docker
            run_full_checks
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo "Unknown mode: ${MODE}"
            usage
            exit 1
            ;;
    esac

    echo "[quality-gate] SUCCESS"
}

main
