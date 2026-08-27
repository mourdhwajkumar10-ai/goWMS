#!/bin/bash
# goWMS Latency Test Script
# Tests API response times from client perspective

BASE_URL="http://34.93.122.213:8080"
RESULTS_FILE="docs/latency_results.md"

echo "# goWMS Latency Test Results" > $RESULTS_FILE
echo "" >> $RESULTS_FILE
echo "**Test Date:** $(date -u +"%Y-%m-%d %H:%M:%S UTC")" >> $RESULTS_FILE
echo "**Target:** $BASE_URL" >> $RESULTS_FILE
echo "" >> $RESULTS_FILE

# Function to test endpoint
test_endpoint() {
    local name=$1
    local method=$2
    local endpoint=$3
    local data=$4
    local auth=$5
    
    echo "Testing: $name..."
    
    if [ -n "$data" ] && [ -n "$auth" ]; then
        result=$(curl -s -o /dev/null -w '%{time_total}|%{time_connect}|%{time_starttransfer}|%{size_download}|%{http_code}' \
            -X $method "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $auth" \
            -d "$data" 2>/dev/null)
    elif [ -n "$auth" ]; then
        result=$(curl -s -o /dev/null -w '%{time_total}|%{time_connect}|%{time_starttransfer}|%{size_download}|%{http_code}' \
            -X $method "$BASE_URL$endpoint" \
            -H "Authorization: Bearer $auth" 2>/dev/null)
    elif [ -n "$data" ]; then
        result=$(curl -s -o /dev/null -w '%{time_total}|%{time_connect}|%{time_starttransfer}|%{size_download}|%{http_code}' \
            -X $method "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data" 2>/dev/null)
    else
        result=$(curl -s -o /dev/null -w '%{time_total}|%{time_connect}|%{time_starttransfer}|%{size_download}|%{http_code}' \
            "$BASE_URL$endpoint" 2>/dev/null)
    fi
    
    IFS='|' read -r total connect ttfb size code <<< "$result"
    
    # Convert to ms
    total_ms=$(echo "$total * 1000" | bc 2>/dev/null || echo "0")
    connect_ms=$(echo "$connect * 1000" | bc 2>/dev/null || echo "0")
    ttfb_ms=$(echo "$ttfb * 1000" | bc 2>/dev/null || echo "0")
    
    echo "| $name | $code | ${total_ms}ms | ${connect_ms}ms | ${ttfb_ms}ms | ${size}B |" >> $RESULTS_FILE
    
    echo "  → Status: $code, Total: ${total_ms}ms, TTFB: ${ttfb_ms}ms"
}

echo "## 1. Static Assets & Health Check" >> $RESULTS_FILE
echo "" >> $RESULTS_FILE
echo "| Endpoint | Status | Total Time | Connect | TTFB | Size |" >> $RESULTS_FILE
echo "|----------|--------|------------|---------|------|------|" >> $RESULTS_FILE

test_endpoint "Health Check" "GET" "/api/health"
test_endpoint "Login Page (HTML)" "GET" "/login"
test_endpoint "Main App (HTML)" "GET" "/"
test_endpoint "CSS Bundle" "GET" "/assets/index-*.css"  # May need exact path
test_endpoint "JS Bundle" "GET" "/assets/index-*.js"   # May need exact path

echo "" >> $RESULTS_FILE
echo "## 2. Authentication Latency" >> $RESULTS_FILE
echo "" >> $RESULTS_FILE
echo "| Endpoint | Status | Total Time | Connect | TTFB | Size |" >> $RESULTS_FILE
echo "|----------|--------|------------|---------|------|------|" >> $RESULTS_FILE

# Login and get token
LOGIN_RESULT=$(curl -s -w '\n%{http_code}' "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"admin123"}' 2>/dev/null)

HTTP_CODE=$(echo "$LOGIN_RESULT" | tail -n1)
RESPONSE=$(echo "$LOGIN_RESULT" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    TOKEN=$(echo "$RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    echo "Token obtained successfully"
    
    test_endpoint "Login (POST)" "POST" "/api/auth/login" '{"username":"admin","password":"admin123"}'
else
    echo "Login failed with code: $HTTP_CODE"
    echo "| Login | $HTTP_CODE | - | - | - | - |" >> $RESULTS_FILE
fi

echo "" >> $RESULTS_FILE
echo "## 3. API Endpoint Latency (Authenticated)" >> $RESULTS_FILE
echo "" >> $RESULTS_FILE
echo "| Endpoint | Status | Total Time | Connect | TTFB | Size |" >> $RESULTS_FILE
echo "|----------|--------|------------|---------|------|------|" >> $RESULTS_FILE

if [ -n "$TOKEN" ]; then
    # Test various API endpoints
    test_endpoint "GRN Sessions" "GET" "/api/grn/sessions" "" "$TOKEN"
    test_endpoint "PO List" "GET" "/api/po/list" "" "$TOKEN"
    test_endpoint "Item List" "GET" "/api/masterdata/items" "" "$TOKEN"
    test_endpoint "Warehouse List" "GET" "/api/masterdata/warehouses" "" "$TOKEN"
    test_endpoint "Putaway Queue" "GET" "/api/putaway/queue" "" "$TOKEN"
    test_endpoint "QI List" "GET" "/api/qi/list" "" "$TOKEN"
    test_endpoint "Pick Lists" "GET" "/api/picking/lists" "" "$TOKEN"
    test_endpoint "Notifications" "GET" "/api/notifications/list" "" "$TOKEN"
    test_endpoint "Analytics Dashboard" "GET" "/api/analytics/dashboard" "" "$TOKEN"
else
    echo "No token available, skipping authenticated tests"
fi

echo "" >> $RESULTS_FILE
echo "## 4. Concurrent Request Test (5 parallel)" >> $RESULTS_FILE
echo "" >> $RESULTS_FILE

if [ -n "$TOKEN" ]; then
    echo "Running 5 parallel requests to /api/grn/sessions..." >> $RESULTS_FILE
    echo '```' >> $RESULTS_FILE
    
    for i in {1..5}; do
        (curl -s -o /dev/null -w "Request $i: %{time_total}s (TTFB: %{time_starttransfer}s)\n" \
            "$BASE_URL/api/grn/sessions" \
            -H "Authorization: Bearer $TOKEN" 2>/dev/null) &
    done
    wait
    
    echo '```' >> $RESULTS_FILE
fi

echo "" >> $RESULTS_FILE
echo "## 5. Latency Summary" >> $RESULTS_FILE
echo "" >> $RESULTS_FILE
echo "### Key Observations" >> $RESULTS_FILE
echo "- **Health Check:** Should be <50ms" >> $RESULTS_FILE
echo "- **Login:** Should be <200ms" >> $RESULTS_FILE
echo "- **API List Endpoints:** Should be <500ms" >> $RESULTS_FILE
echo "- **Static Assets:** Should be <100ms (cached)" >> $RESULTS_FILE
echo "" >> $RESULTS_FILE
echo "### Recommendations" >> $RESULTS_FILE
echo "1. If TTFB >500ms: Check database query performance" >> $RESULTS_FILE
echo "2. If Connect >100ms: Network latency issue (GCP region)" >> $RESULTS_FILE
echo "3. If Total >2s: Full page load unacceptable for warehouse operations" >> $RESULTS_FILE

echo ""
echo "Test complete! Results saved to $RESULTS_FILE"
cat $RESULTS_FILE
