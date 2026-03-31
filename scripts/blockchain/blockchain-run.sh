#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
FABRIC_SAMPLES_HOME="${ROOT_DIR}/blockchain"
TEST_NETWORK_HOME="${TEST_NETWORK_HOME:-${FABRIC_SAMPLES_HOME}/test-network}"
export FABRIC_CFG_PATH="${FABRIC_SAMPLES_HOME}/config"
export PATH="${FABRIC_SAMPLES_HOME}/bin:${PATH}"

MODE="${1:-full}"
CHANNEL_NAME="${CHANNEL_NAME:-mychannel}"
CC_NAME="${CC_NAME:-drugtracker}"
CC_LANG="${CC_LANG:-javascript}"
CC_SRC_PATH="${CC_SRC_PATH:-${FABRIC_SAMPLES_HOME}/asset-transfer-drug/chaincode-js}"
CC_VERSION="${CC_VERSION:-1.0}"
CC_SEQUENCE="${CC_SEQUENCE:-1}"
AUTO_INSTALL_PREREQS="${AUTO_INSTALL_PREREQS:-false}"

usage() {
	cat <<EOF
Usage:
	./scripts/blockchain/blockchain-run.sh [prereq|full|up|deploy|upgrade|down]

Modes:
	prereq   Install Hyperledger Fabric binaries/images via test-network
	full     Down old network, up + createChannel, deploy chaincode
	up       Up network and create channel only
	deploy   Deploy current chaincode version
	upgrade  Run centralized chaincode update script
	down     Stop and clean test network

Optional environment variables:
	TEST_NETWORK_HOME  (default: blockchain/test-network)
	CHANNEL_NAME       (default: mychannel)
	CC_NAME            (default: drugtracker)
	CC_LANG            (default: javascript)
	CC_SRC_PATH        (default: blockchain/asset-transfer-drug/chaincode-js)
	CC_VERSION         (default: 1.0)
	CC_SEQUENCE        (default: 1)
	AUTO_INSTALL_PREREQS (default: false)
EOF
}

install_prereqs() {
	(
		cd "${TEST_NETWORK_HOME}"
		./network.sh prereq
	)
}

check_prereqs() {
	local missing=0
	for cmd in peer configtxgen jq; do
		if ! command -v "$cmd" >/dev/null 2>&1; then
			echo "Missing required command: $cmd"
			missing=1
		fi
	done

	if [[ ! -d "${TEST_NETWORK_HOME}" ]]; then
		echo "TEST_NETWORK_HOME not found: ${TEST_NETWORK_HOME}"
		missing=1
	fi

	if [[ ! -d "${CC_SRC_PATH}" ]]; then
		echo "CC_SRC_PATH not found: ${CC_SRC_PATH}"
		missing=1
	fi

	if [[ $missing -ne 0 && "${AUTO_INSTALL_PREREQS}" == "true" ]]; then
		echo "Prerequisites missing, running ./network.sh prereq..."
		install_prereqs
		missing=0
		for cmd in peer configtxgen jq; do
			if ! command -v "$cmd" >/dev/null 2>&1; then
				echo "Still missing required command: $cmd"
				missing=1
			fi
		done
	fi

	if [[ $missing -ne 0 ]]; then
		echo "Hint: run ./scripts/blockchain/blockchain-run.sh prereq first"
		exit 1
	fi
}

up_channel() {
	(
		cd "${TEST_NETWORK_HOME}"
		./network.sh up createChannel -c "${CHANNEL_NAME}"
	)
}

deploy_chaincode() {
	(
		CHANNEL_NAME="${CHANNEL_NAME}" \
		CC_NAME="${CC_NAME}" \
		CC_VERSION="${CC_VERSION}" \
		CC_SEQUENCE="${CC_SEQUENCE}" \
		CC_LANG="${CC_LANG}" \
		CC_SRC_PATH="${CC_SRC_PATH}" \
		TEST_NETWORK_HOME="${TEST_NETWORK_HOME}" \
			"${ROOT_DIR}/scripts/blockchain/update-code-centralized.sh"
	)
}

down_network() {
	(
		cd "${TEST_NETWORK_HOME}"
		./network.sh down 2> >(
			grep -E -v '^Error response from daemon: get docker_(orderer\.example\.com|peer0\.org1\.example\.com|peer0\.org2\.example\.com): no such volume$' >&2
		)
	)

	# Remove leftover chaincode builder containers that remain in Created state.
	local created_chaincode_ids
	created_chaincode_ids="$(docker ps -aq \
		--filter status=created \
		--filter label=org.hyperledger.fabric.chaincode.type)"

	if [[ -n "${created_chaincode_ids}" ]]; then
		echo "Cleaning up created Fabric chaincode containers..."
		# shellcheck disable=SC2086
		docker rm -v ${created_chaincode_ids} >/dev/null 2>&1 || true
	fi
}

upgrade_chaincode() {
	deploy_chaincode
}

main() {
	if [[ "${MODE}" == "-h" || "${MODE}" == "--help" ]]; then
		usage
		exit 0
	fi

	if [[ "${MODE}" == "prereq" ]]; then
		install_prereqs
		echo "Done: mode=prereq"
		exit 0
	fi

	check_prereqs

	case "${MODE}" in
		full)
			echo "[1/3] Reset network"
			down_network || true
			echo "[2/3] Start network + channel"
			up_channel
			echo "[3/3] Deploy chaincode"
			deploy_chaincode
			;;
		up)
			up_channel
			;;
		deploy)
			deploy_chaincode
			;;
		upgrade)
			upgrade_chaincode
			;;
		down)
			down_network
			;;
		*)
			echo "Unknown mode: ${MODE}"
			usage
			exit 1
			;;
	esac

	echo "Done: mode=${MODE}"
}

main
