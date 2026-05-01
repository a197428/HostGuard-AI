#!/usr/bin/env bash
# =============================================================================
# HostGuard AI — Set Production Secrets
# =============================================================================
# Usage:
#   chmod +x scripts/set-secrets.sh
#   ./scripts/set-secrets.sh
#
# For each secret, you will be prompted to enter the value.
# Press Enter to skip a secret (leave it unchanged).
# =============================================================================

set -euo pipefail

ENV="${1:-production}"
echo "🔐 Setting secrets for environment: $ENV"
echo ""

SECRETS=(
  "SUPABASE_URL"
  "SUPABASE_SERVICE_KEY"
  "ROUTERAI_API_KEY"
  "ROUTERAI_BASE_URL"
  "OPENROUTER_API_KEY"
  "AI_GATEWAY_BASE_URL"
  "DEEPSEEK_MODEL"
  "UPSTASH_REDIS_URL"
  "UPSTASH_REDIS_TOKEN"
  "TAVILY_API_KEY"
  "TELEGRAM_BOT_TOKEN"
  "OWNER_TELEGRAM_ID"
  "SENTRY_DSN"
  "SENTRY_ENVIRONMENT"
  "SENTRY_RELEASE"
)

for secret in "${SECRETS[@]}"; do
  echo "➡️  $secret"
  read -r -p "  Value (Enter to skip): " value
  if [ -n "$value" ]; then
    echo "$value" | npx wrangler secret put "$secret" --env "$ENV"
    echo "  ✅ $secret set"
  else
    echo "  ⏭️  Skipped"
  fi
  echo ""
done

echo "🎉 All secrets processed!"
