#!/usr/bin/env bash
# Idempotent: start the Hourly server on its port if nothing listens there.
# On the private preview chain it also restarts the local validator (ledger kept).
# Port checks only, never pgrep/pkill.
set -euo pipefail
ROOT="/home/mehdi_quantum3labs_com/compute-options"
APP_DIR="$ROOT/app"
set -a; . "$APP_DIR/.env"; set +a
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
export PATH="/home/mehdi_quantum3labs_com/.local/share/solana/install/active_release/bin:/usr/local/bin:/usr/bin:/bin"
if [ "${CLUSTER}" = "localnet" ] && ! ss -ltn | grep -q ":18899 "; then
  # --limit-ledger-size: an unbounded ledger reached 135 GB and froze the chain (2026-10-28).
  # The memory-capped scope: the validator grew to ~28 GB RSS with no swap and froze the whole VM.
  # Past MemoryMax only the validator is killed; this cron script restarts it (ledger kept).
  mkdir -p "$ROOT/preview-ledger"
  cd "$ROOT/preview-ledger"
  setsid systemd-run --user --scope --quiet -p MemoryHigh=10G -p MemoryMax=12G -p MemorySwapMax=0 solana-test-validator --ledger "$ROOT/preview-ledger" --quiet --limit-ledger-size 50000000 --rpc-port 18899 --faucet-port 19900 \
    --gossip-port 18000 --dynamic-port-range 18001-18040 >> "$ROOT/validator.log" 2>&1 < /dev/null &
  sleep 12
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] started preview validator" >> "$APP_DIR/app.log"
fi
if ss -ltn | grep -q ":${PORT} "; then exit 0; fi
cd "$APP_DIR"
setsid /usr/bin/env node "$APP_DIR/server.js" >> "$APP_DIR/app.log" 2>&1 < /dev/null &
sleep 0.5
echo "[$(date '+%Y-%m-%d %H:%M:%S')] started hourly on :${PORT} (${CLUSTER})" >> "$APP_DIR/app.log"
