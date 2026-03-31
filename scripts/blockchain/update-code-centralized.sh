#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
FABRIC_SAMPLES_HOME="${ROOT_DIR}/blockchain"
TEST_NETWORK_HOME="${TEST_NETWORK_HOME:-${FABRIC_SAMPLES_HOME}/test-network}"
export FABRIC_CFG_PATH="${FABRIC_SAMPLES_HOME}/config"
export PATH="${FABRIC_SAMPLES_HOME}/bin:${PATH}"

CHANNEL_NAME="${CHANNEL_NAME:-mychannel}"
CC_NAME="${CC_NAME:-drugtracker}"
CC_VERSION="${CC_VERSION:-2.0}"
CC_SEQUENCE="${CC_SEQUENCE:-2}"
CC_LANG="${CC_LANG:-javascript}"
CC_SRC_PATH="${CC_SRC_PATH:-${FABRIC_SAMPLES_HOME}/asset-transfer-drug/chaincode-js}"
INSTALL_ORGS="${INSTALL_ORGS:-}"
COMMIT_ORGS="${COMMIT_ORGS:-${REGULATOR_ORG:-1}}"
REGULATOR_ORG="${REGULATOR_ORG:-1}"
ORDERER_ENDPOINT="${ORDERER_ENDPOINT:-localhost:7050}"
ORDERER_TLS_HOST="${ORDERER_TLS_HOST:-orderer.example.com}"
INIT_REQUIRED="${INIT_REQUIRED:-false}"
SIGNATURE_POLICY="${SIGNATURE_POLICY:-}"
OPTIONAL_ARGS=()

usage() {
  cat <<EOF
Usage:
  ./scripts/blockchain/update-code-centralized.sh

Optional environment variables:
  CHANNEL_NAME       (default: mychannel)
  CC_NAME            (default: drugtracker)
  CC_VERSION         (default: 2.0)
  CC_SEQUENCE        (default: 2)
  CC_LANG            (default: javascript)
  CC_SRC_PATH        (default: blockchain/asset-transfer-drug/chaincode-js)
  INSTALL_ORGS       (default: auto-detect available org peers, fallback "1 2")
  COMMIT_ORGS        (default: REGULATOR_ORG)
  REGULATOR_ORG      (default: 1)
  ORDERER_ENDPOINT   (default: localhost:7050)
  ORDERER_TLS_HOST   (default: orderer.example.com)
  INIT_REQUIRED      (default: false)
  SIGNATURE_POLICY   (optional, e.g. OR('RegulatorMSP.admin'))

Flow:
  1. package and install chaincode on target peers
  2. approveformyorg by Regulator admin only
  3. commit chaincode definition
EOF
}

check_prereqs() {
  local missing=0
  for cmd in peer jq; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      echo "Missing required command: $cmd"
      missing=1
    fi
  done
  if [[ $missing -ne 0 ]]; then
    exit 1
  fi
}

