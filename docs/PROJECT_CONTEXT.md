```markdown
# HostGuard AI – Контекст проекта (PROJECT_CONTEXT.md)

## 1. Общая информация

**Продукт:** HostGuard AI  
**Тип системы:** Автономный AI-агент для мониторинга и защиты онлайн-репутации  
**Целевой сегмент:** Владельцы апартаментов и отельеры посуточной аренды  
**Платформы (MVP):** Avito (раздел «Посуточно»), Островок.ру, Яндекс Путешествия  
**AI-стек:** DeepSeek V3.2 (через OpenRouter) · Cloudflare AI Gateway · Cloudflare Agents SDK  
**Инфраструктура:** Cloudflare Workers · Supabase · Upstash Redis  
**Версия документа:** PRD v2.0 (апрель 2026)  
**Статус:** MVP-спецификация с архитектурой масштабирования

## 2. Цель, проблема и целевой сегмент

### 2.1 Проблема

Владельцы апартаментов узнают о негативных отзывах на агрегаторах с задержкой 24+ часа. Необработанный негатив снижает позицию в выдаче, рейтинг и конверсию. Один негативный отзыв в топ-3 уменьшает заполняемость на 8–15%.

### 2.2 Решение

HostGuard AI непрерывно мониторит карточки объектов на ключевых российских площадках и при обнаружении негативного отзыва:

1. Мгновенно отправляет алерт в Telegram владельцу.
2. Формирует юридически выверенный публичный ответ.
3. При наличии оснований готовит обращение в модерацию площадки на удаление отзыва (по правилам платформы и ГК РФ).

### 2.3 Целевая персона

**Алексей** – владелец 8 апартаментов в центре Москвы. Сдаёт через Avito, Островок.ру, Яндекс Путешествия и Суточно.ру. Один негативный отзыв обходится в 25–40 тыс. ₽ упущенной выручки в месяц. Критично реагировать в первые 1–2 часа.

### 2.4 Функциональные требования (Score MVP)

| Фича         | Описание                                                                    | Критерий приёмки (AC)                                                                                  |
| ------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Мониторинг   | Трекинг карточек объектов по URL на Avito, Островок.ру, Яндекс Путешествиях | Скан с интервалом 1–4 часа; корректный парсинг рейтинга, текста, автора в ≥95% случаев                 |
| Дедупликация | Исключение повторных алертов по одному отзыву                               | Upstash Redis с TTL 90 дней для хешей обработанных отзывов                                             |
| AI-анализ    | Определение тональности и юридической квалификации                          | Классификация Positive/Neutral/Negative + проверка нарушений правил площадки через DeepSeek V3.2       |
| Drafting     | Генерация публичного ответа и черновика жалобы                              | Оба черновика готовы в течение 2 минут после обнаружения отзыва                                        |
| Уведомления  | Доставка алертов в Telegram                                                 | Сообщение содержит текст отзыва, оба черновика и инлайн-кнопки «Скопировать», «Одобрить», «Доработать» |
| Дашборд      | Web-интерфейс управления                                                    | Mobile-first SPA: список объектов, статус мониторинга, история отзывов и апелляций, метрики            |

### 2.5 Нефункциональные требования (NFR)

- **Mobile-first:** LCP < 1.5 сек.
- **Скорость отклика API:** p95 < 800 мс для чтения списка отзывов.
- **Безопасность:** RLS в Supabase + JWT-аутентификация.
- **Доступность:** 99.9% uptime процесса мониторинга.
- **Локализация:** русский язык интерфейса и AI-ответов; поддержка англоязычных отзывов при анализе.

### 2.6 Метрики успеха (KPI)

1. Сокращение медианного времени реакции на отзыв с 24+ часов до < 3 часов.
2. Доля успешно удалённых через апелляцию необоснованных отзывов ≥35%.
3. Retention W1 ≥50% (владелец заходит в дашборд минимум раз в неделю).
4. Scrape Success Rate ≥95%; Hallucination Rate апелляций <5%.

### 2.7 Риски и митигация

- Блокировка парсера → переход с Tavily на Cloudflare Browser Rendering + HITL-разблокировка.
- Галлюцинации AI → только черновик (Human-in-the-Loop), обязательное подтверждение владельца.
- Изменение правил площадок → автоматический мониторинг страниц правил, переобучение Agent Memory раз в квартал.
- Юридические риски → финальная проверка спорных случаев человеком; отказ от агрессивных формулировок.

### 2.8 Out of Scope (MVP)

- Авто-публикация ответов без подтверждения.
- Интеграция с PMS (Bnovo, Realty Calendar, TravelLine) – запланирована на v1.1.
- Поддержка >3 площадок.
- Голосовые/SMS-уведомления – только Telegram.

## 3. Research и Feasibility (PoC)

### 3.1 Стратегия извлечения данных

Гибрид: **Tavily API** (основной, поиск, Markdown) → fallback **Cloudflare Browser Rendering** (динамические страницы, обход защит).

### 3.2 Результаты PoC (30 URL)

- Avito: Tavily, Success Rate 92%
- Островок.ру: Browser Rendering, Success Rate 84%
- Яндекс Путешествия: смешанный, Success Rate 78% (требует доработки)

### 3.3 Расчёт лимитов и стоимости

- При интервале 2 часа, 3 объекта у клиента: 3 240 запросов/мес.
- Tavily бесплатный (1 000 кредитов) – только демо. Production-MVP с 10 клиентами → Tavily Pro ($30/мес) или Cloudflare Browser Rendering (Workers Paid $5/мес + $0.09/час).
- Целевые ограничения: E2E Latency < 5 мин, Cost MVP (1 клиент) < $15/мес, LLM cost 1 апелляция < $0.005.

### 3.4 Build vs Buy vs Open-source

- Извлечение данных: Buy (Tavily) → миграция на Open-source (Crawl4AI) при >50 клиентов.
- БД: Managed (Supabase).
- Кеш: Managed (Upstash Redis).
- AI: Buy (DeepSeek через AI Gateway).

## 4. Архитектурное проектирование (Agentic)

### 4.1 Слоистая архитектура (модульный монолит)

- **Presentation:** Vue 3 дашборд, Telegram Bot, Cloudflare Browser Rendering Live View.
- **API / Gateway:** Cloudflare AI Gateway (унификация LLM-вызовов), Workers (Hono) REST API.
- **Orchestration:** Cloudflare Agents SDK (Durable Objects), класс `ThinkActLoop` (retrieve → analyze → draft → notify).
- **AI/ML Service:** Tavily API, Browser Rendering, DeepSeek V3.2 + GPT-4o-mini fallback.
- **Data Access & Memory:** Cloudflare Agent Memory (долгосрочный контекст), Upstash Redis (дедупликация, rate-limiting).
- **Storage:** Supabase (PostgreSQL), RLS.

### 4.2 Ключевые архитектурные решения (ADR)

| ID      | Решение                                            | Обоснование                                                                                       |
| ------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| ADR-001 | Cloudflare Workers как runtime-платформа           | Cold Start <10 мс, edge-исполнение, нативный Cron, интеграция с AI Gateway, R2, Durable Objects   |
| ADR-002 | Tavily + Browser Rendering как retrieval-стратегия | Скорость + надёжность; деградация на Browser Rendering без изменения вышестоящего кода            |
| ADR-003 | Supabase как primary-хранилище                     | Готовая авторизация, RLS, миграции, pgvector (задел на v2)                                        |
| ADR-004 | Durable Objects вместо stateless-цепочек           | Гарантирует устойчивость многошагового процесса мониторинга при сбоях                             |
| ADR-005 | Human-in-the-Loop как обязательный рейт            | Агент запрашивает помощь человека при капче; без подтверждения владельца публикации нет           |
| ADR-006 | Унификация LLM-вызовов через AI Gateway            | Централизованный контроль качества, кеширование, fallback-маршрутизация, контроль расхода токенов |

### 4.3 Принципы устойчивости и безопасности

- Zero Trust: Cloudflare Access + service tokens.
- Изоляция: промпты выполняются в изолированных Workers.
- HITL: строгий запрет на автоматическую публикацию.

## 5. Дизайн данных и Data Pipeline

### 5.1 Поток данных

1. Ingestion: Tavily API → fallback Browser Rendering.
2. Validation: проверка на капчу/пустые ответы → HITL при блокировке.
3. Transform: извлечение review_id, текста, рейтинга, даты → дедупликация (Redis) → sentiment + юридическая квалификация (DeepSeek).
4. Storage: запись в Supabase с привязкой к owner_id и property_id.

### 5.2 Принципы схемы

- PostgreSQL – единственный источник правды; Redis – эфемерный буфер (TTL 90 дней).
- Иммутабельность событий: отзывы и черновики – append-only.
- Soft Delete: флаг is_deleted, deleted_at.
- Обязательные атрибуты: created_at, updated_at, owner_id во всех бизнес-таблицах.

### 5.3 Управление контекстом и памятью (Agent Memory)

- **Глобальный (Owner):** Tone of Voice, шаблоны приветствий.
- **Локальный (Property):** особенности объекта, типичные жалобы.
- **Тактический (Case):** история успешных/отклонённых апелляций по площадкам.

### 5.4 Безопасность и Privacy

- RLS для tenant-изоляции.
- PII Masking: имя, телефон, email маскируются перед отправкой в LLM.
- Audit Log: полная цепочка событий.
- 152-ФЗ: данные хранятся во Франкфурте, опционально Yandex Cloud для госконтрактов.

## 6. Технологический стек

| Слой             | Технология                                      | Обоснование                              |
| ---------------- | ----------------------------------------------- | ---------------------------------------- |
| Frontend         | Vue 3 (Composition API) + Tailwind CSS          | Экспертиза команды, Mobile-first вёрстка |
| Frontend Hosting | Cloudflare Pages                                | Edge-CDN, интеграция с Workers           |
| Backend API      | Cloudflare Workers (Hono)                       | Cold Start <10 мс                        |
| AI Orchestration | Cloudflare Agents SDK (Durable Objects)         | Durable Execution                        |
| LLM Provider     | DeepSeek V3.2 (RouterAI)                        | Цена/качество для русского языка         |
| LLM Fallback     | GPT-4o-mini (OpenRouter)                        | Активируется через AI Gateway            |
| AI Gateway       | Cloudflare AI Gateway                           | Кеширование, логирование, rate-limiting  |
| Database         | Supabase (PostgreSQL)                           | RLS, Auth, миграции, pgvector            |
| Cache / Memory   | Upstash Redis + Cloudflare Agent Memory         | Дедупликация, контекст отельера          |
| Data Retrieval   | Tavily API + Cloudflare Browser Rendering       | Скорость + надёжность                    |
| Notifications    | Telegram Bot API (grammY)                       | Инлайн-кнопки                            |
| Monitoring       | Sentry + Cloudflare Analytics + AI Gateway Logs | End-to-end observability                 |

### 6.1 AI-специфичные паттерны

- Model Gateway – смена модели через конфиг.
- Prompt Registry – `src/shared/prompts.ts`, версионирование git-тегами.
- Structured Outputs – Zod-схемы, self-healing retry при невалидном выводе.
- Semantic Cache – AI Gateway, экономия токенов 20–30%.

### 6.2 Инструментарий разработки (DX)

- IDE: Cursor + Wrangler CLI.
- Локальный runtime: Miniflare (Workers, Cron, Durable Objects).
- Testing: Vitest (unit/integration), Playwright (E2E).
- Strict mode TypeScript, Sentry для ошибок.

## 7. Backend: оркестрация агента

### 7.1 Структура проекта

src/
index.ts # Точка входа: Cron + HTTP роутер (Hono)
agents/
monitor.ts # Durable Object: процесс мониторинга объекта
legal_analyst.ts # «Юрист-претензионист»
application/
orchestrators.ts # Use Cases: retrieve → analyze → draft → notify
feedback_loop.ts # Обработка реакций владельца из Telegram
infrastructure/
tavily.ts # Клиент Tavily API
browser_rendering.ts # Fallback через Cloudflare Browser
deepseek.ts # Адаптер LLM через AI Gateway
supabase.ts # Работа с БД и RLS
telegram.ts # Telegram Bot (grammY)
redis.ts # Upstash Redis
shared/
prompts.ts # Prompt Registry
schemas.ts # Zod-схемы
types.ts # Доменные типы

### 7.2 Оркестрация многошагового процесса

- Retry Policy: экспоненциальный backoff, 3 попытки.
- Идемпотентность: проверка ключа `review:{platform}:{id}` в Redis.
- Circuit Breaker: ошибка DeepSeek >10% → переключение на GPT-4o-mini.
- Durable Resume: Durable Object state сохраняет прогресс.

### 7.3 AI-специфичные компоненты

- Prompt Registry: версионируемые шаблоны в `src/shared/prompts.ts`.
- Guardrails: Middleware + Zod, self-healing retry.
- Audit Log: таблица `llm_calls` (input_tokens, output_tokens, latency, trace_id, prompt_version).
- Secrets Management: wrangler secrets, только серверные Workers.
- PII маскирование до LLM.
- Feature Flags: таблица `feature_flags` для канареечных промптов.

## 8. AI/ML слой: «Юрист-претензионист»

### 8.1 Системный промпт (Appeal Agent)

- **Role:** специалист по защите репутации в гостиничном бизнесе, знание правил Avito, Островок.ру, Яндекс Путешествий и норм ГК РФ.
- **Task:** анализ отзыва → (а) вежливый публичный ответ, (б) обращение в модерацию при наличии оснований.
- **Алгоритм:**
  1. Проверка факта проживания (противоречия, интеграция с PMS в v1.1).
  2. Поиск нарушений: оскорбления, нецензурная лексика, разглашение ПДн, упоминание конкурентов.
  3. Юридическая квалификация: клевета (ст. 128.1 УК РФ), ущерб деловой репутации (ст. 152 ГК РФ).

### 8.2 Управление памятью (Agent Memory)

- Глобальный уровень: актуальные правила модерации каждой площадки, шаблоны успешных апелляций.
- Локальный уровень: история взаимодействия с конкретным объектом и гостями.

### 8.3 Guardrails (выходной контроль)

- Format Guard: Zod валидация JSON.
- Legal Consistency: проверка наличия ссылок на правила или статьи в `legal_grounds`; отсутствие → retry.
- PII Masking: удаление реальных контактов хоста.
- Toxicity Check: второй проход на пассивно-агрессивные формулировки.

### 8.4 Схема работы AI-слоя

1. Trigger: негативный отзыв (рейтинг <4 или sentiment=negative).
2. Think: извлечение фактов, сопоставление с правилами.
3. Act: формирование пакета (публичный ответ + черновик апелляции + рекомендация).
4. Notify: отправка в Telegram с инлайн-кнопками.
5. Store: сохранение в Supabase для аналитики Success Rate.

### 8.5 Evaluation

- LLM-as-Judge: GPT-4o оценивает апелляции (убедительность, фактологичность).
- HITL-реакции: «Одобрить»/«Доработать»/«Отклонить» формируют датасет.
- Golden Set: 50+ реальных кейсов, прогон на каждой итерации промпта.
- Бизнес-эффект: готовый юридический документ за 30 секунд, доля удовлетворённых апелляций около 35–45%.

## 9. Frontend: Mobile-first дашборд

### 9.1 Стек

- Vue 3 (Composition API) + Tailwind CSS + Pinia + Vite
- Хостинг: Cloudflare Pages, PWA

### 9.2 AI-UX паттерны

- Streaming UI: потоковая генерация текста апелляции.
- Источники и обоснование: блок «Юридическое основание» со ссылками на правила.
- Optimistic Updates: мгновенное изменение статуса с откатом при ошибке.
- Action Confirmation (HITL): явное подтверждение перед публикацией.
- Confidence Indicator: шкала уверенности; при <0.7 предупреждение «Рекомендуется ручная проверка».

### 9.3 Архитектура

- `components/ai/*` – StreamingRenderer, ConfidenceIndicator, SourceCitations
- `components/reviews/*` – ReviewCard, AppealEditor, PublicResponseEditor
- `stores/` – reviewStore, propertyStore, ownerStore
- `views/` – Dashboard, Property

### 9.4 Карточка инцидента

- Sentiment Score, вкладки «Публичный ответ» / «Жалоба в модерацию»
- Smart Editor, Legal Sidebar (цитаты пунктов правил)
- Кнопки: «Скопировать», «Отправить в модерацию», «Запросить доработку», «Отклонить»
- Graceful Degradation: при ошибке генерации – стандартный шаблон ответа

### 9.5 Performance

- LCP < 1.5 сек, skeleton loaders, критический CSS inline
- PWA оффлайн-кеш, Edge Caching, Bundle < 200 KB gzipped

## 10. Безопасность и Compliance

### 10.1 Угрозы OWASP Top-10 для LLM и контрмеры

- Prompt Injection → XML-разметка `<review>`, изоляция в Prompt Registry, явный запрет в system-prompt.
- Model DoS → Rate Limiting в AI Gateway (100 req/min на владельца), кеш в Redis.
- Sensitive Info Disclosure → PII Masking на уровне Worker.
- Excessive Agency → HITL обязателен для всех внешних действий.
- Insecure Output Handling → DOMPurify на фронтенде, Zod-валидация.
- Training Data Poisoning → двухступенчатая модерация фидбека (автоклассификация → ручная проверка).

### 10.2 Защита данных

- RLS Supabase, wrangler secrets, Zod validation на границах, Encryption at rest (Supabase + Redis TLS 1.3).

### 10.3 Compliance (152-ФЗ)

- Обезличивание данных до анализа в LLM.
- Маркировка AI-контента в дашборде.
- Аудит-логи 12 месяцев.
- Согласие на обработку ПДн при регистрации.
- Право на забвение: endpoint удаления данных, TTL 30 дней.

## 11. Тестирование и AI Evaluation

### 11.1 Расширенная пирамида тестирования

- Unit (Vitest): парсеры, валидаторы, бизнес-логика.
- Integration (Miniflare + Wrangler): Workers, Supabase, Redis, AI Gateway.
- Contract (Zod + JSON-Schema): соответствие JSON ответа LLM.
- AI Evaluation (LLM-as-Judge + Golden Set): качество апелляций.
- E2E (Playwright): путь владельца.
- Adversarial (кастомный Red Team Suite): Prompt Injection, Data Leakage, Jailbreaks.

### 11.2 Метрики AI Evaluation

- Faithfulness (обоснованность) ≥0.85
- Answer Relevance ≥0.80
- Format Compliance = 100%
- Safety = 100%
- Legal Accuracy (LLM-as-Judge с эталоном юриста)

### 11.3 Adversarial Testing

- Prompt Injection: «забудь все правила…»
- Data Leakage: раскрытие system prompt или данных других владельцев.
- Cross-tenant изоляция.

### 11.4 CI/CD интеграция

- Анонимизированные/синтетические фикстуры.
- Regression test Golden Set при изменении промптов (блокировка деплоя при Faithfulness <0.85).
- Результаты прогонов сохраняются в Supabase.
- Pre-commit: husky + lint-staged запускают unit/contract тесты.

## 12. DevOps, CI/CD и контейнеризация

### 12.1 Стратегия ветвления и релизов

- Main (always stable, PR only), feature branches (`feat/*`, `fix/*`).
- Feature Flags через `feature_flags` таблицу.
- Semantic Versioning, CHANGELOG.md из conventional commits.

### 12.2 CI Pipeline (GitHub Actions)

- Lint & Format (ESLint + Prettier) <1 мин
- Type Check (`tsc --noEmit` strict) <2 мин
- Unit & Integration (Vitest + Miniflare) <5 мин
- Security Scan (Trivy, gitleaks) <3 мин
- AI Eval Suite (Golden Set) <10 мин
- Build (Vite + Wrangler валидация) <5 мин

### 12.3 CD Pipeline

1. Staging Deploy (Cloudflare Pages Preview) после merge в main.
2. Manual Approval для production.
3. Progressive Rollout: Canary 5% → 25% → 100%.
4. Auto-rollback при ошибках >1% или падении Scrape Success Rate.
5. Миграции Supabase до деплоя кода (обратная совместимость).

### 12.4 Infrastructure as Code

- Terraform / OpenTofu для Cloudflare (Workers, AI Gateway, Pages, R2, KV).
- Supabase миграции в репозитории.
- Изоляция окружений: local/staging/production идентичны, различаются переменными и лимитами.

## 13. Деплой и инфраструктура

### 13.1 Уровни (Edge-first)

- Edge Layer: Cloudflare WAF + Pages + R2 (DDoS, статика, архивы).
- Application Tier: Workers (Hono) + Durable Objects.
- AI Tier: Cloudflare AI Gateway.
- Data Tier: Supabase + Upstash Redis.
- Observability: Sentry + Logpush + AI Gateway Logs.

### 13.2 Масштабирование

- Horizontal: Workers в 300+ ДЦ.
- AI Inference: OpenRouter балансирует провайдеров.
- Database: вертикальное до 16 vCPU, read-replicas в v2.
- Redis: pay-per-request автошкалирование.

### 13.3 Resilience Patterns

- Retry с backoff, Circuit Breaker (DeepSeek → GPT-4o-mini), Idempotency (Redis), Graceful Shutdown (`waitUntil`).

### 13.4 Backup и DR

- PITR в Supabase (RPO <5 мин, RTO <30 мин).
- Ежедневный экспорт в R2, DR-учения раз в квартал.
- Runbook переключения LLM/retrieval <15 мин.

### 13.5 FinOps

- LLM Cache (AI Gateway) экономит 20–30% токенов.
- DeepSeek V3.2: $0.27/M input, $1.10/M output.
- Бюджеты в OpenRouter и Cloudflare, алерты при 80%.
- Per-tenant Cost Tracking через Audit Log.

## 14. Observability и мониторинг

### 14.1 Логи

- Структурированный JSON, запрет `console.log` в production.
- Контекст: trace_id, owner_id, property_id.
- PII/секреты фильтруются middleware.
- Ретенция: Logpush 14 дн, архив R2 90 дн, Audit Log Supabase 12 мес.

### 14.2 Метрики (RED + USE)

- RED (Rate, Errors, Duration): Scrape Success Rate 95%, время генерации черновика <2 мин, p95 API <800 мс.
- USE (Utilization, Saturation, Errors): Workers CPU, коннекты к БД, лимиты Redis.

### 14.3 Трассировка

- OpenTelemetry, экспорт через AI Gateway.
- Каждый LLM-вызов – span (model, tokens, latency, prompt_id/version).
- Корреляция трасс с бизнес-метриками.

### 14.4 AI-Specific Observability

- Hallucination Rate, Cost Monitoring по tenant'ам, Feedback Loop, Prompt Drift (кластеризация эмбеддингов).

### 14.5 SLO и Error Budgets

- Доступность мониторинга 99.9% (43 мин простоя/мес).
- Производительность: p95 API <800 мс, p95 генерации апелляции <90 сек.
- Исчерпание бюджета → заморозка фич.

### 14.6 Алертинг

- «Нет уведомлений >3 часов» и др. симптомы.
- Каждый алерт со ссылкой на Runbook.
- Blameless post-mortems.

## 15. Итерация, Retraining и поддержка

### 15.1 Hypercare (1–2 недели после деплоя)

- Ежедневная сверка Scrape Success Rate.
- Ручной аудит первых 20–30 апелляций.
- Корректировка промптов при правках >30%.
- On-call инженер, SLA реакции <30 мин.

### 15.2 Детекция дрифта

- **Data Drift:** ошибки парсинга → синтетические запросы каждые 30 мин.
- **Concept Drift:** падение успешных апелляций <25% → аудит правил.
- **Prompt Drift:** появление нового кластера эмбеддингов >10%.
- **Model Drift:** регрессионный прогон Golden Set раз в неделю.

### 15.3 Цикл непрерывного улучшения

1. Сбор фидбека (Telegram + дашборд).
2. Анализ ошибок.
3. A/B-тестирование промптов 10/90.
4. Eval Suite на Golden Set.
5. Промоушен успешного промпта.

### 15.4 Документация и Runbooks

- ADR-папка, Runbooks («Scrape Success Rate <80%», «Как переключить LLM», и др.).
- Architecture Overview (обновляется на каждом мажорном релизе).
- Onboarding-документ: локальный запуск <30 мин.

### 15.5 Roadmap масштабирования (post-MVP)

- **v1.1** – интеграция с PMS (Bnovo, TravelLine и др.)
- **v1.2** – новые площадки (Суточно.ру, 2GIS, Яндекс Карты, Google Maps)
- **v1.3** – автоматическая публикация одобренных ответов через API площадок
- **v2.0** – мультиязычность
- **v2.1** – собственный fine-tuned LLM для снижения стоимости инференса в 3–5 раз

---

**Ключевой принцип:** HostGuard AI – живой организм, требующий постоянной актуализации знаний о правилах площадок и регулярного retraining. SLA на поддержку – обязательная часть коммерческого предложения.
```
