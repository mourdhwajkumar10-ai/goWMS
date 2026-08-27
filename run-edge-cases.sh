#!/bin/bash
cd /Users/yudhistherkumar/Downloads/goWMS
/tmp/gowms-server > /tmp/gowms.log 2>&1 &
SERVER_PID=$!
echo "Server started with PID $SERVER_PID"
for i in $(seq 1 10); do
  if curl -s -o /dev/null -w "" http://127.0.0.1:8080/login 2>/dev/null; then
    echo "Server ready after ${i}s"
    break
  fi
  sleep 1
done
cd /Users/yudhistherkumar/Downloads/goWMS
npx tsx e2e-edge-cases.ts 2>&1
TEST_EXIT=$?
kill $SERVER_PID 2>/dev/null
echo "Server stopped"
exit $TEST_EXIT
