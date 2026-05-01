# INFRASTRUCTURE.md – Деплой, CI/CD и инфраструктура

Описание инфраструктуры HostGuard AI: CI/CD пайплайн, процесс деплоя, observability и FinOps.

## 1. Уровни инфраструктуры (Edge-first)

| Уровень | Реализация | Функция |
|---------|------------|---------|
| Edge Layer | Cloudflare WAF + Pages + R2 | Защита от DDoS, кеширование статики, хранение архивов |
| Application Tier | Cloudflare Workers (Hono) | Stateless API + оркестрация через Durable Objects |
| AI Tier | Cloudflare AI Gateway | Единая точка входа для LLM: кеширование, логирование, rate-limiting |
| Data Tier | Supabase + Upstash Redis | Персистентное хранилище и оперативная дедупликация |
| Observability | Sentry + Logpush + AI Gateway Logs | End-to-end видимость от UI до LLM-вызова |

---

## 2. CI/CD Pipeline

### 2.1 Стратегия ветвления

| Элемент | Правило |
|---------|---------|
| `main` | Всегда стабилен, прямые коммиты запрещены |
| `dev` | Рабочая ветка, активная разработка |
| Feature branches | `feat/...`, `fix/...`, короткоживущие |
| Feature Flags | Включение фич через таблицу `feature_flags` в Supabase |
| Versioning | Semantic Versioning + CHANGELOG.md из conventional commits |

### 2.2 CI Pipeline (GitHub Actions)

| Шаг | Описание | Инструменты | SLA |
|-----|----------|-------------|-----|
| Lint & Format | Единая конфигурация для фронтенда и Workers | ESLint + Prettier | < 1 мин |
| Type Check | Strict mode для всего монорепо | `tsc --noEmit` | < 2 мин |
| Unit & Integration | Бизнес-логика + Workers эмуляция | Vitest + Miniflare | < 5 мин |
| Security Scan | Зависимости и секреты в истории | Trivy + Gitleaks | < 3 мин |
| AI Eval Suite | Прогон Golden Set (50 кейсов) и gate по Faithfulness/Safety | Vitest + Mock LLM | < 10 мин |
| Build | Сборка фронтенда, валидация Workers | Vite + Wrangler | < 5 мин |

### 2.2.1 CI Gate

Последовательность в GitHub Actions фиксирована:

1. `Lint`
2. `TypeCheck`
3. `Vitest`
4. `AI Eval Suite`
5. `Deploy to Cloudflare`

Production deploy блокируется, если `Faithfulness < 0.85` или `Safety < 0.95`.

### 2.3 CD Pipeline

```
Merge в main → Staging Deploy → Manual Approval → Canary → Production
```

| Шаг | Описание | Автоматизация |
|-----|----------|---------------|
| 1. Staging Deploy | Автоматический деплой в Cloudflare Pages Preview | После merge в main |
| 2. Manual Approval | Переход на production требует approve | Ручной триггер |
| 3. Progressive Rollout | Canary 5% → 25% → 100% с мониторингом ошибок | Автоматически |
| 4. Auto-rollback | Откат при ошибках > 1% или падении Scrape Success Rate | Автоматически |
| 5. DB Migrations | Миграции Supabase до деплоя кода, обратная совместимость | Отдельный шаг |

---

## 3. Деплой

### 3.1 Окружения

| Окружение | Конфигурация | Переменные |
|-----------|--------------|------------|
| `local` | Miniflare эмуляция Workers | `.dev.vars` |
| `staging` | Cloudflare Workers Preview | `wrangler secrets --env staging` |
| `production` | Cloudflare Workers | `wrangler secrets --env production` |

Конфигурация всех окружений **идентична**, различаются только переменные и лимиты.

### 3.2 Команды деплоя

```bash
# Frontend (Cloudflare Pages)
cd frontend
npm run build
npx wrangler pages deploy dist

# Backend (Workers)
npx wrangler deploy                    # production
npx wrangler deploy --env staging      # staging
```

### 3.3 Secrets Management

Все ключи хранятся в `wrangler secrets`:

| Secret | Назначение |
|--------|------------|
| `TAVILY_API_KEY` | Tavily API |
| `OPENROUTER_API_KEY` | OpenRouter для DeepSeek |
| `SUPABASE_URL` | URL инстанса Supabase |
| `SUPABASE_SERVICE_KEY` | Сервисный ключ (только Workers) |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot |
| `UPSTASH_REDIS_URL` | URL Redis |
| `UPSTASH_REDIS_TOKEN` | Токен Redis |
| `SENTRY_DSN` | Sentry |

---

## 4. Infrastructure as Code

### Terraform / OpenTofu

Описание ресурсов Cloudflare:
- Workers (Hono API)
- AI Gateway
- Pages (хостинг фронтенда)
- R2 (архивы, бэкапы)
- KV (если потребуется)

### Supabase Migrations

SQL-миграции в репозитории:
- Версионируются (`001_init.sql`, `002_add_feature_flags.sql`)
- Обратимая совместимость (каждая миграция с `down` скриптом)
- Запускаются отдельным шагом в CI до деплоя кода

---

## 5. Observability

### 5.1 Логи

