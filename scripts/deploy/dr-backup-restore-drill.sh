#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ACTION="${1:-drill}"

DR_OUTPUT_ROOT="${DATN_DR_OUTPUT_ROOT:-${ROOT_DIR}/test-output/dr}"
RUN_ID="${DATN_DR_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
RUN_DIR="${DATN_DR_RUN_DIR:-${DR_OUTPUT_ROOT}/${RUN_ID}}"
BACKUP_DIR="${DATN_DR_BACKUP_DIR:-${RUN_DIR}/backup}"
EVIDENCE_FILE="${DATN_DR_EVIDENCE_FILE:-${RUN_DIR}/dr-${ACTION}-${RUN_ID}.json}"

MONGO_CONTAINER="${DATN_DR_MONGO_CONTAINER:-drug-guard-mongo}"
MONGO_DATABASES_RAW="${DATN_DR_MONGO_DATABASES:-drug_guard protected_qr}"
RESTORE_DB_PREFIX="${DATN_DR_RESTORE_DB_PREFIX:-dr_restore}"

RUN_SMOKE="${DATN_DR_RUN_SMOKE:-true}"
SMOKE_CHAINCODE="${DATN_DR_SMOKE_CHAINCODE:-false}"

RPO_TARGET_SECONDS="${DATN_DR_RPO_TARGET_SECONDS:-900}"
RTO_TARGET_SECONDS="${DATN_DR_RTO_TARGET_SECONDS:-1800}"
SNAPSHOT_CADENCE_SECONDS="${DATN_DR_SNAPSHOT_CADENCE_SECONDS:-900}"

declare -a MONGO_DATABASES
read -r -a MONGO_DATABASES <<<"${MONGO_DATABASES_RAW}"

declare -a MONGO_ARCHIVES
declare -a MONGO_SHA256
declare -a MONGO_SIZE_BYTES
declare -a RESTORE_DATABASES
declare -a RESTORED_COLLECTION_COUNTS

declare -a FABRIC_INCLUDED_PATHS

RESULT="FAILED"
BACKUP_STARTED_UTC=""
BACKUP_COMPLETED_UTC=""
RESTORE_STARTED_UTC=""
RESTORE_COMPLETED_UTC=""
SMOKE_STATUS="skipped"
BACKUP_DURATION_SECONDS=""
RESTORE_DURATION_SECONDS=""
SMOKE_DURATION_SECONDS="0"
RTO_ACTUAL_SECONDS=""
RTO_MET="false"
RPO_MET="false"
FABRIC_ARCHIVE=""
FABRIC_ARCHIVE_SHA256=""
FABRIC_ARCHIVE_SIZE_BYTES="0"
FABRIC_ARCHIVE_ENTRY_COUNT="0"
FABRIC_PATH_LIST_FILE=""

usage() {
    cat <<'USAGE'
Usage:
  scripts/deploy/dr-backup-restore-drill.sh [backup|restore|drill]

Actions:
  backup   Create Mongo and Fabric backup artifacts only.
  restore  Restore Mongo databases from DATN_DR_BACKUP_DIR and verify staging-like health.
  drill    Run backup + restore sequence and emit DR evidence (default).

Optional environment variables:
  DATN_DR_BACKUP_DIR=/path/to/backup
  DATN_DR_RUN_SMOKE=true|false
  DATN_DR_SMOKE_CHAINCODE=true|false
  DATN_DR_MONGO_DATABASES="drug_guard protected_qr"
  DATN_DR_RPO_TARGET_SECONDS=900
  DATN_DR_RTO_TARGET_SECONDS=1800
  DATN_DR_SNAPSHOT_CADENCE_SECONDS=900
USAGE
}

require_cmd() {
    local cmd="$1"
    if ! command -v "${cmd}" >/dev/null 2>&1; then
        echo "Missing required command: ${cmd}" >&2
        exit 1
    fi
}

hash_file() {
    local file_path="$1"
    if command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "${file_path}" | awk '{print $1}'
        return
    fi

    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "${file_path}" | awk '{print $1}'
        return
    fi

    echo "Unable to compute SHA256 (missing shasum/sha256sum)" >&2
    exit 1
}

timestamp_utc() {
    date -u +"%Y-%m-%dT%H:%M:%SZ"
}

