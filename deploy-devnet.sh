#!/usr/bin/env bash
# Serve the clean v3 build (this worktree) at https://hourly-devnet.34-177-105-21.sslip.io/ (port 7992, devnet, keeper off).
# Rollback: ~/hourly-v3/rollback-devnet.sh
# Serves from its own worktree (~/hourly-devnet-frozen) pinned to a commit, so preview builds in ~/hourly-v3/app never reach devnet.
# Usage: deploy-devnet.sh <commit>   (default: design-v3 HEAD)
set -eu
REF=${1:-design-v3}
git -C /home/mehdi_quantum3labs_com/hourly-v3 -C /home/mehdi_quantum3labs_com/hourly-devnet-frozen checkout --detach "$REF"
APP=/home/mehdi_quantum3labs_com/hourly-devnet-frozen/app
STATE=/home/mehdi_quantum3labs_com/hourly-v3/app/state/devnet-live.json
PID=$(ss -ltnp | grep ':7992 ' | grep -oE 'pid=[0-9]+' | cut -d= -f2 || true)
if [ -n "$PID" ]; then kill "$PID"; sleep 1; fi
cd "$APP"
CLUSTER=devnet RPC_URL=https://api.devnet.solana.com CROSSBAR_URL=https://crossbar.switchboard.xyz PORT=7992 KEEPER=off \
  STATE_FILE="$STATE" KEYS_DIR=/home/mehdi_quantum3labs_com/compute-options/keys \
  setsid nohup node server.js >> /home/mehdi_quantum3labs_com/hourly-v3/devnet-live.log 2>&1 < /dev/null &
sleep 6
curl -s http://127.0.0.1:7992/api/status | head -c 160; echo
