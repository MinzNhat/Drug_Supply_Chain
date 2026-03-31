#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CANONICAL_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

CONFIGTX_FILE="${CANONICAL_ROOT}/configtx/configtx.yaml"
CRYPTO_FILE="${CANONICAL_ROOT}/crypto-config/crypto-config.yaml"
ORGANIZATIONS_DIR="${CANONICAL_ROOT}/organizations"
ARTIFACTS_DIR="${CANONICAL_ROOT}/channel-artifacts"
PROFILE="${PROFILE:-CanonicalChannelRaft}"
CHANNEL_NAME="${CHANNEL_NAME:-drugchannel}"

usage() {
  cat <<EOF
Usage:
  ./infrastructure/canonical/scripts/canonical_bootstrap.sh <validate|generate-crypto|generate|print-distributor-org>

Commands:
  validate             Check binaries and canonical files for canonical topology.
  generate-crypto      Generate local crypto materials from crypto-config template.
  generate             Generate channel block and org definition artifacts.
  print-distributor-org  Print command to generate DistributorMSP org definition JSON.

Environment variables:
  PROFILE      (default: CanonicalChannelRaft)
  CHANNEL_NAME (default: drugchannel)
EOF
}

check_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd"
    return 1
  fi
}

validate() {
  local missing=0
  check_cmd configtxgen || missing=1
  check_cmd cryptogen || missing=1
  check_cmd jq || missing=1

  [[ -f "${CONFIGTX_FILE}" ]] || { echo "Missing file: ${CONFIGTX_FILE}"; missing=1; }
  [[ -f "${CRYPTO_FILE}" ]] || { echo "Missing file: ${CRYPTO_FILE}"; missing=1; }

  if [[ $missing -ne 0 ]]; then
    exit 1
  fi

  echo "Validation passed for canonical infrastructure bundle."
}

generate_crypto() {
  validate

  rm -rf "${ORGANIZATIONS_DIR}"
  mkdir -p "${ORGANIZATIONS_DIR}"

  echo "Generating crypto materials into ${ORGANIZATIONS_DIR}..."
  cryptogen generate \
    --config "${CRYPTO_FILE}" \
    --output "${ORGANIZATIONS_DIR}"

  echo "Crypto materials generated."
}

ensure_crypto() {
  local consenter_cert="${ORGANIZATIONS_DIR}/ordererOrganizations/regulator.example.com/orderers/orderer0.regulator.example.com/tls/server.crt"
  if [[ ! -f "${consenter_cert}" ]]; then
    echo "Crypto material missing, running generate-crypto..."
    generate_crypto
  fi
}

generate() {
  validate
  ensure_crypto
  mkdir -p "${ARTIFACTS_DIR}"

  export FABRIC_CFG_PATH="$(dirname "${CONFIGTX_FILE}")"

  echo "Generating channel genesis block for profile ${PROFILE}..."
  configtxgen \
    -profile "${PROFILE}" \
    -channelID "${CHANNEL_NAME}" \
    -outputBlock "${ARTIFACTS_DIR}/${CHANNEL_NAME}.block"

  echo "Generating DistributorMSP org definition..."
  configtxgen -printOrg DistributorMSP > "${ARTIFACTS_DIR}/distributor.json"

  echo "Done. Artifacts generated in ${ARTIFACTS_DIR}."
}

print_distributor_org() {
  echo "configtxgen -printOrg DistributorMSP > ${ARTIFACTS_DIR}/distributor.json"
}

main() {
  local cmd="${1:-validate}"
  case "$cmd" in
    validate)
      validate
      ;;
    generate-crypto)
      generate_crypto
      ;;
    generate)
      generate
      ;;
    print-distributor-org)
      print_distributor_org
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "Unknown command: $cmd"
      usage
      exit 1
      ;;
  esac
}

main "$@"
