#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Backward-compatible entrypoint. Canonical script is scripts/run-all.sh.
exec "${ROOT_DIR}/scripts/run-all.sh" "$@"
