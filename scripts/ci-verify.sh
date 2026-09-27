#!/usr/bin/env bash
# The full verify sweep, strict — the same loop the app-session skill runs by
# hand (TECHNICAL §121). A non-zero exit, a ✗, a line starting FAIL, or
# "Error:" fails it, and the number of scripts run must equal the number on
# disk. 🚨 The glob is verify*.mjs with NO hyphen.
set -uo pipefail
export TZ=Europe/London
ran=0; failed=0
for f in scripts/verify*.mjs; do
  ran=$((ran + 1))
  out="$(node "$f" 2>&1)"; rc=$?
  if [ $rc -ne 0 ] || grep -qE "✗|^FAIL|Error:" <<<"$out"; then
    failed=$((failed + 1))
    echo "::error::FAIL: $f"
    grep -E "✗|^FAIL|Error:" <<<"$out" | head -10
  else
    echo "✓ $f"
  fi
done
onDisk=$(ls scripts/verify*.mjs | wc -l | tr -d ' ')
echo "Ran $ran of $onDisk verify scripts; $failed failed."
[ "$ran" -eq "$onDisk" ] || { echo "::error::sweep ran $ran scripts but $onDisk exist"; exit 1; }
[ "$ran" -gt 0 ] || { echo "::error::no verify scripts found"; exit 1; }
[ "$failed" -eq 0 ]
