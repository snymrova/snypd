#!/bin/sh
# A `gh` that never reaches GitHub — what `SNYPD_GH` points at in the test suite (docs/31 §5 · L5), so
# the backup step is exercised with no account and no network. Every line it prints is gh 2.97.0's own,
# read from its source (`remote.ts` header): `auth status`'s prose on stdout, and — the branch that
# matters — `repo create --source` printing *the repository URL alone* when there is no terminal, and
# adding the remote itself with `git remote add`.
#
# State lives in `$STUB_STATE` (a directory): `loggedin` marks a machine GitHub has seen, `calls`
# records every invocation, one argv per line. `STUB_SCOPES` is the token's scope list (default has
# both `repo` and `workflow`); `STUB_CREATE` picks the create's outcome:
#   ok (default) · taken (the name is already on the account) · noremote (created, remote add silently
#   did not happen — the one case that must not report success)
set -e
: "${STUB_STATE:?STUB_STATE must name a directory}"
mkdir -p "$STUB_STATE"
printf '%s\n' "$*" >> "$STUB_STATE/calls"
case "$1$2" in
  --version*) echo "gh version 2.97.0 (2026-07-31)" ;;
  authstatus)
    if [ -f "$STUB_STATE/loggedin" ]; then
      echo "github.com"
      echo "  ✓ Logged in to github.com account stubby (keyring)"
      echo "  - Active account: true"
      echo "  - Git operations protocol: https"
      echo "  - Token: gho_************************************"
      echo "  - Token scopes: ${STUB_SCOPES:-'gist', 'read:org', 'repo', 'workflow'}"
    else
      echo "You are not logged into any GitHub hosts. To get started with GitHub CLI, please run:  gh auth login" >&2
      exit 1
    fi ;;
  repocreate)
    [ -f "$STUB_STATE/loggedin" ] || { echo "gh: To get started with GitHub CLI, please run:  gh auth login" >&2; exit 4; }
    name=$3
    if [ "${STUB_CREATE:-ok}" = taken ]; then
      echo "GraphQL: Name already exists on this account (createRepository)" >&2; exit 1
    fi
    # No terminal, so the URL is the whole of stdout — create.go's `else` branch of `isTTY`.
    echo "https://github.com/stubby/$name"
    if [ "${STUB_CREATE:-ok}" != noremote ]; then
      # A bare repo on disk standing in for the one on GitHub, so the push that follows is a real push
      # and a test can read back which branches actually landed — the only way to prove that
      # `snypd/drafts` stayed home.
      git init -q --bare "$STUB_STATE/$name.git"
      git remote add origin "$STUB_STATE/$name.git"
    fi ;;
  *) echo "stub: unknown command $*" >&2; exit 2 ;;
esac
