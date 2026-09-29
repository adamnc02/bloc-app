#!/usr/bin/env bash
# Copies exactly the files in scripts/publish-files.txt into the Pages artifact
# directory (default _site), byte for byte. Fails if any is missing, so a
# renamed file can never publish a site without it. TECHNICAL §121.
# A line `src/ => dest/` copies every git-tracked file under src/ to dest/
# (BLOC Coach's build, coach/dist/ => coach/, §139); untracked files never go.
set -euo pipefail
out="${1:-_site}"
list="$(dirname "$0")/publish-files.txt"
rm -rf "$out" && mkdir -p "$out"
n=0
while IFS= read -r line || [ -n "$line" ]; do
  f="${line%%#*}"; f="$(echo "$f" | xargs)"
  [ -z "$f" ] && continue
  if [[ "$f" == *" => "* ]]; then
    src="${f%% => *}"; dest="${f##* => }"
    m=0
    while IFS= read -r -d '' t; do
      rel="${t#"$src"}"
      mkdir -p "$out/$dest$(dirname "$rel")"
      cp -p "$t" "$out/$dest$rel"
      cmp -s "$t" "$out/$dest$rel" || { echo "::error::'$t' changed while copying"; exit 1; }
      m=$((m + 1))
    done < <(git ls-files -z -- "$src")
    [ "$m" -gt 0 ] || { echo "::error::publish list maps '$src', which has no tracked files"; exit 1; }
    n=$((n + m))
    continue
  fi
  if [ ! -f "$f" ]; then echo "::error::publish list names '$f', which does not exist"; exit 1; fi
  mkdir -p "$out/$(dirname "$f")"
  cp -p "$f" "$out/$f"
  cmp -s "$f" "$out/$f" || { echo "::error::'$f' changed while copying"; exit 1; }
  n=$((n + 1))
done < "$list"
echo "Assembled $n files into $out:"
( cd "$out" && find . -type f | sort | sed 's|^\./|  |' )
