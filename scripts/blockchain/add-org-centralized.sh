#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
FABRIC_SAMPLES_HOME="${ROOT_DIR}/blockchain"
TEST_NETWORK_HOME="${TEST_NETWORK_HOME:-${FABRIC_SAMPLES_HOME}/test-network}"
export FABRIC_CFG_PATH="${FABRIC_SAMPLES_HOME}/config"
export PATH="${FABRIC_SAMPLES_HOME}/bin:${PATH}"

CHANNEL_NAME="${CHANNEL_NAME:-mychannel}"
NEW_ORG_MSP="${NEW_ORG_MSP:-DistributorMSP}"
NEW_ORG_JSON="${NEW_ORG_JSON:-}"
NEW_ORG_NUMBER="${NEW_ORG_NUMBER:-}"
JOIN_AND_ANCHOR="${JOIN_AND_ANCHOR:-true}"
REGULATOR_ORG="${REGULATOR_ORG:-1}"
ORDERER_ENDPOINT="${ORDERER_ENDPOINT:-localhost:7050}"
ORDERER_TLS_HOST="${ORDERER_TLS_HOST:-orderer.example.com}"
WORKDIR="${WORKDIR:-${TEST_NETWORK_HOME}/channel-artifacts/centralized-${NEW_ORG_MSP}}"

usage() {
  cat <<EOF
Usage:
  NEW_ORG_JSON=/path/to/distributor.json ./scripts/blockchain/add-org-centralized.sh

Optional environment variables:
  CHANNEL_NAME       (default: mychannel)
  NEW_ORG_MSP        (default: DistributorMSP)
  NEW_ORG_JSON       (required, output of configtxgen -printOrg)
  NEW_ORG_NUMBER     (optional: 1|2|3, for auto join+anchor after channel update)
  JOIN_AND_ANCHOR    (default: true, effective only when NEW_ORG_NUMBER is set)
  REGULATOR_ORG      (default: 1)
  ORDERER_ENDPOINT   (default: localhost:7050)
  ORDERER_TLS_HOST   (default: orderer.example.com)
  TEST_NETWORK_HOME  (default: blockchain/test-network)
  WORKDIR            (default: test-network/channel-artifacts/centralized-<NEW_ORG_MSP>)

Flow:
  1. fetch config
  2. modify json (append NEW_ORG_MSP)
  3. sign by Regulator admin
  4. update channel
  5. optional: join peer + set anchor (if NEW_ORG_NUMBER is provided)
EOF
}

check_prereqs() {
  local missing=0
  for cmd in peer jq configtxlator; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      echo "Missing required command: $cmd"
      missing=1
    fi
  done
  if [[ $missing -ne 0 ]]; then
    exit 1
  fi
}

join_and_anchor_new_org() {
  local org="$1"
  local blockfile="${TEST_NETWORK_HOME}/channel-artifacts/${CHANNEL_NAME}.block"

  if [[ "$org" != "1" && "$org" != "2" && "$org" != "3" ]]; then
    echo "Skip join/anchor: NEW_ORG_NUMBER must be 1, 2, or 3 for test-network envVar helpers."
    return 0
  fi

  setGlobals "$org"
  if [[ ! -d "${CORE_PEER_MSPCONFIGPATH}" ]]; then
    echo "Skip join/anchor: MSP path not found for org${org}: ${CORE_PEER_MSPCONFIGPATH}"
    return 0
  fi

  echo "[5/7] Fetch channel block for org${org}"
  peer channel fetch 0 "$blockfile" \
    -o "$ORDERER_ENDPOINT" \
    --ordererTLSHostnameOverride "$ORDERER_TLS_HOST" \
    -c "$CHANNEL_NAME" \
    --tls \
    --cafile "$ORDERER_CA"

  if peer channel getinfo -c "$CHANNEL_NAME" >/dev/null 2>&1; then
    echo "[6/7] org${org} peer already joined channel ${CHANNEL_NAME}, skipping join"
  else
    echo "[6/7] Join org${org} peer to channel ${CHANNEL_NAME}"
    peer channel join -b "$blockfile"
  fi

  echo "[7/7] Set anchor peer for org${org}"
  "${TEST_NETWORK_HOME}/scripts/setAnchorPeer.sh" "$org" "$CHANNEL_NAME"
}

main() {
  if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    usage
    exit 0
  fi

  if [[ -z "${NEW_ORG_JSON}" ]]; then
    echo "NEW_ORG_JSON is required."
    usage
    exit 1
  fi

  if [[ ! -f "${NEW_ORG_JSON}" ]]; then
    echo "Org definition JSON not found: ${NEW_ORG_JSON}"
    exit 1
  fi

  if [[ ! -d "${TEST_NETWORK_HOME}" ]]; then
    echo "TEST_NETWORK_HOME does not exist: ${TEST_NETWORK_HOME}"
    exit 1
  fi

  check_prereqs

  export TEST_NETWORK_HOME
  export OVERRIDE_ORG="${OVERRIDE_ORG:-}"
  export VERBOSE="${VERBOSE:-false}"
  # shellcheck source=/dev/null
  . "${TEST_NETWORK_HOME}/scripts/configUpdate.sh"

  mkdir -p "${WORKDIR}"

  echo "[1/4] Fetch current channel config"
  fetchChannelConfig "${REGULATOR_ORG}" "${CHANNEL_NAME}" "${WORKDIR}/config.json"

  if jq -e --arg msp "${NEW_ORG_MSP}" '.channel_group.groups.Application.groups[$msp]' "${WORKDIR}/config.json" >/dev/null; then
    echo "Organization ${NEW_ORG_MSP} already exists on channel ${CHANNEL_NAME}."
    exit 0
  fi

  echo "[2/4] Build modified config with ${NEW_ORG_MSP}"
  jq -s --arg msp "${NEW_ORG_MSP}" \
    '.[0] * {"channel_group":{"groups":{"Application":{"groups":{($msp):.[1]}}}}}' \
    "${WORKDIR}/config.json" "${NEW_ORG_JSON}" > "${WORKDIR}/modified_config.json"

  createConfigUpdate \
    "${CHANNEL_NAME}" \
    "${WORKDIR}/config.json" \
    "${WORKDIR}/modified_config.json" \
    "${WORKDIR}/${NEW_ORG_MSP}_update_in_envelope.pb"

  echo "[3/4] Sign config update as Regulator org"
  signConfigtxAsPeerOrg "${REGULATOR_ORG}" "${WORKDIR}/${NEW_ORG_MSP}_update_in_envelope.pb"

  echo "[4/4] Submit channel update"
  setGlobals "${REGULATOR_ORG}"
  peer channel update \
    -f "${WORKDIR}/${NEW_ORG_MSP}_update_in_envelope.pb" \
    -c "${CHANNEL_NAME}" \
    -o "${ORDERER_ENDPOINT}" \
    --ordererTLSHostnameOverride "${ORDERER_TLS_HOST}" \
    --tls \
    --cafile "$ORDERER_CA"

  if [[ -n "${NEW_ORG_NUMBER}" && "${JOIN_AND_ANCHOR}" == "true" ]]; then
    join_and_anchor_new_org "${NEW_ORG_NUMBER}"
  fi

  echo "Done: ${NEW_ORG_MSP} added to channel ${CHANNEL_NAME} via centralized governance flow."
}

main "$@"
