#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

OPENAPI_FILES=(
    "${ROOT_DIR}/docs/protected-qr/swagger.yaml"
    "${ROOT_DIR}/docs/ai-service/swagger.yaml"
)

CONTRACT_FILE="${ROOT_DIR}/docs/backend/integration-contract.md"
PQR_SWAGGER="${ROOT_DIR}/docs/protected-qr/swagger.yaml"
AI_SWAGGER="${ROOT_DIR}/docs/ai-service/swagger.yaml"

declare -a failures

record_failure() {
    local message="$1"
    failures+=("${message}")
}

assert_pattern() {
    local file_path="$1"
    local pattern="$2"
    local description="$3"

    if ! grep -Eq "${pattern}" "${file_path}"; then
        record_failure "${description} (file: ${file_path})"
    fi
}

assert_no_pattern() {
    local file_path="$1"
    local pattern="$2"
    local description="$3"

    if grep -Eq "${pattern}" "${file_path}"; then
        record_failure "${description} (file: ${file_path})"
    fi
}

validate_openapi() {
    local file_path="$1"
    echo "[api-doc-check] validating OpenAPI: ${file_path}"
    if ! npx --yes @apidevtools/swagger-cli validate "${file_path}" >/dev/null; then
        record_failure "OpenAPI validation failed for ${file_path}"
    fi
}

for openapi_file in "${OPENAPI_FILES[@]}"; do
    if [[ ! -f "${openapi_file}" ]]; then
        record_failure "Missing OpenAPI file: ${openapi_file}"
        continue
    fi
    validate_openapi "${openapi_file}"
done

if [[ ! -f "${CONTRACT_FILE}" ]]; then
    record_failure "Missing integration contract file: ${CONTRACT_FILE}"
fi

# Integration-contract mode semantics checks.
assert_pattern "${CONTRACT_FILE}" '^\| `POST /api/v1/batches/:batchId/events`[[:space:]]+\| Off-chain `BatchGeoEvent` write \| Submit[[:space:]]+\|' 'Expected Submit mode for POST /api/v1/batches/:batchId/events'

assert_pattern "${CONTRACT_FILE}" '^\| `GET /api/v1/batches/:batchId/events`[[:space:]]+\| Off-chain `BatchGeoEvent` read[[:space:]]+\| Query[[:space:]]+\|' 'Expected Query mode for GET /api/v1/batches/:batchId/events'

# Protected-QR schema field consistency checks.
for required_field in dataHash metadataSeries metadataIssued metadataExpiry isAuthentic confidenceScore traceId; do
    assert_pattern "${PQR_SWAGGER}" "^[[:space:]]*${required_field}:[[:space:]]*$" "Missing required Protected-QR schema field '${required_field}'"
done

assert_pattern "${PQR_SWAGGER}" '^[[:space:]]*trace_id:[[:space:]]*$' "Missing deprecated compatibility alias 'trace_id' in Protected-QR error schema"

assert_no_pattern "${PQR_SWAGGER}" '^[[:space:]]*(data_hash|metadata_series|metadata_issued|metadata_expiry|is_authentic|confidence_score):[[:space:]]*$' 'Protected-QR public schema should not expose snake_case field names'

# AI service schema consistency checks.
assert_pattern "${AI_SWAGGER}" '^paths:[[:space:]]*$' 'Missing paths section in AI service OpenAPI'

assert_pattern "${AI_SWAGGER}" '^[[:space:]]*/api/v1/verify:[[:space:]]*$' 'Missing /api/v1/verify path in AI service OpenAPI'

assert_pattern "${AI_SWAGGER}" '^[[:space:]]*accepted:[[:space:]]*$' "Missing 'accepted' field in AI verify response schema"

assert_pattern "${AI_SWAGGER}" '^[[:space:]]*traceId:[[:space:]]*$' "Missing canonical 'traceId' field in AI error schema"

if [[ "${#failures[@]}" -gt 0 ]]; then
    echo "[api-doc-check] FAILED (${#failures[@]} issue(s))"
    for failure in "${failures[@]}"; do
        echo "- ${failure}"
    done
    exit 1
fi

echo "[api-doc-check] PASSED"