detect_install_orgs() {
  local detected=()

  for org in 1 2 3; do
    if [[ -d "${TEST_NETWORK_HOME}/organizations/peerOrganizations/org${org}.example.com/peers/peer0.org${org}.example.com" ]]; then
      detected+=("${org}")
    fi
  done

  if [[ ${#detected[@]} -eq 0 ]]; then
    detected=(1 2)
  fi

  printf "%s" "${detected[*]}"
}

build_optional_args() {
  OPTIONAL_ARGS=()
  if [[ "${INIT_REQUIRED}" == "true" ]]; then
    OPTIONAL_ARGS+=(--init-required)
  fi
  if [[ -n "${SIGNATURE_POLICY}" ]]; then
    OPTIONAL_ARGS+=(--signature-policy "${SIGNATURE_POLICY}")
  fi
}

install_if_needed() {
  local org="$1"
  local label="$2"

  setGlobals "$org"

  if peer lifecycle chaincode queryinstalled --output json | jq -e --arg label "$label" '.installed_chaincodes[]? | select(.label == $label)' >/dev/null; then
    echo "Org${org}: package ${label} already installed, skipping."
    return 0
  fi

  echo "Org${org}: installing package ${CC_NAME}.tar.gz"
  peer lifecycle chaincode install "${CC_NAME}.tar.gz"
}

main() {
  if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    usage
    exit 0
  fi

  if [[ ! -d "${TEST_NETWORK_HOME}" ]]; then
    echo "TEST_NETWORK_HOME does not exist: ${TEST_NETWORK_HOME}"
    exit 1
  fi

  if [[ ! -d "${CC_SRC_PATH}" ]]; then
    echo "CC_SRC_PATH does not exist: ${CC_SRC_PATH}"
    exit 1
  fi

  check_prereqs

  export TEST_NETWORK_HOME
  export OVERRIDE_ORG="${OVERRIDE_ORG:-}"
  export VERBOSE="${VERBOSE:-false}"
  # shellcheck source=/dev/null
  . "${TEST_NETWORK_HOME}/scripts/envVar.sh"

  cd "${TEST_NETWORK_HOME}"

  echo "[1/3] Package and install chaincode"
  ./scripts/packageCC.sh "${CC_NAME}" "${CC_SRC_PATH}" "${CC_LANG}" "${CC_VERSION}"

  local label="${CC_NAME}_${CC_VERSION}"

  if [[ -z "${INSTALL_ORGS// }" ]]; then
    INSTALL_ORGS="$(detect_install_orgs)"
    echo "INSTALL_ORGS not provided; auto-detected: ${INSTALL_ORGS}"
  fi

  read -r -a install_orgs_array <<< "${INSTALL_ORGS}"
  if [[ ${#install_orgs_array[@]} -eq 0 ]]; then
    echo "INSTALL_ORGS must include at least one org number."
    exit 1
  fi

  read -r -a commit_orgs_array <<< "${COMMIT_ORGS}"
  if [[ ${#commit_orgs_array[@]} -eq 0 ]]; then
    echo "COMMIT_ORGS must include at least one org number."
    exit 1
  fi

  local regulator_in_commit=false
  for org in "${commit_orgs_array[@]}"; do
    if [[ "${org}" == "${REGULATOR_ORG}" ]]; then
      regulator_in_commit=true
      break
    fi
  done
  if [[ "${regulator_in_commit}" == "false" ]]; then
    commit_orgs_array+=("${REGULATOR_ORG}")
    echo "COMMIT_ORGS did not include REGULATOR_ORG=${REGULATOR_ORG}; appended automatically."
  fi

  for org in "${install_orgs_array[@]}"; do
    install_if_needed "$org" "$label"
  done

  setGlobals "${REGULATOR_ORG}"
  local package_id
  package_id="$(peer lifecycle chaincode queryinstalled --output json | jq -r --arg label "$label" '.installed_chaincodes[]? | select(.label == $label) | .package_id' | head -n 1)"
  if [[ -z "${package_id}" ]]; then
    package_id="$(peer lifecycle chaincode calculatepackageid "${CC_NAME}.tar.gz")"
  fi

  if [[ -z "${package_id}" ]]; then
    echo "Cannot resolve package ID for ${label}."
    exit 1
  fi

  build_optional_args

  echo "[2/3] Approve definition as Regulator org"
  local -a approve_cmd=(
    peer lifecycle chaincode approveformyorg
    -o "${ORDERER_ENDPOINT}"
    --ordererTLSHostnameOverride "${ORDERER_TLS_HOST}"
    --tls
    --cafile "$ORDERER_CA"
    --channelID "${CHANNEL_NAME}"
    --name "${CC_NAME}"
    --version "${CC_VERSION}"
    --package-id "${package_id}"
    --sequence "${CC_SEQUENCE}"
  )
  if [[ ${#OPTIONAL_ARGS[@]} -gt 0 ]]; then
    approve_cmd+=("${OPTIONAL_ARGS[@]}")
  fi
  "${approve_cmd[@]}"

  local -a readiness_cmd=(
    peer lifecycle chaincode checkcommitreadiness
    --channelID "${CHANNEL_NAME}"
    --name "${CC_NAME}"
    --version "${CC_VERSION}"
    --sequence "${CC_SEQUENCE}"
  )
  if [[ ${#OPTIONAL_ARGS[@]} -gt 0 ]]; then
    readiness_cmd+=("${OPTIONAL_ARGS[@]}")
  fi
  readiness_cmd+=(--output json)
  "${readiness_cmd[@]}"

  echo "[3/3] Commit new chaincode definition"
  # test-network helper uses empty array expansion that is incompatible with set -u on bash 3.2
  set +u
  parsePeerConnectionParameters "${commit_orgs_array[@]}"
  set -u
  setGlobals "${REGULATOR_ORG}"
  local -a commit_cmd=(
    peer lifecycle chaincode commit
    -o "${ORDERER_ENDPOINT}"
    --ordererTLSHostnameOverride "${ORDERER_TLS_HOST}"
    --tls
    --cafile "$ORDERER_CA"
    --channelID "${CHANNEL_NAME}"
    --name "${CC_NAME}"
    --version "${CC_VERSION}"
    --sequence "${CC_SEQUENCE}"
    "${PEER_CONN_PARMS[@]}"
  )
  if [[ ${#OPTIONAL_ARGS[@]} -gt 0 ]]; then
    commit_cmd+=("${OPTIONAL_ARGS[@]}")
  fi
  "${commit_cmd[@]}"

  peer lifecycle chaincode querycommitted --channelID "${CHANNEL_NAME}" --name "${CC_NAME}"
  echo "Done: chaincode ${CC_NAME}:${CC_VERSION} sequence ${CC_SEQUENCE} committed."
}

main "$@"
