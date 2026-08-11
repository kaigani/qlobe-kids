#!/bin/zsh
set -e

GAME_DIR="${0:A:h}"
REPO_DIR="${GAME_DIR:h:h}"
EDITOR_PORT="${QLOBE_LAYOUT_EDITOR_PORT:-8127}"
EDITOR_URL="http://127.0.0.1:${EDITOR_PORT}/games/letter-treasure-hunt/tools/layout-editor.html"

cd "$REPO_DIR"

if curl -s --max-time 1 "http://127.0.0.1:${EDITOR_PORT}/api/studio/status" >/dev/null; then
  open "$EDITOR_URL"
  print "Opened Letter Treasure Hunt in the authoring server already running on port ${EDITOR_PORT}."
  exit 0
fi

python3 tools/puppet-studio-server.py --host 127.0.0.1 --port "$EDITOR_PORT" &
EDITOR_SERVER_PID=$!

cleanup() {
  kill "$EDITOR_SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for attempt in {1..50}; do
  if curl -s --max-time 1 "http://127.0.0.1:${EDITOR_PORT}/api/studio/status" >/dev/null; then
    open "$EDITOR_URL"
    print "Letter Treasure Hunt layout editor: $EDITOR_URL"
    print "Keep this window open while editing. Press Control-C to stop the server."
    wait "$EDITOR_SERVER_PID"
    exit 0
  fi
  sleep 0.1
done

print -u2 "The layout editor server did not start on port ${EDITOR_PORT}."
exit 1
