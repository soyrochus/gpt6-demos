#!/usr/bin/env bash
# Run every demo and one server for both portal pages with labelled logs and shared Ctrl+C cleanup.
set -euo pipefail
# Give each background job its own process group, including Bun's children.
set -m

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEMOS=(edificio-europa infinicave tonada tarot-spead orbital-mechanics-laboratory digital-logic-laboratory flip-slop codexcanvas assemblavatar one-more-match tracework dmt-experience)
# Europa imports shared Crosstalk source, whose dependencies live in cross-talk/.
INSTALL_PROJECTS=(cross-talk "${DEMOS[@]}")
usage() {
  echo 'Usage: ./run-all.sh [BASE_PORT]'
  echo 'Default base port: 3000. Both portals share it at / and /portal/.'
  echo "Demo ports run from BASE_PORT + 1 through BASE_PORT + ${#DEMOS[@]}."
}
if [[ $# -eq 1 && ( "$1" == --help || "$1" == -h ) ]]; then
  usage
  exit 0
fi
if [[ $# -gt 1 ]]; then
  usage >&2
  exit 1
fi
BASE_PORT_INPUT="${1-3000}"
if [[ ! "$BASE_PORT_INPUT" =~ ^[0-9]{1,5}$ ]]; then
  echo 'BASE_PORT must be a decimal integer.' >&2
  usage >&2
  exit 1
fi
BASE_PORT=$((10#$BASE_PORT_INPUT))
MAX_BASE_PORT=$((65535 - ${#DEMOS[@]}))
if (( BASE_PORT < 1 || BASE_PORT > MAX_BASE_PORT )); then
  echo "BASE_PORT must be between 1 and $MAX_BASE_PORT so every demo fits below port 65536." >&2
  exit 1
fi
command -v bun >/dev/null 2>&1 || { echo 'Bun is required: https://bun.sh' >&2; exit 1; }
PORTS=()
for i in "${!DEMOS[@]}"; do
  PORTS+=("$((BASE_PORT + i + 1))")
done
PORTAL_PORT="$BASE_PORT"
SERVICES=("${DEMOS[@]}" portal)
SERVICE_PORTS=("${PORTS[@]}" "$PORTAL_PORT")
for project in "${INSTALL_PROJECTS[@]}"; do
  if [[ ! -f "$ROOT_DIR/$project/package.json" ]]; then
    echo "Missing project: $ROOT_DIR/$project" >&2
    exit 1
  fi
done

for asset in index.html portal-server.ts portal/index.html portal/portal.css portal/portal.js; do
  if [[ ! -f "$ROOT_DIR/$asset" ]]; then
    echo "Missing portal file: $ROOT_DIR/$asset" >&2
    exit 1
  fi
done

# Let Bun check the dependency tree, including partially installed node_modules.
# Complete every install before starting any servers; keep checked-in versions.
for project in "${INSTALL_PROJECTS[@]}"; do
  printf '[%s] Checking/installing dependencies…\n' "$project"
  install_options=(--frozen-lockfile)
  if [[ "$project" == assemblavatar ]]; then
    install_options+=(--production)
  fi
  if ! (cd -- "$ROOT_DIR/$project" && bun install "${install_options[@]}"); then
    printf '[%s] Dependency installation failed; no servers started.\n' "$project" >&2
    exit 1
  fi
done

# Tracework serves its built interface and API on one assigned port.
# Complete this build before starting any servers.
if ! (cd -- "$ROOT_DIR/tracework" && bun run build); then
  echo '[tracework] Build failed; no servers started.' >&2
  exit 1
fi

LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/gpt6-demos.XXXXXX")"
SERVER_PIDS=()
LOGGER_PIDS=()
cleanup() {
  trap '' INT TERM
  echo
  echo 'Stopping all demos and the portal server…'
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
      if [[ "$demo" == assemblavatar ]]; then
        export ASSEMBLAVATAR_PORT="$port"
        exec bun run start
      fi
      if [[ "$demo" == tracework ]]; then
        exec bun run start
      fi
      if [[ "$demo" == one-more-match ]]; then
        exec bun run dev:web
      fi
      exec bun run dev
    fi
  ) > "$fifo" 2>&1 &
  SERVER_PIDS+=("$!")
  if [[ "$demo" == portal ]]; then
    printf '%-28s http://localhost:%s/\n' 'Plain portal (original)' "$port"
    printf '%-28s http://localhost:%s/portal/\n' 'Preview portal (new)' "$port"
  else
    printf '%-28s http://localhost:%s\n' "$demo" "$port"
  fi
done
printf '\nPortal summary:\n'
printf '  Plain, original portal: http://localhost:%s/\n' "$PORTAL_PORT"
printf '    Simple gallery; cards link directly to the demo apps.\n'
printf '  New preview portal:    http://localhost:%s/portal/\n' "$PORTAL_PORT"
printf '    Cards open descriptions and in-page YouTube previews.\n'
printf '    Demo titles and Open demo links launch apps in a new tab.\n'
printf '\nPress Ctrl+C to stop all %s demos and the portal server.\n\n' "${#DEMOS[@]}"

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

# Both portal pages share BASE_PORT: / and /portal/.
# Demo titles and Open demo links use the assigned BASE_PORT + offset.
# Ctrl+C stops all demos and the single portal server.