json_escape() {
    printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

json_string_or_null() {
    local value="$1"
    if [[ -z "${value}" ]]; then
        printf 'null'
        return
    fi

    printf '"%s"' "$(json_escape "${value}")"
}

json_number_or_null() {
    local value="$1"
    if [[ -z "${value}" ]]; then
        printf 'null'
        return
    fi

    printf '%s' "${value}"
}

ensure_mongo_running() {
    if ! docker ps --format '{{.Names}}' | grep -qx "${MONGO_CONTAINER}"; then
        echo "Mongo container is not running: ${MONGO_CONTAINER}" >&2
        exit 1
    fi
}

backup_mongo() {
    mkdir -p "${BACKUP_DIR}/mongo"

    local idx
    for idx in "${!MONGO_DATABASES[@]}"; do
        local db_name="${MONGO_DATABASES[$idx]}"
        local archive_path="${BACKUP_DIR}/mongo/${db_name}.archive.gz"

        echo "[dr] backing up Mongo database: ${db_name}"
        docker exec "${MONGO_CONTAINER}" sh -lc \
            "mongodump --archive --gzip --db '${db_name}'" >"${archive_path}"

        MONGO_ARCHIVES[$idx]="${archive_path}"
        MONGO_SHA256[$idx]="$(hash_file "${archive_path}")"
        MONGO_SIZE_BYTES[$idx]="$(wc -c <"${archive_path}" | tr -d '[:space:]')"
    done
}

collect_fabric_paths() {
    local candidates=(
        "blockchain/test-network/organizations"
        "blockchain/test-network/channel-artifacts"
        "blockchain/test-network/system-genesis-block"
        "blockchain/test-network/addOrg3/organizations"
        "blockchain/test-network/addOrg3/channel-artifacts"
    )

    FABRIC_INCLUDED_PATHS=()
    local rel_path
    for rel_path in "${candidates[@]}"; do
        if [[ -e "${ROOT_DIR}/${rel_path}" ]]; then
            FABRIC_INCLUDED_PATHS+=("${rel_path}")
        fi
    done

    if [[ "${#FABRIC_INCLUDED_PATHS[@]}" -eq 0 ]]; then
        echo "No Fabric artifact paths found for backup." >&2
        exit 1
    fi
}

backup_fabric() {
    mkdir -p "${BACKUP_DIR}/fabric"
    collect_fabric_paths

    FABRIC_ARCHIVE="${BACKUP_DIR}/fabric/fabric-artifacts.tar.gz"
    FABRIC_PATH_LIST_FILE="${BACKUP_DIR}/fabric/included-paths.txt"
    echo "[dr] backing up Fabric artifacts"
    (
        cd "${ROOT_DIR}"
        tar -czf "${FABRIC_ARCHIVE}" "${FABRIC_INCLUDED_PATHS[@]}"
    )

    printf '%s\n' "${FABRIC_INCLUDED_PATHS[@]}" >"${FABRIC_PATH_LIST_FILE}"

    FABRIC_ARCHIVE_SHA256="$(hash_file "${FABRIC_ARCHIVE}")"
    FABRIC_ARCHIVE_SIZE_BYTES="$(wc -c <"${FABRIC_ARCHIVE}" | tr -d '[:space:]')"
    FABRIC_ARCHIVE_ENTRY_COUNT="$(tar -tzf "${FABRIC_ARCHIVE}" | wc -l | tr -d '[:space:]')"
}

load_backup_metadata() {
    local idx
    for idx in "${!MONGO_DATABASES[@]}"; do
        local db_name="${MONGO_DATABASES[$idx]}"
        local archive_path="${BACKUP_DIR}/mongo/${db_name}.archive.gz"

        if [[ ! -f "${archive_path}" ]]; then
            echo "Missing Mongo backup archive: ${archive_path}" >&2
            exit 1
        fi

        MONGO_ARCHIVES[$idx]="${archive_path}"
        MONGO_SHA256[$idx]="$(hash_file "${archive_path}")"
        MONGO_SIZE_BYTES[$idx]="$(wc -c <"${archive_path}" | tr -d '[:space:]')"
    done

    FABRIC_ARCHIVE="${BACKUP_DIR}/fabric/fabric-artifacts.tar.gz"
    if [[ ! -f "${FABRIC_ARCHIVE}" ]]; then
        echo "Missing Fabric backup archive: ${FABRIC_ARCHIVE}" >&2
        exit 1
    fi

    FABRIC_ARCHIVE_SHA256="$(hash_file "${FABRIC_ARCHIVE}")"
    FABRIC_ARCHIVE_SIZE_BYTES="$(wc -c <"${FABRIC_ARCHIVE}" | tr -d '[:space:]')"
    FABRIC_ARCHIVE_ENTRY_COUNT="$(tar -tzf "${FABRIC_ARCHIVE}" | wc -l | tr -d '[:space:]')"

    FABRIC_PATH_LIST_FILE="${BACKUP_DIR}/fabric/included-paths.txt"
    FABRIC_INCLUDED_PATHS=()
    if [[ -f "${FABRIC_PATH_LIST_FILE}" ]]; then
        while IFS= read -r line || [[ -n "${line}" ]]; do
            if [[ -n "${line}" ]]; then
                FABRIC_INCLUDED_PATHS+=("${line}")
            fi
        done <"${FABRIC_PATH_LIST_FILE}"
    fi
}

restore_mongo() {
    local idx
    for idx in "${!MONGO_DATABASES[@]}"; do
        local db_name="${MONGO_DATABASES[$idx]}"
        local archive_path="${MONGO_ARCHIVES[$idx]}"
        local restore_db="${RESTORE_DB_PREFIX}_${db_name}_${RUN_ID}"

        echo "[dr] restoring Mongo backup ${db_name} -> ${restore_db}"
        docker exec -i "${MONGO_CONTAINER}" sh -lc \
            "mongorestore --archive --gzip --drop --db '${restore_db}'" <"${archive_path}"

        RESTORE_DATABASES[$idx]="${restore_db}"
        RESTORED_COLLECTION_COUNTS[$idx]="$(docker exec "${MONGO_CONTAINER}" mongosh --quiet --eval "db.getSiblingDB('${restore_db}').getCollectionNames().length" | tail -n 1 | tr -d '[:space:]')"
    done
}

run_smoke_checks() {
    if [[ "${RUN_SMOKE}" != "true" ]]; then
        SMOKE_STATUS="skipped"
        SMOKE_DURATION_SECONDS="0"
        return
    fi

    local smoke_start
    local smoke_end
    smoke_start="$(date +%s)"

    if DATN_STAGING_CHAINCODE_SMOKE="${SMOKE_CHAINCODE}" \
        "${ROOT_DIR}/scripts/deploy/staging-smoke.sh"; then
        SMOKE_STATUS="passed"
    else
        SMOKE_STATUS="failed"
        return 1
    fi

    smoke_end="$(date +%s)"
    SMOKE_DURATION_SECONDS="$((smoke_end - smoke_start))"
}

write_evidence() {
    mkdir -p "$(dirname "${EVIDENCE_FILE}")"

    {
        echo "{"
        echo "  \"status\": \"${RESULT}\"," 
        echo "  \"action\": \"${ACTION}\"," 
        echo "  \"runId\": \"${RUN_ID}\"," 
        echo "  \"backupDir\": \"$(json_escape "${BACKUP_DIR}")\"," 
        echo "  \"evidenceFile\": \"$(json_escape "${EVIDENCE_FILE}")\"," 
        echo "  \"backupStartedAtUtc\": $(json_string_or_null "${BACKUP_STARTED_UTC}"),"
        echo "  \"backupCompletedAtUtc\": $(json_string_or_null "${BACKUP_COMPLETED_UTC}"),"
        echo "  \"restoreStartedAtUtc\": $(json_string_or_null "${RESTORE_STARTED_UTC}"),"
        echo "  \"restoreCompletedAtUtc\": $(json_string_or_null "${RESTORE_COMPLETED_UTC}"),"
        echo "  \"mongo\": ["

        local idx
        for idx in "${!MONGO_DATABASES[@]}"; do
            local comma=","
            if [[ "${idx}" -eq $((${#MONGO_DATABASES[@]} - 1)) ]]; then
                comma=""
            fi

            echo "    {"
            echo "      \"sourceDb\": \"$(json_escape "${MONGO_DATABASES[$idx]}")\"," 
            echo "      \"archive\": \"$(json_escape "${MONGO_ARCHIVES[$idx]}")\"," 
            echo "      \"sha256\": \"$(json_escape "${MONGO_SHA256[$idx]}")\"," 
            echo "      \"sizeBytes\": ${MONGO_SIZE_BYTES[$idx]},"
            echo "      \"restoreDb\": $(json_string_or_null "${RESTORE_DATABASES[$idx]:-}"),"
            echo "      \"restoredCollectionCount\": $(json_number_or_null "${RESTORED_COLLECTION_COUNTS[$idx]:-}")"
            echo "    }${comma}"
        done

        echo "  ],"
        echo "  \"fabric\": {"
        echo "    \"archive\": $(json_string_or_null "${FABRIC_ARCHIVE}"),"
        echo "    \"sha256\": $(json_string_or_null "${FABRIC_ARCHIVE_SHA256}"),"
        echo "    \"sizeBytes\": ${FABRIC_ARCHIVE_SIZE_BYTES},"
        echo "    \"archiveEntryCount\": ${FABRIC_ARCHIVE_ENTRY_COUNT},"
        echo "    \"includedPaths\": ["

        for idx in "${!FABRIC_INCLUDED_PATHS[@]}"; do
            local comma=","
            if [[ "${idx}" -eq $((${#FABRIC_INCLUDED_PATHS[@]} - 1)) ]]; then
                comma=""
            fi

            echo "      \"$(json_escape "${FABRIC_INCLUDED_PATHS[$idx]}")\"${comma}"
        done

        echo "    ]"
        echo "  },"
        echo "  \"metrics\": {"
        echo "    \"backupDurationSeconds\": $(json_number_or_null "${BACKUP_DURATION_SECONDS}"),"
        echo "    \"restoreDurationSeconds\": $(json_number_or_null "${RESTORE_DURATION_SECONDS}"),"
        echo "    \"smokeDurationSeconds\": $(json_number_or_null "${SMOKE_DURATION_SECONDS}"),"
        echo "    \"rpoTargetSeconds\": ${RPO_TARGET_SECONDS},"
        echo "    \"snapshotCadenceSeconds\": ${SNAPSHOT_CADENCE_SECONDS},"
        echo "    \"rpoMet\": ${RPO_MET},"
        echo "    \"rtoTargetSeconds\": ${RTO_TARGET_SECONDS},"
        echo "    \"rtoActualSeconds\": $(json_number_or_null "${RTO_ACTUAL_SECONDS}"),"
        echo "    \"rtoMet\": ${RTO_MET}"
        echo "  },"
        echo "  \"smoke\": {"
        echo "    \"enabled\": ${RUN_SMOKE},"
        echo "    \"chaincodeSmoke\": ${SMOKE_CHAINCODE},"
        echo "    \"status\": \"${SMOKE_STATUS}\""
        echo "  }"
        echo "}"
    } >"${EVIDENCE_FILE}"

    echo "[dr] evidence written: ${EVIDENCE_FILE}"
}

run_backup() {
    local backup_started_epoch
    local backup_completed_epoch

    ensure_mongo_running
    backup_started_epoch="$(date +%s)"
    BACKUP_STARTED_UTC="$(timestamp_utc)"

    backup_mongo
    backup_fabric

    BACKUP_COMPLETED_UTC="$(timestamp_utc)"
    backup_completed_epoch="$(date +%s)"
    BACKUP_DURATION_SECONDS="$((backup_completed_epoch - backup_started_epoch))"
}

run_restore() {
    local restore_started_epoch
    local restore_completed_epoch

    ensure_mongo_running
    RESTORE_STARTED_UTC="$(timestamp_utc)"
    restore_started_epoch="$(date +%s)"

    load_backup_metadata
    restore_mongo
    run_smoke_checks

    RESTORE_COMPLETED_UTC="$(timestamp_utc)"
    restore_completed_epoch="$(date +%s)"
    RESTORE_DURATION_SECONDS="$((restore_completed_epoch - restore_started_epoch))"
    RTO_ACTUAL_SECONDS="$((RESTORE_DURATION_SECONDS + SMOKE_DURATION_SECONDS))"
}

finalize_metrics() {
    if [[ "${SNAPSHOT_CADENCE_SECONDS}" -le "${RPO_TARGET_SECONDS}" ]]; then
        RPO_MET="true"
    fi

    if [[ -n "${RTO_ACTUAL_SECONDS}" && "${RTO_ACTUAL_SECONDS}" -le "${RTO_TARGET_SECONDS}" ]]; then
        RTO_MET="true"
    fi
}

main() {
    require_cmd docker
    require_cmd tar
    require_cmd wc

    case "${ACTION}" in
        backup)
            run_backup
            finalize_metrics
            RESULT="SUCCESS"
            ;;
        restore)
            run_restore
            finalize_metrics
            RESULT="SUCCESS"
            ;;
        drill)
            run_backup
            run_restore
            finalize_metrics
            RESULT="SUCCESS"
            ;;
        -h|--help|help)
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
    write_evidence
}

trap on_exit EXIT

main