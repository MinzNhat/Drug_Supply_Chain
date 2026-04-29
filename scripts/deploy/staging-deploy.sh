#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ACTION="${1:-deploy}"
MANIFEST_PATH="${DATN_RELEASE_MANIFEST:-}"
SKIP_PULL="${DATN_STAGING_SKIP_PULL:-false}"
ENFORCE_DIGEST="${DATN_STAGING_ENFORCE_DIGEST:-true}"
ALLOW_EPHEMERAL_SECRETS="${DATN_STAGING_ALLOW_EPHEMERAL_SECRETS:-true}"
COMPLIANCE_ENV="${DATN_COMPLIANCE_ENV:-staging}"

EVIDENCE_DIR="${ROOT_DIR}/test-output/deploy"
TIMESTAMP_UTC="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_FILE="${EVIDENCE_DIR}/staging-${ACTION}-${TIMESTAMP_UTC}.json"
STAGING_SECRET_DIR="${DATN_STAGING_SECRET_DIR:-${ROOT_DIR}/.tmp/deploy/secrets/${TIMESTAMP_UTC}}"

RELEASE_ID=""
DEPLOY_REGION="unknown"
DATA_RESIDENCY_REGION="unknown"
DR_STRATEGY="unspecified"
RESULT="FAILED"
EXIT_CODE=1
SHOULD_WRITE_EVIDENCE=true

usage() {
    cat <<'USAGE'
Usage:
  DATN_RELEASE_MANIFEST=path/to/release.env scripts/deploy/staging-deploy.sh deploy
  DATN_RELEASE_MANIFEST=path/to/release.env scripts/deploy/staging-deploy.sh rollback
  scripts/deploy/staging-deploy.sh smoke

Actions:
  deploy    Pull immutable images and deploy staging services.
  rollback  Re-deploy staging using a previous release manifest.
  smoke     Run post-deploy smoke checks only.

Manifest variables:
  DATN_RELEASE_ID
  DATN_STAGING_QR_PYTHON_IMAGE
  DATN_STAGING_QR_SERVICE_IMAGE
  DATN_STAGING_AI_PYTHON_IMAGE
  DATN_STAGING_AI_SERVICE_IMAGE
  DATN_STAGING_BACKEND_IMAGE

Optional manifest metadata:
    DATN_DEPLOY_REGION
    DATN_DATA_RESIDENCY_REGION
    DATN_DR_STRATEGY

Optional runtime controls:
    DATN_STAGING_SKIP_PULL=true|false      # default false
    DATN_STAGING_ENFORCE_DIGEST=true|false # default true
    DATN_STAGING_ALLOW_EPHEMERAL_SECRETS=true|false # default true
    DATN_COMPLIANCE_ENV=local|staging|prod # default staging
USAGE
}

require_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "Missing required command: $1" >&2
        exit 1
    fi
}

require_env() {
    local name="$1"
    if [[ -z "${!name:-}" ]]; then
        echo "Missing required manifest variable: ${name}" >&2
        exit 1
    fi
}

validate_image_ref() {
    local var_name="$1"
    local ref="${!var_name}"

    if [[ "${ENFORCE_DIGEST}" == "true" && "${ref}" != *@sha256:* ]]; then
        echo "${var_name} must be digest-pinned (<image>@sha256:...) when DATN_STAGING_ENFORCE_DIGEST=true" >&2
        exit 1
    fi
}

is_insecure_secret() {
    local value="${1:-}"
    local lowered
    lowered="$(printf '%s' "${value}" | tr '[:upper:]' '[:lower:]')"

    if [[ "${#value}" -lt 32 ]]; then
        return 0
    fi

    case "${lowered}" in
        ""|change_me|changeme|replace_me|replace-with-strong-secret|replace_with_strong_secret|local-dev-secret|test-secret|default-secret|secret123)
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

