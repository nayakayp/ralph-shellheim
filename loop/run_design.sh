#!/bin/bash
set -e

# Ralph Wiggum Loop for Amp
# Usage: ./run_design.sh [max_iterations]

cd "$(dirname "$0")/.." || exit 1

MAX_ITERATIONS=${1:-10}

echo "🚀 Starting Ralph loop (max $MAX_ITERATIONS iterations)..."

for i in $(seq 1 "$MAX_ITERATIONS"); do
  echo "═══ Iteration $i of $MAX_ITERATIONS ═══"

  OUTPUT=$(cat loop/LOOP_DESIGN.md \
    | amp --dangerously-allow-all 2>&1 \
    | tee /dev/stderr) || true

  if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
    echo "✅ Project complete!"
    exit 0
  fi

  sleep 2
done

echo "⚠️ Max iterations reached ($MAX_ITERATIONS)"
exit 1
