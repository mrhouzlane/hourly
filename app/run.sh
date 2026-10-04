#!/usr/bin/env bash
# Idempotent: start the Hourly server on its port if nothing listens there.
# On the private preview chain it also restarts the local validator (ledger kept).
# Port checks only, never pgrep/pkill.
set -euo pipefail
ROOT="/home/mehdi_quantum3labs_com/compute-options"
APP_DIR="$ROOT/app"
set -a; . "$APP_DIR/.env"; set +a
export PATH="/home/mehdi_quantum3labs_com/.local/share/solana/install/active_release/bin:/usr/local/bin:/usr/bin:/bin"
if [ "${CLUSTER}" = "localnet" ] && ! ss -ltn | grep -q ":18899 "; then
  cd "$ROOT/preview-ledger"
  setsid solana-test-validator --ledger "$ROOT/preview-ledger" --quiet --rpc-port 18899 --faucet-port 19900 \
    --gossip-port 18000 --dynamic-port-range 18001-18040 >> "$ROOT/validator.log" 2>&1 < /dev/null &
  sleep 12
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] started preview validator" >> "$APP_DIR/app.log"
fi
if ss -ltn | grep -q ":${PORT} "; then exit 0; fi
cd "$APP_DIR"
setsid /usr/bin/env node "$APP_DIR/server.js" >> "$APP_DIR/app.log" 2>&1 < /dev/null &
sleep 0.5
echo "[$(date '+%Y-%m-%d %H:%M:%S')] started hourly on :${PORT} (${CLUSTER})" >> "$APP_DIR/app.log"
