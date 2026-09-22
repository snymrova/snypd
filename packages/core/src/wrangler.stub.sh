#!/bin/sh
# A wrangler that never reaches Cloudflare — what `SNYPD_WRANGLER` points at in the test suite and in
# CI's `onboard.live` bench (docs/31 §5 · L4), so the whole walk to a URL is measured with no account
# and no network. Every line it prints is wrangler 4.135.0's own, read from its source (`host.ts`
# header); `parseDeploy` is tested against real output separately, so this stub proves the *flow* —
# login runs when nobody is logged in, the first deploy sets the URL and deploys again — not the parser.
#
# State lives in `$STUB_STATE` (a directory): `loggedin` marks a machine the host has seen, `calls`
# records every invocation, one argv per line. `STUB_DEPLOY` picks the deploy's outcome:
#   ok (default) · nosub (a fresh account with no workers.dev subdomain, non-interactive) · notauth
# `STUB_LOGIN=hang` makes login wait for a click that never comes, for the timeout path.
set -e
: "${STUB_STATE:?STUB_STATE must name a directory}"
mkdir -p "$STUB_STATE"
printf '%s\n' "$*" >> "$STUB_STATE/calls"
case "$1" in
  --version) echo " ⛅️ wrangler 4.135.0" ;;
  whoami)
    if [ -f "$STUB_STATE/loggedin" ]; then
      printf '{"loggedIn":true,"authType":"OAuth Token","email":"stub@example.com","accounts":[{"name":"Stub","id":"a1b2c3"}]}\n'
    else
      printf '{"loggedIn":false}\n'; exit 1
    fi ;;
  login)
    echo "Attempting to login via OAuth..."
    echo "Opening a link in your default browser: https://dash.cloudflare.com/oauth2/auth?stub=1"
    if [ "${STUB_LOGIN:-}" = hang ]; then sleep 30; exit 1; fi
    : > "$STUB_STATE/loggedin"
    echo "Successfully logged in." ;;
  deploy)
    echo " ⛅️ wrangler 4.135.0"
    echo "───────────────────"
    if [ ! -f "$STUB_STATE/loggedin" ] || [ "${STUB_DEPLOY:-ok}" = notauth ]; then
      echo "✘ [ERROR] You are not authenticated. Please run \`wrangler login\`." >&2; exit 1
    fi
    [ -d dist ] || { echo "✘ [ERROR] The directory specified by the \"assets.directory\" field in your configuration file does not exist: ./dist" >&2; exit 1; }
    n=$(find dist -type f | wc -l | tr -d ' ')
    echo "🌀 Building list of assets..."
    echo "✨ Read $n files from the assets directory $PWD/dist"
    if [ "${STUB_DEPLOY:-ok}" = nosub ]; then
      echo "▲ [WARNING] You need to register a workers.dev subdomain before publishing to workers.dev" >&2
      echo "? Would you like to register a workers.dev subdomain now? › (Y/n) · No" >&2
      printf '✘ [ERROR] You can either deploy your worker to one or more routes by specifying them in your wrangler.toml file, or register a workers.dev subdomain here:\nhttps://dash.cloudflare.com/a1b2c3/workers/onboarding\n' >&2
      exit 1
    fi
    name=$(sed -n 's/^name = "\(.*\)"/\1/p' wrangler.toml | head -1)
    echo "✨ Success! Uploaded $n files (0.42 sec)"
    echo ""
    echo "Total Upload: 0.23 KiB / gzip: 0.17 KiB"
    echo "Uploaded $name (1.10 sec)"
    echo "Deployed $name triggers (0.31 sec)"
    echo "  https://$name.stub.workers.dev"
    echo "Current Version ID: 00000000-0000-4000-8000-000000000001" ;;
  *) echo "stub: unknown command $1" >&2; exit 2 ;;
esac
