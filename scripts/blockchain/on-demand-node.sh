#!/usr/bin/env bash
set -euo pipefail

# This script generates crypto material for a new org, joins it to the channel, and starts its peer.
# Usage: ./on-demand-node.sh <OrgName> <Role> <Province>

ORG_NAME="$1"
ROLE="$2"
PROVINCE="$3"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

FABRIC_SAMPLES_HOME="${ROOT_DIR}/blockchain"
TEST_NETWORK_HOME="${FABRIC_SAMPLES_HOME}/test-network"
if [[ -f /.dockerenv ]]; then
    # In container, use system binaries installed in /usr/local/bin
    export PATH="/usr/local/bin:${PATH}"
else
    # On host
    BIN_DIR="${FABRIC_SAMPLES_HOME}/bin"
    export PATH="${BIN_DIR}:${TEST_NETWORK_HOME}/bin:${PATH}"
fi
export FABRIC_CFG_PATH="${FABRIC_SAMPLES_HOME}/config"

# 0. Determine the real host project root
# If HOST_PROJECT_DIR points to the backend folder, we need the parent.
if [[ -n "${HOST_PROJECT_DIR:-}" ]]; then
    if [[ "${HOST_PROJECT_DIR}" == */backend ]]; then
        HOST_PROJECT_ROOT="${HOST_PROJECT_DIR%/backend}"
    else
        HOST_PROJECT_ROOT="${HOST_PROJECT_DIR}"
    fi
else
    HOST_PROJECT_ROOT="${ROOT_DIR}"
fi
echo "Using HOST_PROJECT_ROOT: ${HOST_PROJECT_ROOT}"

