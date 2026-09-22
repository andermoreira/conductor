#!/bin/sh
set -u

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
state_root=${CONDUCTOR_DOGFOOD_ROOT:-"$(mktemp -d "${TMPDIR:-/tmp}/conductor-dogfood.XXXXXX")"}
fixture_root="$state_root/fixture"

if [ ! -f "$repo_root/dist/index.js" ]; then
  echo "Build Conductor first with: npm run build" >&2
  exit 1
fi

mkdir -p "$fixture_root"
git init -b main "$fixture_root" >/dev/null
git -C "$fixture_root" config user.email conductor-fixture@example.invalid
git -C "$fixture_root" config user.name "Conductor Fixture"
git -C "$fixture_root" commit --allow-empty -m "chore: initialize fixture repository" >/dev/null

echo "Dogfooding state: $state_root"
node "$repo_root/dist/index.js" doctor --verbose
doctor_status=$?

CONDUCTOR_HOME="$state_root/state" node "$repo_root/dist/index.js" run feature \
  "Create a short README explaining this fixture." \
  --repo "$fixture_root" \
  --config "$repo_root"
run_status=$?

echo "Fixture: $fixture_root"
echo "Run evidence and worktrees, if created: $state_root/state"

if [ "$run_status" -ne 0 ]; then
  exit "$run_status"
fi

exit "$doctor_status"
