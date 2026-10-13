#!/bin/sh
# Loads config (notably TOKEN) from an env file, then runs chrome-fetch.
#
# launchd and systemd units start a job with no shell profile and usually no
# secrets manager on PATH, so the token can't be fetched at start time the
# way an interactive shell could. Keep it in a small env file instead (mode
# 600, outside the repo) and point this wrapper at it.
#
#   ENV_FILE=/path/to/env bin/launchd-run.sh
#
# Defaults to ~/.config/chrome-fetch/env.
set -eu
dir=$(cd "$(dirname "$0")/.." && pwd)
env_file="${ENV_FILE:-$HOME/.config/chrome-fetch/env}"
if [ -f "$env_file" ]; then
  set -a
  # shellcheck source=/dev/null
  . "$env_file"
  set +a
fi
exec node "$dir/bin/chrome-fetch.mjs"
