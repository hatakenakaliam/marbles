#!/bin/sh
# Builds and publishes dist/ to the gh-pages branch. Hashed files from earlier builds are
# kept, so a device holding an older page can still load everything it refers to.
set -e
cd "$(dirname "$0")/.."
REPO=$(git remote get-url origin)
npm run build
OUT=$(mktemp -d)
git clone -q --depth 1 --branch gh-pages "$REPO" "$OUT/old" 2>/dev/null || mkdir -p "$OUT/old/assets"
mkdir -p "$OUT/new"
cp -R dist/. "$OUT/new"
cp -n "$OUT"/old/assets/* "$OUT/new/assets/" 2>/dev/null || true
[ -d "$1" ] && cp -n "$1"/* "$OUT/new/assets/" 2>/dev/null || true
touch "$OUT/new/.nojekyll"
cd "$OUT/new"
git init -q -b gh-pages
git add -A
git commit -q -m "Deploy"
git push -q -f "$REPO" gh-pages
