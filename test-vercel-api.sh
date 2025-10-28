#!/bin/bash

# Test Vercel API Deployment
# Usage: ./test-vercel-api.sh YOUR_VERCEL_URL

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if URL provided
if [ -z "$1" ]; then
    echo -e "${RED}Error: Please provide your Vercel URL${NC}"
    echo "Usage: ./test-vercel-api.sh https://your-api.vercel.app"
    exit 1
fi

API_URL="$1"

echo "========================================="
echo "Testing API at: $API_URL"
echo "========================================="
echo ""

# Test 1: Health Check
echo -e "${YELLOW}Test 1: Health Check${NC}"
echo "GET $API_URL/health"
HEALTH=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$API_URL/health")
HTTP_CODE=$(echo "$HEALTH" | grep HTTP_CODE | cut -d':' -f2)
RESPONSE=$(echo "$HEALTH" | sed '/HTTP_CODE/d')

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ PASSED${NC}"
    echo "$RESPONSE" | jq -r '.status, .googleWallet.authenticated'
else
    echo -e "${RED}❌ FAILED (HTTP $HTTP_CODE)${NC}"
    echo "$RESPONSE"
fi
echo ""

# Test 2: Root Endpoint
echo -e "${YELLOW}Test 2: Root Endpoint${NC}"
echo "GET $API_URL/"
ROOT=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$API_URL/")
HTTP_CODE=$(echo "$ROOT" | grep HTTP_CODE | cut -d':' -f2)
RESPONSE=$(echo "$ROOT" | sed '/HTTP_CODE/d')

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ PASSED${NC}"
    echo "$RESPONSE" | jq -r '.service, .version, .status'
else
    echo -e "${RED}❌ FAILED (HTTP $HTTP_CODE)${NC}"
    echo "$RESPONSE"
fi
echo ""

# Test 3: List Classes
echo -e "${YELLOW}Test 3: List Loyalty Classes${NC}"
echo "GET $API_URL/classes"
CLASSES=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$API_URL/classes")
HTTP_CODE=$(echo "$CLASSES" | grep HTTP_CODE | cut -d':' -f2)
RESPONSE=$(echo "$CLASSES" | sed '/HTTP_CODE/d')

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ PASSED${NC}"
    COUNT=$(echo "$RESPONSE" | jq -r '.count')
    echo "Found $COUNT classes"
else
    echo -e "${RED}❌ FAILED (HTTP $HTTP_CODE)${NC}"
    echo "$RESPONSE"
fi
echo ""

# Test 4: Create Card
echo -e "${YELLOW}Test 4: Create Card${NC}"
TIMESTAMP=$(date +%s)
TEST_USER_ID="test_$TIMESTAMP"

echo "POST $API_URL/create-card"
CREATE_CARD=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$API_URL/create-card" \
  -H "Content-Type: application/json" \
  -d "{
    \"classId\": \"3388000000023019052.budzotic3\",
    \"userId\": \"$TEST_USER_ID\",
    \"memberName\": \"Test User $TIMESTAMP\",
    \"points\": 0,
    \"barcodeType\": \"QR_CODE\"
  }")

HTTP_CODE=$(echo "$CREATE_CARD" | grep HTTP_CODE | cut -d':' -f2)
RESPONSE=$(echo "$CREATE_CARD" | sed '/HTTP_CODE/d')

if [ "$HTTP_CODE" = "201" ]; then
    echo -e "${GREEN}✅ PASSED${NC}"
    OBJECT_ID=$(echo "$RESPONSE" | jq -r '.objectId')
    SAVE_URL=$(echo "$RESPONSE" | jq -r '.saveUrl')
    echo "Object ID: $OBJECT_ID"
    echo "Save URL: ${SAVE_URL:0:50}..."

    # Save objectId for next tests
    echo "$OBJECT_ID" > /tmp/test_object_id.txt
else
    echo -e "${RED}❌ FAILED (HTTP $HTTP_CODE)${NC}"
    echo "$RESPONSE"
fi
echo ""

# Test 5: Update Points (if card was created)
if [ -f /tmp/test_object_id.txt ]; then
    OBJECT_ID=$(cat /tmp/test_object_id.txt)

    echo -e "${YELLOW}Test 5: Update Points${NC}"
    echo "POST $API_URL/update-points/$OBJECT_ID"
    UPDATE_POINTS=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$API_URL/update-points/$OBJECT_ID" \
      -H "Content-Type: application/json" \
      -d '{"points": 500}')

    HTTP_CODE=$(echo "$UPDATE_POINTS" | grep HTTP_CODE | cut -d':' -f2)
    RESPONSE=$(echo "$UPDATE_POINTS" | sed '/HTTP_CODE/d')

    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}✅ PASSED${NC}"
        echo "$RESPONSE" | jq -r '.points, .tier'
    else
        echo -e "${RED}❌ FAILED (HTTP $HTTP_CODE)${NC}"
        echo "$RESPONSE"
    fi
    echo ""

    # Test 6: Send Notification
    echo -e "${YELLOW}Test 6: Send Notification${NC}"
    echo "POST $API_URL/send-notification/$OBJECT_ID"
    SEND_NOTIF=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$API_URL/send-notification/$OBJECT_ID" \
      -H "Content-Type: application/json" \
      -d '{"header": "Test Notification", "body": "Your Vercel API is working!"}')

    HTTP_CODE=$(echo "$SEND_NOTIF" | grep HTTP_CODE | cut -d':' -f2)
    RESPONSE=$(echo "$SEND_NOTIF" | sed '/HTTP_CODE/d')

    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}✅ PASSED${NC}"
        echo "$RESPONSE" | jq -r '.message'
    else
        echo -e "${RED}❌ FAILED (HTTP $HTTP_CODE)${NC}"
        echo "$RESPONSE"
    fi
    echo ""
fi

# Summary
echo "========================================="
echo -e "${GREEN}Test Complete!${NC}"
echo "========================================="
echo ""
echo "Your API is deployed and working at:"
echo "$API_URL"
echo ""
echo "Next steps:"
echo "1. Update your frontend to use this URL"
echo "2. Test creating cards from your frontend"
echo "3. Add a card to Google Wallet on your phone"
echo ""
echo "See VERCEL_TESTING_GUIDE.md for more details"
echo ""

# Cleanup
rm -f /tmp/test_object_id.txt
