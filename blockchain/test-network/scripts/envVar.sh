#!/usr/bin/env bash
#
# Copyright IBM Corp All Rights Reserved
#
# SPDX-License-Identifier: Apache-2.0
#

# This is a collection of bash functions used by different scripts

# imports
# test network home var targets to test-network folder
# the reason we use a var here is to accommodate scenarios
# where execution occurs from folders outside of default as $PWD, such as the test-network/addOrg3 folder.
# For setting environment variables, simple relative paths like ".." could lead to unintended references
# due to how they interact with FABRIC_CFG_PATH. It's advised to specify paths more explicitly,
# such as using "../${PWD}", to ensure that Fabric's environment variables are pointing to the correct paths.
TEST_NETWORK_HOME=${TEST_NETWORK_HOME:-${PWD}}
. ${TEST_NETWORK_HOME}/scripts/utils.sh

export CORE_PEER_TLS_ENABLED=true
export ORDERER_CA=${TEST_NETWORK_HOME}/organizations/ordererOrganizations/drugguard.vn/tlsca/tlsca.drugguard.vn-cert.pem
export PEER0_ORG1_CA=${TEST_NETWORK_HOME}/organizations/peerOrganizations/regulator.drugguard.vn/tlsca/tlsca.regulator.drugguard.vn-cert.pem
export PEER0_ORG2_CA=${TEST_NETWORK_HOME}/organizations/peerOrganizations/manufacturer.drugguard.vn/tlsca/tlsca.manufacturer.drugguard.vn-cert.pem
export PEER0_ORG3_CA=${TEST_NETWORK_HOME}/organizations/peerOrganizations/distributor.drugguard.vn/tlsca/tlsca.distributor.drugguard.vn-cert.pem

if [[ -f /.dockerenv ]]; then
    export ORDERER_ENDPOINT="orderer1.drugguard.vn:7050"
    export PEER_REGULATOR_ADDRESS="peer0.regulator.drugguard.vn:7051"
    export PEER_MANUFACTURER_ADDRESS="peer0.manufacturer.drugguard.vn:9051"
    export PEER_DISTRIBUTOR_ADDRESS="peer0.distributor.drugguard.vn:11051"
else
    export ORDERER_ENDPOINT="localhost:7050"
    export PEER_REGULATOR_ADDRESS="localhost:7051"
    export PEER_MANUFACTURER_ADDRESS="localhost:9051"
    export PEER_DISTRIBUTOR_ADDRESS="localhost:11051"
fi

# Set environment variables for the peer org
setGlobals() {
  local USING_ORG=""
  if [ -z "$OVERRIDE_ORG" ]; then
    USING_ORG=$1
  else
    USING_ORG="${OVERRIDE_ORG}"
  fi
  infoln "Using organization ${USING_ORG}"
  if [ $USING_ORG -eq 1 ]; then
    export CORE_PEER_LOCALMSPID=RegulatorMSP
    export CORE_PEER_TLS_ROOTCERT_FILE=$PEER0_ORG1_CA
    export CORE_PEER_MSPCONFIGPATH=${TEST_NETWORK_HOME}/organizations/peerOrganizations/regulator.drugguard.vn/users/Admin@regulator.drugguard.vn/msp
    export CORE_PEER_ADDRESS=$PEER_REGULATOR_ADDRESS
  elif [ $USING_ORG -eq 2 ]; then
    export CORE_PEER_LOCALMSPID=ManufacturerMSP
    export CORE_PEER_TLS_ROOTCERT_FILE=$PEER0_ORG2_CA
    export CORE_PEER_MSPCONFIGPATH=${TEST_NETWORK_HOME}/organizations/peerOrganizations/manufacturer.drugguard.vn/users/Admin@manufacturer.drugguard.vn/msp
    export CORE_PEER_ADDRESS=$PEER_MANUFACTURER_ADDRESS
  elif [ $USING_ORG -eq 3 ]; then
    export CORE_PEER_LOCALMSPID=DistributorMSP
    export CORE_PEER_TLS_ROOTCERT_FILE=$PEER0_ORG3_CA
    export CORE_PEER_MSPCONFIGPATH=${TEST_NETWORK_HOME}/organizations/peerOrganizations/distributor.drugguard.vn/users/Admin@distributor.drugguard.vn/msp
    export CORE_PEER_ADDRESS=$PEER_DISTRIBUTOR_ADDRESS
  else
    errorln "ORG Unknown"
  fi

  if [ "$VERBOSE" = "true" ]; then
    env | grep CORE
  fi
}

# parsePeerConnectionParameters $@
# Helper function that sets the peer connection parameters for a chaincode
# operation
parsePeerConnectionParameters() {
  PEER_CONN_PARMS=()
  PEERS=""
  while [ "$#" -gt 0 ]; do
    setGlobals $1
    if [ $1 -eq 1 ]; then PEER="peer0.regulator"; elif [ $1 -eq 2 ]; then PEER="peer0.manufacturer"; else PEER="peer0.distributor"; fi
    ## Set peer addresses
    if [ -z "$PEERS" ]
    then
	PEERS="$PEER"
    else
	PEERS="$PEERS $PEER"
    fi
    PEER_CONN_PARMS=("${PEER_CONN_PARMS[@]}" --peerAddresses $CORE_PEER_ADDRESS)
    ## Set path to TLS certificate
    CA=PEER0_ORG$1_CA
    TLSINFO=(--tlsRootCertFiles "${!CA}")
    PEER_CONN_PARMS=("${PEER_CONN_PARMS[@]}" "${TLSINFO[@]}")
    # shift by one to get to the next organization
    shift
  done
}

verifyResult() {
  if [ $1 -ne 0 ]; then
    fatalln "$2"
  fi
}
