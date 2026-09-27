#!/usr/bin/env bash
# Copies exactly the files in scripts/publish-files.txt into the Pages artifact
# directory (default _site), byte for byte. Fails if any is missing, so a
# renamed file can never publish a site without it. TECHNICAL §121.
set -euo pipefail
out="${1:-_site}"
list="$(dirname "$0")/publish-files.txt"
rm -rf "$out" && mkdir -p "$out"
n=0
while IFS= read -r line || [ -n "$line" ]; do
  f="${line%%#*}"; f="$(echo "$f" | xargs)"
  [ -z "$f" ] && continue
  if [ ! -f "$f" ]; then echo "::error::publish list names '$f', which does not exist"; exit 1; fi
  mkdir -p "$out/$(dirname "$f")"
  cp -p "$f" "$out/$f"
  cmp -s "$f" "$out/$f" || { echo "::error::'$f' changed while copying"; exit 1; }
  n=$((n + 1))
done < "$list"
echo "Assembled $n files into $out:"
( cd "$out" && find . -type f | sort | sed 's|^\./|  |' )
