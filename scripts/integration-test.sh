#!/usr/bin/env bash
set -euo pipefail

# Integration test script for MaximaCoach
# Run after: docker compose up -d --build

echo "=== MaximaCoach Integration Tests ==="
echo ""

PASS=0
FAIL=0

check() {
  local name="$1"
  local cmd="$2"
  if eval "$cmd" > /dev/null 2>&1; then
    echo "  PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $name"
    FAIL=$((FAIL + 1))
  fi
}

echo "1. Service Health Checks"
check "API health endpoint" "curl -sf http://localhost:3001/health | grep -q ok"
check "Web frontend loads" "curl -sf http://localhost:3000 | grep -q html"

echo ""
echo "2. WebSocket Connectivity"
# Check that voice and coach ports are listening
check "Voice WebSocket port open" "timeout 3 bash -c 'echo > /dev/tcp/localhost/3002'"
check "Coach WebSocket port open" "timeout 3 bash -c 'echo > /dev/tcp/localhost/3003'"

echo ""
echo "3. Rate Limiting"
# Hit persona generation endpoint 11 times quickly to verify rate limiting kicks in
check "Rate limit returns 429" "
  for i in \$(seq 1 11); do
    STATUS=\$(curl -sf -o /dev/null -w '%{http_code}' -X POST http://localhost:3001/api/personas/generate -H 'Content-Type: application/json' -d '{}')
    if [ \"\$STATUS\" = \"429\" ]; then
      exit 0
    fi
  done
  exit 1
"

echo ""
echo "4. Docker Container Status"
check "All containers running" "docker compose ps --format json | grep -c running | grep -qE '^[45]$'"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
echo "All integration tests passed!"
