#!/usr/bin/env bash
# Run every demo with labelled logs and shared Ctrl+C cleanup.
set -euo pipefail
# Give each background job its own process group, including Bun's children.
set -m

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
command -v bun >/dev/null 2>&1 || { echo 'Bun is required: https://bun.sh' >&2; exit 1; }
DEMOS=(edificio-europa infinicave tonada tarot-spead orbital-mechanics-laboratory digital-logic-laboratory flip-slop codexcanvas)
# Europa imports shared Crosstalk source, whose dependencies live in cross-talk/.
INSTALL_PROJECTS=(cross-talk "${DEMOS[@]}")
PORTS=(3001 3002 3003 3004 3005 3006 3007 3008)
PORTAL_PORT=3000
SERVICES=("${DEMOS[@]}" portal)
SERVICE_PORTS=("${PORTS[@]}" "$PORTAL_PORT")
for project in "${INSTALL_PROJECTS[@]}"; do
  if [[ ! -f "$ROOT_DIR/$project/package.json" ]]; then
    echo "Missing project: $ROOT_DIR/$project" >&2
    exit 1
  fi
done

for asset in index.html portal-server.ts; do
  if [[ ! -f "$ROOT_DIR/$asset" ]]; then
    echo "Missing portal file: $ROOT_DIR/$asset" >&2
    exit 1
  fi
done

# Let Bun check the dependency tree, including partially installed node_modules.
# Complete every install before starting any servers; keep checked-in versions.
for project in "${INSTALL_PROJECTS[@]}"; do
  printf '[%s] Checking/installing dependencies…\n' "$project"
  if ! (cd -- "$ROOT_DIR/$project" && bun install --frozen-lockfile); then
    printf '[%s] Dependency installation failed; no servers started.\n' "$project" >&2
    exit 1
  fi
done

LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/gpt6-demos.XXXXXX")"
SERVER_PIDS=()
LOGGER_PIDS=()
cleanup() {
  trap '' INT TERM
  echo
  echo 'Stopping all demos and the portal…'
  for pid in "${SERVER_PIDS[@]}"; do
    kill -TERM -- "-$pid" 2>/dev/null || true
  done
  for pid in "${LOGGER_PIDS[@]}"; do
    kill -TERM -- "-$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  rm -rf -- "$LOG_DIR"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

for i in "${!SERVICES[@]}"; do
  demo="${SERVICES[$i]}"
  port="${SERVICE_PORTS[$i]}"
  fifo="$LOG_DIR/$demo"
  mkfifo "$fifo"
  (
    while IFS= read -r line || [[ -n "$line" ]]; do
      printf '[%s] %s\n' "$demo" "$line"
    done < "$fifo"
  ) &
  LOGGER_PIDS+=("$!")
  (
    export PORT="$port"
    if [[ "$demo" == portal ]]; then
      cd -- "$ROOT_DIR"
      exec bun run portal-server.ts
    else
      cd -- "$ROOT_DIR/$demo"
      exec bun run dev
    fi
  ) > "$fifo" 2>&1 &
  SERVER_PIDS+=("$!")
  printf '%-28s http://localhost:%s\n' "$demo" "$port"
done
printf '\nPress Ctrl+C to stop all %s demos and the portal.\n\n' "${#DEMOS[@]}"

# Bash 3.2 (included with macOS) has no wait -n.
while true; do
  for i in "${!SERVER_PIDS[@]}"; do
    if ! kill -0 "${SERVER_PIDS[$i]}" 2>/dev/null; then
      status=0
      wait "${SERVER_PIDS[$i]}" || status=$?
      echo "${SERVICES[$i]} exited (status $status); stopping all services." >&2
      exit "$status"
    fi
  done
  sleep 1 &
  wait "$!" || true
done