resolve_secret_value() {
    local direct_key="$1"
    local file_key="$2"
    local label="$3"
    local direct_value="${!direct_key:-}"
    local file_value="${!file_key:-}"
    local resolved=""

    if [[ -n "${direct_value}" && -n "${file_value}" ]]; then
        echo "Both ${direct_key} and ${file_key} are set for ${label}; provide only one source." >&2
        exit 1
    fi

    if [[ -n "${file_value}" ]]; then
        if [[ ! -f "${file_value}" ]]; then
            echo "Secret file for ${label} not found: ${file_value}" >&2
            exit 1
        fi

        resolved="$(tr -d '\r' <"${file_value}" | sed -e 's/[[:space:]]*$//')"
    else
        resolved="${direct_value}"
    fi

    if is_insecure_secret "${resolved}"; then
        if [[ "${ALLOW_EPHEMERAL_SECRETS}" != "true" ]]; then
            echo "Missing secure ${label}; set ${direct_key} or ${file_key}." >&2
            exit 1
        fi

        resolved="$(generate_secret)"
        echo "[deploy] generated ephemeral ${label} for this run"
    fi

    printf '%s' "${resolved}"
}

prepare_staging_secret_dir() {
    local backend_secret
    local qr_secret

    backend_secret="$(resolve_secret_value DATN_BACKEND_JWT_SECRET DATN_BACKEND_JWT_SECRET_FILE "backend JWT secret")"
    qr_secret="$(resolve_secret_value DATN_QR_HMAC_SECRET DATN_QR_HMAC_SECRET_FILE "protected-qr HMAC secret")"

    mkdir -p "${STAGING_SECRET_DIR}/backend" "${STAGING_SECRET_DIR}/qr"
    chmod 700 "${STAGING_SECRET_DIR}" "${STAGING_SECRET_DIR}/backend" "${STAGING_SECRET_DIR}/qr"

    printf '%s' "${backend_secret}" >"${STAGING_SECRET_DIR}/backend/backend_jwt_secret"
    printf '%s' "${qr_secret}" >"${STAGING_SECRET_DIR}/qr/qr_hmac_secret"
    chmod 600 \
        "${STAGING_SECRET_DIR}/backend/backend_jwt_secret" \
        "${STAGING_SECRET_DIR}/qr/qr_hmac_secret"

    export DATN_STAGING_SECRET_DIR="${STAGING_SECRET_DIR}"
    export DATN_BACKEND_JWT_SECRET_FILE="${STAGING_SECRET_DIR}/backend/backend_jwt_secret"
    export DATN_QR_HMAC_SECRET_FILE="${STAGING_SECRET_DIR}/qr/qr_hmac_secret"
    unset DATN_BACKEND_JWT_SECRET || true
    unset DATN_QR_HMAC_SECRET || true
}

run_compliance_gate() {
    DATN_COMPLIANCE_ENV="${COMPLIANCE_ENV}" \
        DATN_COMPLIANCE_OUTPUT_DIR="${EVIDENCE_DIR}" \
        DATN_RELEASE_MANIFEST="${MANIFEST_PATH}" \
        node "${ROOT_DIR}/scripts/deploy/compliance-key-custody-check.mjs"
}

load_manifest() {
    if [[ -z "${MANIFEST_PATH}" ]]; then
        echo "DATN_RELEASE_MANIFEST is required for action '${ACTION}'" >&2
        exit 1
    fi

    if [[ ! -f "${MANIFEST_PATH}" ]]; then
        echo "Release manifest not found: ${MANIFEST_PATH}" >&2
        exit 1
    fi

    set -a
    # shellcheck disable=SC1090
    source "${MANIFEST_PATH}"
    set +a

    require_env DATN_RELEASE_ID
    require_env DATN_STAGING_QR_PYTHON_IMAGE
    require_env DATN_STAGING_QR_SERVICE_IMAGE
    require_env DATN_STAGING_AI_PYTHON_IMAGE
    require_env DATN_STAGING_AI_SERVICE_IMAGE
    require_env DATN_STAGING_BACKEND_IMAGE

    validate_image_ref DATN_STAGING_QR_PYTHON_IMAGE
    validate_image_ref DATN_STAGING_QR_SERVICE_IMAGE
    validate_image_ref DATN_STAGING_AI_PYTHON_IMAGE
    validate_image_ref DATN_STAGING_AI_SERVICE_IMAGE
    validate_image_ref DATN_STAGING_BACKEND_IMAGE

    RELEASE_ID="${DATN_RELEASE_ID}"
    DEPLOY_REGION="${DATN_DEPLOY_REGION:-unknown}"
    DATA_RESIDENCY_REGION="${DATN_DATA_RESIDENCY_REGION:-unknown}"
    DR_STRATEGY="${DATN_DR_STRATEGY:-unspecified}"
}

