#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUTPUT_DIR="${1:-${TEST_OUTPUT_DIR:-${ROOT_DIR}/test-output}}"
INCLUDE_HISTORY="${SCAN_STATUS_INCLUDE_HISTORY:-false}"

if [[ ! -d "${OUTPUT_DIR}" ]]; then
    echo "[ci] test-output directory not found, skipping: ${OUTPUT_DIR}"
    exit 0
fi

declare -a failed_files=()
declare -a selected_files=()
txt_count=0
json_count=0
all_file_count=0

status_failed_pattern='(status|result):[[:space:]]*(FAILED|FAILURE|ERROR)[[:space:]]*$'
json_failed_pattern='"(status|result)"[[:space:]]*:[[:space:]]*"(FAILED|FAILURE|ERROR)"'

collect_files() {
    find "${OUTPUT_DIR}" -type f \( -name '*.txt' -o -name '*.json' \) | sort
}

select_latest_artifacts() {
    local all_file_list
    local timestamped_file_list
    local selected_file_list

    all_file_list="$(mktemp)"
    timestamped_file_list="$(mktemp)"
    selected_file_list="$(mktemp)"

    collect_files > "${all_file_list}"

    while IFS= read -r file; do
        [[ -z "${file}" ]] && continue

        local rel
        local name
        local dir
        rel="${file#${OUTPUT_DIR}/}"
        name="${rel##*/}"
        dir="${rel%/*}"
        if [[ "${dir}" == "${rel}" ]]; then
            dir="."
        fi

        if [[ "${name}" =~ ^(.*)-([0-9]{8}T[0-9]{6}Z)\.(txt|json)$ ]]; then
            local normalized_name
            normalized_name="${BASH_REMATCH[1]}.${BASH_REMATCH[3]}"
            printf '%s|%s|%s\n' "${dir}/${normalized_name}" "${BASH_REMATCH[2]}" "${file}" >> "${timestamped_file_list}"
        else
            printf '%s\n' "${file}" >> "${selected_file_list}"
        fi
    done < "${all_file_list}"

    if [[ -s "${timestamped_file_list}" ]]; then
        sort -t '|' -k1,1 -k2,2 "${timestamped_file_list}" | awk -F'|' '
        NR == 1 {
            prev_key = $1
            prev_path = $3
            next
        }

        {
            if ($1 != prev_key) {
                print prev_path
                prev_key = $1
            }
            prev_path = $3
        }

        END {
            if (NR > 0) {
                print prev_path
            }
        }' >> "${selected_file_list}"
    fi

    sort "${selected_file_list}"

    rm -f "${all_file_list}" "${timestamped_file_list}" "${selected_file_list}"
}

if [[ "${INCLUDE_HISTORY}" == "true" ]]; then
    while IFS= read -r file; do
        [[ -z "${file}" ]] && continue
        selected_files+=("${file}")
    done < <(collect_files)
else
    while IFS= read -r file; do
        [[ -z "${file}" ]] && continue
        selected_files+=("${file}")
    done < <(select_latest_artifacts)
fi

all_file_count="${#selected_files[@]}"

for file in "${selected_files[@]}"; do
    [[ "${file}" != *.txt ]] && continue
    txt_count=$((txt_count + 1))

    if grep -Eq "${status_failed_pattern}" "${file}"; then
        failed_files+=("${file}")
    fi
done

for file in "${selected_files[@]}"; do
    [[ "${file}" != *.json ]] && continue
    json_count=$((json_count + 1))

    if grep -Eq "${json_failed_pattern}" "${file}"; then
        failed_files+=("${file}")
    fi
done

if [[ "${#failed_files[@]}" -eq 0 ]]; then
    if [[ "${INCLUDE_HISTORY}" == "true" ]]; then
        echo "[ci] test-output status scan passed (${txt_count} txt, ${json_count} json from ${all_file_count} artifacts; mode=history)"
    else
        echo "[ci] test-output status scan passed (${txt_count} txt, ${json_count} json from ${all_file_count} artifacts; mode=latest)"
    fi
    exit 0
fi

if [[ "${INCLUDE_HISTORY}" == "true" ]]; then
    echo "[ci] test-output status scan failed: ${#failed_files[@]} artifact(s) report FAILED/ERROR (mode=history)"
else
    echo "[ci] test-output status scan failed: ${#failed_files[@]} artifact(s) report FAILED/ERROR (mode=latest)"
fi
for file in "${failed_files[@]}"; do
    echo "- ${file}"
    grep -En "${status_failed_pattern}|${json_failed_pattern}" "${file}" | head -n 1 || true
done

exit 1
