#!/usr/bin/env bash
# =============================================================================
# HostGuard AI — Set Production Secrets for Cloudflare Workers
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
  # Supabase
  "SUPABASE_URL"
  "SUPABASE_SERVICE_KEY"

  # LLM Providers
  "ROUTERAI_API_KEY"
  "ROUTERAI_BASE_URL"
  "OPENROUTER_API_KEY"
  "AI_GATEWAY_BASE_URL"
  "DEEPSEEK_MODEL"

  # Cache / Memory
  "UPSTASH_REDIS_URL"
  "UPSTASH_REDIS_TOKEN"

  # Data Extraction
  "TAVILY_API_KEY"

  # Notifications
  "TELEGRAM_BOT_TOKEN"
  "OWNER_TELEGRAM_ID"

  # Monitoring
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
