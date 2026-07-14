#!/usr/bin/env bash
#
# One-shot Twilio setup for Scaliyo in-app calling. Creates an API key + a TwiML
# App (Voice URL → twilio-voice), points your number's inbound webhook at
# twilio-incoming, and stores every value as a Supabase secret. Run it in YOUR
# terminal so no credential passes through chat.
#
# Usage:
#   export TW_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx   # Twilio Account SID
#   export TW_TOKEN=your_twilio_auth_token             # Twilio Auth Token
#   export TW_NUMBER=+15551234567                      # your Voice-capable Twilio number (E.164)
#   bash setup-twilio.sh
#
# Requires: curl, python3, and the supabase CLI (logged in).
# Idempotent-ish: re-running creates a fresh API key + TwiML App (old ones remain
# in your Twilio console until you delete them).

set -euo pipefail

: "${TW_SID:?Set TW_SID to your Twilio Account SID (AC...)}"
: "${TW_TOKEN:?Set TW_TOKEN to your Twilio Auth Token}"
: "${TW_NUMBER:?Set TW_NUMBER to your Twilio number in E.164, e.g. +15551234567}"

PROJECT_REF="utvydxqiqedaaxmmpfpf"
FN_BASE="https://${PROJECT_REF}.supabase.co/functions/v1"
API="https://api.twilio.com/2010-04-01/Accounts/${TW_SID}"

# Extract a top-level string field from a JSON blob on stdin.
jget() { python3 -c "import sys,json;print(json.load(sys.stdin).get('$1',''))"; }

echo "→ [1/4] Creating a Twilio API Key…"
KEY_JSON=$(curl -sf -X POST "$API/Keys.json" -u "$TW_SID:$TW_TOKEN" \
  --data-urlencode "FriendlyName=Scaliyo Voice") || { echo "  ✗ API key creation failed (check TW_SID/TW_TOKEN)"; exit 1; }
API_KEY_SID=$(echo "$KEY_JSON" | jget sid)
API_KEY_SECRET=$(echo "$KEY_JSON" | jget secret)
[ -n "$API_KEY_SID" ] && [ -n "$API_KEY_SECRET" ] || { echo "  ✗ Unexpected response: $KEY_JSON"; exit 1; }
echo "  ✓ API Key $API_KEY_SID"

echo "→ [2/4] Creating a TwiML App (outbound Voice URL → twilio-voice)…"
APP_JSON=$(curl -sf -X POST "$API/Applications.json" -u "$TW_SID:$TW_TOKEN" \
  --data-urlencode "FriendlyName=Scaliyo Voice" \
  --data-urlencode "VoiceUrl=$FN_BASE/twilio-voice" \
  --data-urlencode "VoiceMethod=POST") || { echo "  ✗ TwiML App creation failed"; exit 1; }
APP_SID=$(echo "$APP_JSON" | jget sid)
[ -n "$APP_SID" ] || { echo "  ✗ Unexpected response: $APP_JSON"; exit 1; }
echo "  ✓ TwiML App $APP_SID"

echo "→ [3/4] Pointing $TW_NUMBER inbound webhook → twilio-incoming…"
PN_JSON=$(curl -sf -G "$API/IncomingPhoneNumbers.json" -u "$TW_SID:$TW_TOKEN" \
  --data-urlencode "PhoneNumber=$TW_NUMBER") || { echo "  ✗ Number lookup failed"; exit 1; }
PN_SID=$(echo "$PN_JSON" | python3 -c "import sys,json;l=json.load(sys.stdin).get('incoming_phone_numbers',[]);print(l[0]['sid'] if l else '')")
[ -n "$PN_SID" ] || { echo "  ✗ $TW_NUMBER isn't on this account (buy it or check the format)"; exit 1; }
curl -sf -X POST "$API/IncomingPhoneNumbers/$PN_SID.json" -u "$TW_SID:$TW_TOKEN" \
  --data-urlencode "VoiceUrl=$FN_BASE/twilio-incoming" \
  --data-urlencode "VoiceMethod=POST" >/dev/null || { echo "  ✗ Failed to set inbound webhook"; exit 1; }
echo "  ✓ $TW_NUMBER ($PN_SID) inbound → twilio-incoming"

echo "→ [4/4] Writing Supabase secrets…"
supabase secrets set \
  TWILIO_ACCOUNT_SID="$TW_SID" \
  TWILIO_API_KEY_SID="$API_KEY_SID" \
  TWILIO_API_KEY_SECRET="$API_KEY_SECRET" \
  TWILIO_TWIML_APP_SID="$APP_SID" \
  TWILIO_CALLER_ID="$TW_NUMBER" \
  TWILIO_AUTH_TOKEN="$TW_TOKEN" \
  --project-ref "$PROJECT_REF" >/dev/null
echo "  ✓ Secrets set"

echo ""
echo "✅ Twilio calling is live. Open a lead with a phone number and click Call."
echo "   (First call will ask for microphone permission.)"