| Параметр | Значение |
|----------|----------|
| Формат | Структурированный JSON |
| Контекст | `trace_id`, `owner_id`, `property_id` |
| Безопасность | PII и секреты фильтруются middleware |
| Горячие логи | Cloudflare Logpush, 14 дней |
| Архив | R2, 90 дней |
| Audit Log | Supabase `llm_calls`, 12 месяцев |

### 5.1.1 Sentry и AI Gateway

- Ошибки Workers и orchestration-кода отправляются в Sentry, если задан `SENTRY_DSN`.
- LLM-запросы проходят с заголовками `cf-aig-collect-log` и `cf-aig-collect-log-payload: false`, чтобы сохранять метаданные в AI Gateway без утечки PII.
- `trace_id` синхронизируется между структурированными логами, Sentry и LLM-аудитом.

### 5.2 Метрики (RED + USE)

**RED (Rate, Errors, Duration):**

| Сервис | Ключевые SLO |
|--------|--------------|
| Scraper | Scrape Success Rate ≥ 95% |
| API | p95 < 800 мс |
| Telegram Bot | Доставка < 5 сек |
| LLM Calls | Генерация черновика < 2 мин |

**USE (Utilization, Saturation, Errors):**

| Ресурс | Метрики |
|--------|---------|
| Workers | CPU Time |
| Supabase | Коннекты к БД |
| Redis | Команды/сек, лимиты |

### 5.3 Трассировка

- **Инструмент:** OpenTelemetry, экспорт через AI Gateway
- **Каждый LLM-вызов:** span с атрибутами (model, tokens, latency, prompt_id, prompt_version)
- **Корреляция:** трассы связаны с HTTP-запросами из дашборда через `trace_id`

### 5.4 AI-Specific Observability

| Метрика | Описание | Инструмент |
|---------|----------|------------|
| Hallucination Rate | Доля апелляций без валидных ссылок | Legal Guard (Этап 07) |
| Cost Monitoring | Затраты по моделям и tenant'ам | AI Gateway |
| Feedback Loop | Реакции владельца (одобрить/доработать/отклонить) | Telegram |
| Prompt Drift | Кластеризация эмбеддингов отзывов | AI Gateway |

### 5.5 SLO и Error Budgets

| Метрика | Цель | Бюджет |
|---------|------|--------|
| Доступность мониторинга | 99.9% | 43 мин простоя/мес |
| p95 API дашборда | < 800 мс | – |
| p95 генерации апелляции | < 90 сек | – |

При исчерпании error budget → заморозка выпуска фич до восстановления.

### 5.6 Алертинг

- Симптомы: «нет уведомлений > 3 часов», падение Success Rate < 80%
- Каждый алерт содержит ссылку на Runbook
- Blameless post-mortems после инцидентов, результаты фиксируются в ADR

---

## 6. Масштабирование

| Компонент | Механизм | Предел |
|-----------|----------|--------|
| Workers | Horizontal (300+ дата-центров) | Сотни тысяч клиентов |
| AI Inference | OpenRouter балансирует провайдеров | Together AI, Fireworks |
| Supabase | Вертикальное до 16 vCPU | read-replicas в v2 |
| Redis | Pay-per-request автошкалирование | – |

---

## 7. FinOps и контроль затрат

| Механизм | Эффект |
|----------|--------|
| Semantic Cache (AI Gateway) | Экономия 20–30% токенов |
| DeepSeek V3.2 как основная модель | $0.27/M input, $1.10/M output |
| Бюджеты в OpenRouter (per-key) | Алерт при 80% месячного лимита |
| Per-tenant Cost Tracking | Audit Log в Supabase |

### Целевые показатели стоимости (MVP, 1 клиент)

| Статья | Лимит |
|--------|-------|
| Общая стоимость | < $15/мес |
| 1 апелляция (LLM) | < $0.005 |
| Tavily API | Pro тариф $30/мес (при >10 клиентах) |

---

## 8. Backup и Disaster Recovery

| Механизм | Параметры |
|----------|-----------|
| PITR (Supabase) | RPO < 5 мин, RTO < 30 мин |
| Ежедневный экспорт | Supabase → R2, межрегиональная репликация |
| DR-учения | Квартальная проверка восстановления Durable Objects |
| Runbook переключения LLM | < 15 минут |

---

## 9. Контейнеризация (для CI)

Несмотря на serverless в production, контейнеризация используется для:
- Стандартизации dev-окружения
- Интеграционных тестов в CI (Miniflare/Wrangler + Playwright)

```dockerfile
# Multi-stage Dockerfile
FROM node:20-slim AS base
USER node
WORKDIR /app

# Healthcheck
HEALTHCHECK --interval=30s CMD curl -f http://localhost:8787/healthz || exit 1
```

`.dockerignore`: `node_modules`, `.git`, `.env`, `.dev.vars`

---

## Связанные документы
- [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) — полный контекст архитектуры
- [CODING_STANDARDS.md](./CODING_STANDARDS.md) — структура проекта и стиль кода
- [AI_LAYER.md](./AI_LAYER.md) — логика AI-слоя
- [ROADMAP.md](./ROADMAP.md) — статус MVP и планы