compose_cmd() {
    local compose_args=(
        -f "${ROOT_DIR}/docker-compose.yml"
        -f "${ROOT_DIR}/docker-compose.staging.yml"
    )

    if [[ "${SKIP_PULL}" == "true" ]]; then
        compose_args+=(
            -f "${ROOT_DIR}/docker-compose.staging.local.yml"
        )
    fi

    docker compose "${compose_args[@]}" "$@"
}

deploy_stack() {
    echo "[deploy] release=${RELEASE_ID} action=${ACTION}"
    if [[ "${SKIP_PULL}" != "true" ]]; then
        compose_cmd pull qr-python-core qr-service ai-python-core ai-service backend
    else
        echo "[deploy] skipping image pull because DATN_STAGING_SKIP_PULL=true"
    fi

    compose_cmd up -d --no-build mongo qr-python-core qr-service ai-python-core ai-service backend
}

run_smoke() {
    "${ROOT_DIR}/scripts/deploy/staging-smoke.sh"
}

write_evidence() {
    mkdir -p "${EVIDENCE_DIR}"

    cat >"${EVIDENCE_FILE}" <<EOF
{
  "environment": "staging",
  "action": "${ACTION}",
  "releaseId": "${RELEASE_ID}",
  "timestampUtc": "${TIMESTAMP_UTC}",
  "result": "${RESULT}",
  "exitCode": ${EXIT_CODE},
  "manifestPath": "${MANIFEST_PATH}",
    "skipPull": "${SKIP_PULL}",
    "enforceDigest": "${ENFORCE_DIGEST}",
    "complianceEnv": "${COMPLIANCE_ENV}",
    "stagingSecretDir": "${STAGING_SECRET_DIR}",
    "region": {
        "deployRegion": "${DEPLOY_REGION}",
        "dataResidencyRegion": "${DATA_RESIDENCY_REGION}",
        "drStrategy": "${DR_STRATEGY}"
    },
  "images": {
    "qrPythonCore": "${DATN_STAGING_QR_PYTHON_IMAGE:-}",
    "qrService": "${DATN_STAGING_QR_SERVICE_IMAGE:-}",
    "aiPythonCore": "${DATN_STAGING_AI_PYTHON_IMAGE:-}",
    "aiService": "${DATN_STAGING_AI_SERVICE_IMAGE:-}",
    "backend": "${DATN_STAGING_BACKEND_IMAGE:-}"
  }
}
EOF

    echo "[deploy] evidence written to ${EVIDENCE_FILE}"
}

run_action() {
    case "${ACTION}" in
    deploy | rollback)
        require_cmd docker
        require_cmd node
        load_manifest
        prepare_staging_secret_dir
        run_compliance_gate
        deploy_stack
        run_smoke
        ;;
    smoke)
        RELEASE_ID="smoke-only"
        run_smoke
        ;;
    -h | --help | help)
        SHOULD_WRITE_EVIDENCE=false
        usage
        exit 0
        ;;
    *)
        echo "Unknown action: ${ACTION}" >&2
        usage
        exit 1
        ;;
    esac
}

on_exit() {
    EXIT_CODE=$?

    if [[ "${SHOULD_WRITE_EVIDENCE}" != "true" ]]; then
        return 0
    fi

    if [[ "${EXIT_CODE}" -eq 0 ]]; then
        RESULT="SUCCESS"
    fi

    write_evidence
}

trap on_exit EXIT

run_action