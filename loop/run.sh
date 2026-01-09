#!/bin/bash

# Ralph Wiggum Loop for Amp
# Usage: ./run.sh [max_iterations]

cd "$(dirname "$0")/.." || exit 1

MAX_ITERATIONS=${1:-10}

echo "🔁 Starting Ralph loop (max $MAX_ITERATIONS iterations)..."
echo "   Press Ctrl+C to stop"
echo ""

for i in $(seq 1 "$MAX_ITERATIONS"); do
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📍 Iteration $i of $MAX_ITERATIONS"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    amp -m "$(cat loop/RALPH_INSTRUCTIONS.md)" --print
    
    # Check for completion signal
    if grep -q "PROJECT COMPLETE" loop/CHANGELOG.md 2>/dev/null; then
        echo ""
        echo "✅ Project complete! Stopping loop."
        exit 0
    fi
done

echo ""
echo "🏁 Reached max iterations ($MAX_ITERATIONS)."
