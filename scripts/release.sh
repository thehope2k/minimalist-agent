#!/usr/bin/env bash
# Cut a new release. Bumps package.json version, commits, tags, and pushes.
# GitHub Actions takes over from there: it runs the matrix build and uploads
# artifacts + latest-*.yml manifests to the GitHub Release.
#
# Usage:
#   scripts/release.sh patch     # 0.1.0 -> 0.1.1
#   scripts/release.sh minor     # 0.1.0 -> 0.2.0
#   scripts/release.sh major     # 0.1.0 -> 1.0.0
#   scripts/release.sh 0.3.7     # explicit version
set -euo pipefail

cd "$(dirname "$0")/.."

BUMP="${1:-patch}"

# Working tree must be clean — auto-update artifacts must match a known commit.
if [[ -n "$(git status --porcelain)" ]]; then
  echo "✗ Working tree is dirty. Commit or stash first." >&2
  git status --short >&2
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "main" && "$BRANCH" != "master" ]]; then
  read -r -p "You are on branch '$BRANCH', not main. Continue? [y/N] " ans
  [[ "$ans" == "y" || "$ans" == "Y" ]] || exit 1
fi

# Quick sanity check before tagging.
echo "→ Running typecheck…"
npm run typecheck

# npm version handles bump+commit+tag in one go (and refuses to overwrite).
echo "→ Bumping version ($BUMP)…"
NEW_VERSION="$(npm version "$BUMP" -m "release: v%s")"

echo "→ Pushing commit + tag $NEW_VERSION…"
git push
git push --tags

echo
echo "✓ Pushed $NEW_VERSION."
echo "  GitHub Actions is now building macOS/Windows/Linux artifacts."
echo "  Watch: https://github.com/thehope2k/minimalist-agent/actions"
echo "  When the workflow finishes, publish the draft release at:"
echo "  https://github.com/thehope2k/minimalist-agent/releases"
