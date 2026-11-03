#!/usr/bin/env bash
# Put back the previous hourly-devnet build (~/hourly-devnet, branch devnet-copy) on port 7992.
set -eu
PID=$(ss -ltnp | grep ':7992 ' | grep -oE 'pid=[0-9]+' | cut -d= -f2 || true)
if [ -n "$PID" ]; then kill "$PID"; sleep 1; fi
cd /home/mehdi_quantum3labs_com/hourly-devnet/app
CLUSTER=devnet RPC_URL=https://api.devnet.solana.com PORT=7992 KEEPER=off \
  STATE_FILE=/home/mehdi_quantum3labs_com/compute-options/app/state/devnet.json KEYS_DIR=/home/mehdi_quantum3labs_com/compute-options/keys \
  setsid nohup node server.js >> /home/mehdi_quantum3labs_com/hourly-devnet/devnet-app.log 2>&1 < /dev/null &
sleep 6
curl -s http://127.0.0.1:7992/api/status | head -c 160; echo