# Generate a unique slug for the organization
# e.g. HanoiDistributor -> hanoidistributor
SLUG=$(echo "${ORG_NAME}" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')
MSP_ID="${ORG_NAME}MSP"
DOMAIN="${SLUG}.drugguard.vn"
PEER_NAME="peer0.${DOMAIN}"

# Port logic: we need a unique port for each new peer.
# For this DATN, we'll use a simple file-based counter or just random high port if not provided.
# Let's use a counter in the blockchain dir.
PORT_FILE="${TEST_NETWORK_HOME}/.last_port"
if [[ ! -f "${PORT_FILE}" ]]; then
    echo "13051" > "${PORT_FILE}"
fi
PEER_PORT=$(cat "${PORT_FILE}")
NEXT_PORT=$((PEER_PORT + 100))
echo "${NEXT_PORT}" > "${PORT_FILE}"

WORKDIR="${TEST_NETWORK_HOME}/channel-artifacts/dynamic-${SLUG}"
mkdir -p "${WORKDIR}"

echo "Creating Organization: ${ORG_NAME} (${MSP_ID}) on domain ${DOMAIN} at port ${PEER_PORT}"

# 1. Generate crypto-config.yaml
cat <<EOF > "${WORKDIR}/crypto-config.yaml"
PeerOrgs:
  - Name: ${ORG_NAME}
    Domain: ${DOMAIN}
    EnableNodeOUs: true
    Template:
      Count: 1
      SANS:
        - localhost
        - ${PEER_NAME}
    Users:
      Count: 1
EOF

# 2. Generate certificates using cryptogen
cryptogen generate --config="${WORKDIR}/crypto-config.yaml" --output="${TEST_NETWORK_HOME}/organizations"

# 3. Generate Organization JSON definition for channel update
# We need a configtx.yaml snippet for configtxgen
export FABRIC_CFG_PATH="${WORKDIR}"
cat <<EOF > "${WORKDIR}/configtx.yaml"
Organizations:
  - &${ORG_NAME}
    Name: ${MSP_ID}
    ID: ${MSP_ID}
    MSPDir: ${TEST_NETWORK_HOME}/organizations/peerOrganizations/${DOMAIN}/msp
    Policies:
        Readers:
            Type: Signature
            Rule: "OR('${MSP_ID}.admin', '${MSP_ID}.peer', '${MSP_ID}.client')"
        Writers:
            Type: Signature
            Rule: "OR('${MSP_ID}.admin', '${MSP_ID}.client')"
        Admins:
            Type: Signature
            Rule: "OR('${MSP_ID}.admin')"
        Endorsement:
            Type: Signature
            Rule: "OR('${MSP_ID}.peer')"
    AnchorPeers:
        - Host: ${PEER_NAME}
          Port: ${PEER_PORT}
EOF

configtxgen -printOrg "${MSP_ID}" > "${WORKDIR}/${SLUG}.json"

# 4. Join organization to channel using the centralized script
export NEW_ORG_MSP="${MSP_ID}"
export NEW_ORG_JSON="${WORKDIR}/${SLUG}.json"
export ORDERER_CA="${TEST_NETWORK_HOME}/organizations/ordererOrganizations/drugguard.vn/orderers/orderer1.drugguard.vn/msp/tlscacerts/tlsca.drugguard.vn-cert.pem"

"${SCRIPT_DIR}/add-org-centralized.sh"

# 5. Start the peer container
# Generate docker-compose
cat <<EOF > "${WORKDIR}/docker-compose.yaml"
networks:
  test:
    name: fabric_test
    external: true

services:
  ${PEER_NAME}:
    container_name: ${PEER_NAME}
    image: hyperledger/fabric-peer:latest
    labels:
      service: hyperledger-fabric
    environment:
      - FABRIC_CFG_PATH=/etc/hyperledger/fabric
      - FABRIC_LOGGING_SPEC=INFO
      - CORE_PEER_TLS_ENABLED=true
      - CORE_PEER_PROFILE_ENABLED=true
      - CORE_PEER_TLS_CERT_FILE=/etc/hyperledger/fabric/tls/server.crt
      - CORE_PEER_TLS_KEY_FILE=/etc/hyperledger/fabric/tls/server.key
      - CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/tls/ca.crt
      - CORE_PEER_ID=${PEER_NAME}
      - CORE_PEER_ADDRESS=${PEER_NAME}:${PEER_PORT}
      - CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/msp
      - CORE_PEER_LISTENADDRESS=0.0.0.0:${PEER_PORT}
      - CORE_PEER_CHAINCODEADDRESS=${PEER_NAME}:$((PEER_PORT + 1))
      - CORE_PEER_CHAINCODELISTENADDRESS=0.0.0.0:$((PEER_PORT + 1))
      - CORE_PEER_GOSSIP_BOOTSTRAP=${PEER_NAME}:${PEER_PORT}
      - CORE_PEER_GOSSIP_EXTERNALENDPOINT=${PEER_NAME}:${PEER_PORT}
      - CORE_PEER_LOCALMSPID=${MSP_ID}
      - CORE_METRICS_PROVIDER=prometheus
      - CORE_OPERATIONS_LISTENADDRESS=0.0.0.0:9443
    volumes:
      - ${HOST_PROJECT_ROOT}/blockchain/test-network/organizations/peerOrganizations/${DOMAIN}/peers/${PEER_NAME}/msp:/etc/hyperledger/fabric/msp
      - ${HOST_PROJECT_ROOT}/blockchain/test-network/organizations/peerOrganizations/${DOMAIN}/peers/${PEER_NAME}/tls:/etc/hyperledger/fabric/tls
      - ${HOST_PROJECT_ROOT}/blockchain/config/core.yaml:/etc/hyperledger/fabric/core.yaml
      - /var/run/docker.sock:/var/run/docker.sock
      - ${PEER_NAME}:/var/hyperledger/production
    working_dir: /opt/gopath/src/github.com/hyperledger/fabric/peer
    command: peer node start
    ports:
      - ${PEER_PORT}:${PEER_PORT}
    networks:
      - test

volumes:
  ${PEER_NAME}:
EOF

docker compose -f "${WORKDIR}/docker-compose.yaml" up -d

# 6. Record node in registry for topology discovery
NODE_REGISTRY="${ROOT_DIR}/blockchain/on-demand-nodes.json"
if [[ ! -f "${NODE_REGISTRY}" ]]; then
    echo "[]" > "${NODE_REGISTRY}"
fi

# Add node to registry if not already present
jq --arg id "${PEER_NAME}" \
   --arg label "Peer: ${ORG_NAME}" \
   --arg type "peer" \
   --arg org "${ORG_NAME}" \
   --arg mspId "${MSP_ID}" \
   --arg host "${PEER_NAME}" \
   --arg port "${PEER_PORT}" \
   'if any(.[]; .id == $id) then . else . + [{"id": $id, "label": $label, "type": $type, "org": $org, "mspId": $mspId, "host": $id, "port": ($port|tonumber)}] end' \
   "${NODE_REGISTRY}" > "${NODE_REGISTRY}.tmp" && mv "${NODE_REGISTRY}.tmp" "${NODE_REGISTRY}"

echo "Node ${PEER_NAME} started on port ${PEER_PORT} and recorded in registry."
