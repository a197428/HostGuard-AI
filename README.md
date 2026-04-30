# HostGuard AI

Autonomous AI agent for monitoring and protecting online reputation of apartment owners and hoteliers.

## Tech Stack

- **Runtime:** Cloudflare Workers (Hono), Agents SDK (Durable Objects)
- **Frontend:** Vue 3 (Composition API) + Tailwind CSS + Pinia
- **Database:** Supabase (PostgreSQL) with RLS
- **Cache:** Upstash Redis
- **LLM:** DeepSeek V3.2 via RouterAI.ru, fallback GPT-4o-mini (OpenRouter)
- **Data Extraction:** Tavily API, fallback Cloudflare Browser Rendering
- **Notifications:** Telegram Bot API (grammY)

## Project Structure

```
src/
├── backend/           # Cloudflare Workers API
├── frontend/         # Vue 3 SPA
└── shared/          # Shared schemas, types, prompts
    ├── schemas.ts   # Zod schemas for all tables & AI responses
    ├── types.ts     # Domain types
    └── prompts.ts    # Prompt Registry
tests/               # Vitest tests
docs/                # Project documentation
```

## Getting Started

```bash
# Install dependencies
npm install

# Run tests
npm run test

# Type check
npm run typecheck

# Lint
npm run lint
```
