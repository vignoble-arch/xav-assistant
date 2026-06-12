#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

BUNDLED_NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe"

if [ -f "$BUNDLED_NODE" ]; then
  NODE_EXE="$BUNDLED_NODE"
elif command -v node >/dev/null 2>&1; then
  NODE_EXE="node"
else
  echo "Node.js est introuvable. Installe Node.js ou lance depuis Codex."
  exit 1
fi

echo "Assistant Xavier : http://127.0.0.1:4173"
echo "Garde cette fenetre ouverte pendant que tu utilises l'app."
"$NODE_EXE" server.js
