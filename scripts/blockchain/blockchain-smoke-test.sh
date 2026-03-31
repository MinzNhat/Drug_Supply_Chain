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
BATCH_ID="${BATCH_ID:-BATCH_2026_DHG_A01}"
DRUG_NAME="${DRUG_NAME:-Hapacol 650 Extra}"
QUANTITY="${QUANTITY:-10000}"
VERIFY_TIMES="${VERIFY_TIMES:-3}"
ASSERT_SCANCOUNT="${ASSERT_SCANCOUNT:-true}"
QR_DATA_HASH="${QR_DATA_HASH:-a1b2c3d4}"
QR_METADATA_SERIES="${QR_METADATA_SERIES:-1234567890abcdef}"
QR_METADATA_ISSUED="${QR_METADATA_ISSUED:-0011223344556677}"
QR_METADATA_EXPIRY="${QR_METADATA_EXPIRY:-8899aabbccddeeff}"
QR_TOKEN_DIGEST="${QR_TOKEN_DIGEST:-6f1af1f8f6934f9397b8d6fe3136bf470f82f4ea31cbec7392fe99a93a9da9dc}"
QR_IS_AUTHENTIC="${QR_IS_AUTHENTIC:-true}"
QR_CONFIDENCE_SCORE="${QR_CONFIDENCE_SCORE:-0.86}"

check_prereqs() {
	local missing=0
	for cmd in peer jq; do
		if ! command -v "$cmd" >/dev/null 2>&1; then
			echo "Missing required command: $cmd"
			missing=1
		fi
	done

	if [[ ! -d "${TEST_NETWORK_HOME}" ]]; then
		echo "TEST_NETWORK_HOME not found: ${TEST_NETWORK_HOME}"
		missing=1
	fi

	if [[ $missing -ne 0 ]]; then
		exit 1
	fi
}

invoke_on_org() {
	local org="$1"
	local payload="$2"

	setGlobals "$org" >/dev/null
	local endorser_address="localhost:7051"
	local endorser_ca="$PEER0_ORG1_CA"

	peer chaincode invoke \
		-o localhost:7050 \
		--ordererTLSHostnameOverride orderer.example.com \
		--tls \
		--cafile "$ORDERER_CA" \
		-C "${CHANNEL_NAME}" \
		-n "${CC_NAME}" \
		--peerAddresses "${endorser_address}" \
		--tlsRootCertFiles "${endorser_ca}" \
		--waitForEvent \
		--waitForEventTimeout 30s \
		-c "${payload}" >/dev/null
}

query_on_org() {
	local org="$1"
	local payload="$2"

	setGlobals "$org" >/dev/null
	peer chaincode query -C "${CHANNEL_NAME}" -n "${CC_NAME}" -c "${payload}" | tail -n 1
}

main() {
	check_prereqs

	export TEST_NETWORK_HOME
	export OVERRIDE_ORG="${OVERRIDE_ORG:-}"
	export VERBOSE="${VERBOSE:-false}"
	# shellcheck source=/dev/null
	. "${TEST_NETWORK_HOME}/scripts/envVar.sh"

	local exists_result
	exists_result="$(query_on_org 1 "{\"function\":\"BatchExists\",\"Args\":[\"${BATCH_ID}\"]}")"
	if [[ "${exists_result}" == "true" ]]; then
		local original_batch_id="${BATCH_ID}"
		BATCH_ID="${BATCH_ID}_$(date +%s)"
		echo "[init] Batch ${original_batch_id} already exists, using ${BATCH_ID} for this test run"
	fi

	echo "[1/8] CreateBatch as Manufacturer (Org2 -> Manufacturer alias)"
	invoke_on_org 2 "{\"function\":\"CreateBatch\",\"Args\":[\"${BATCH_ID}\",\"${DRUG_NAME}\",\"${QUANTITY}\"]}"

	echo "[2/8] VerifyBatch ${VERIFY_TIMES} times"
	for ((i = 1; i <= VERIFY_TIMES; i++)); do
		invoke_on_org 1 "{\"function\":\"VerifyBatch\",\"Args\":[\"${BATCH_ID}\"]}"
	done

	echo "[3/8] BindProtectedQR metadata"
	invoke_on_org 2 "{\"function\":\"BindProtectedQR\",\"Args\":[\"${BATCH_ID}\",\"${QR_DATA_HASH}\",\"${QR_METADATA_SERIES}\",\"${QR_METADATA_ISSUED}\",\"${QR_METADATA_EXPIRY}\",\"${QR_TOKEN_DIGEST}\"]}"

	echo "[4/8] VerifyProtectedQR digest check"
	local verify_qr_result
	verify_qr_result="$(query_on_org 1 "{\"function\":\"VerifyProtectedQR\",\"Args\":[\"${BATCH_ID}\",\"${QR_TOKEN_DIGEST}\"]}")"
	local qr_match
	qr_match="$(echo "${verify_qr_result}" | jq -r '.matched')"
	if [[ "${qr_match}" != "true" ]]; then
		echo "Smoke test failed: VerifyProtectedQR returned matched=${qr_match}" >&2
		exit 1
	fi

	echo "[5/8] RecordProtectedQRVerification evidence"
	invoke_on_org 1 "{\"function\":\"RecordProtectedQRVerification\",\"Args\":[\"${BATCH_ID}\",\"${QR_IS_AUTHENTIC}\",\"${QR_CONFIDENCE_SCORE}\",\"${QR_TOKEN_DIGEST}\"]}"

	echo "[6/8] UpdateDocument packageImage"
	invoke_on_org 2 "{\"function\":\"UpdateDocument\",\"Args\":[\"${BATCH_ID}\",\"packageImage\",\"QmHash_V1\"]}"

	echo "[7/8] ShipBatch to DistributorMSP"
	invoke_on_org 2 "{\"function\":\"ShipBatch\",\"Args\":[\"${BATCH_ID}\",\"DistributorMSP\"]}"

	if [[ -d "${TEST_NETWORK_HOME}/organizations/peerOrganizations/org3.example.com" ]]; then
		echo "[8/8] ReceiveBatch as Org3 (Distributor alias)"
		invoke_on_org 3 "{\"function\":\"ReceiveBatch\",\"Args\":[\"${BATCH_ID}\"]}"
	else
		echo "[8/8] Skip ReceiveBatch (Org3 not present). Add org3/distributor first if needed."
	fi

	echo "[final] ReadBatch final state"
	local final_state
	final_state="$(query_on_org 1 "{\"function\":\"ReadBatch\",\"Args\":[\"${BATCH_ID}\"]}")"

	if [[ "${ASSERT_SCANCOUNT}" == "true" ]]; then
		local scan_count
		scan_count="$(echo "${final_state}" | jq -r '.scanCount')"
		if [[ "${scan_count}" != "${VERIFY_TIMES}" ]]; then
			echo "Smoke test failed: expected scanCount=${VERIFY_TIMES}, got ${scan_count}" >&2
			exit 1
		fi
	fi

	local recorded_verifications
	recorded_verifications="$(echo "${final_state}" | jq -r '.protected_qr.verification_history | length')"
	if [[ "${recorded_verifications}" -lt 1 ]]; then
		echo "Smoke test failed: protected_qr.verification_history is empty" >&2
		exit 1
	fi

	if echo "${final_state}" | jq . >/dev/null 2>&1; then
		echo "${final_state}" | jq .
	else
		echo "${final_state}"
	fi

	echo "Smoke test completed"
}

main
