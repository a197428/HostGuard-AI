# CODING_STANDARDS.md – Стандарты разработки

Правила написания кода, структура проекта и инструментарий разработчика для HostGuard AI.

## 1. Язык и типизация

### TypeScript

- **Версия:** 5.x
- **Режим:** `strict: true` (без исключений)
- **Проверка в CI:** `tsc --noEmit`

### Конфигурация tsconfig.json

```json
{
	"compilerOptions": {
		"strict": true,
		"noUncheckedIndexedAccess": true,
		"noImplicitReturns": true,
		"noFallthroughCasesInSwitch": true,
		"target": "ES2022",
		"module": "ESNext",
		"moduleResolution": "bundler",
		"esModuleInterop": true,
		"skipLibCheck": true
	}
}
```

---

## 2. Структура проекта

```
/
├── src/
│   ├── index.ts                # Точка входа: Cron + HTTP роутер (Hono)
│   ├── agents/
│   │   ├── monitor.ts          # Durable Object: процесс мониторинга объекта
│   │   └── legal_analyst.ts    # «Юрист-претензионист»
│   ├── application/
│   │   ├── orchestrators.ts    # Use Cases: retrieve → analyze → draft → notify
│   │   └── feedback_loop.ts    # Обработка реакций владельца из Telegram
│   ├── infrastructure/
│   │   ├── tavily.ts           # Клиент Tavily API
│   │   ├── browser_rendering.ts # Fallback через Cloudflare Browser Rendering
│   │   ├── deepseek.ts         # Адаптер LLM через AI Gateway
│   │   ├── supabase.ts         # Работа с БД и RLS
│   │   ├── telegram.ts         # Telegram Bot (grammY)
│   │   └── redis.ts            # Upstash Redis (дедупликация)
│   └── shared/
│       ├── prompts.ts          # Prompt Registry (версионируемые шаблоны)
│       ├── schemas.ts          # Zod-схемы для Structured Outputs
│       └── types.ts            # Доменные типы
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── ai/             # StreamingRenderer, ConfidenceIndicator, SourceCitations
│       │   ├── reviews/        # ReviewCard, AppealEditor, PublicResponseEditor
│       │   └── ui/             # Buttons, Inputs, Modals, Skeletons
│       ├── stores/             # reviewStore, propertyStore, ownerStore
│       └── views/              # Dashboard, Property
├── docs/                       # Документация проекта
├── memory/                     # Контекст сессии разработки
├── tests/                      # Тесты (если вынесены отдельно)
├── AGENTS.md                   # Инструкция для AI-агентов
├── CLAUDE.md                   # Контекст для Claude Code
├── README.md                   # Описание проекта для людей
└── package.json
```

---

## 3. Именование

### Файлы и директории

- **Директории:** `kebab-case` (`application/`, `browser_rendering.ts`)
- **Файлы:** `snake_case.ts` для инфраструктуры, `kebab-case` для компонентов Vue
- **Компоненты Vue:** `PascalCase.vue` (`ReviewCard.vue`, `AppealEditor.vue`)

### Код

- **Переменные/функции:** `camelCase`
- **Типы/интерфейсы:** `PascalCase`
- **Константы:** `UPPER_SNAKE_CASE`
- **Zod-схемы:** суффикс `Schema` (`ReviewSchema`, `AppealSchema`)

---

## 4. Валидация данных

### Zod для всех границ

Каждый внешний вход и выход должен быть валидирован:

```typescript
// Пример: валидация ответа от LLM
import { z } from 'zod';

const AppealResponseSchema = z.object({
	review_id: z.string(),
	platform: z.enum(['avito', 'ostrovok', 'yandex']),
	sentiment: z.enum(['positive', 'neutral', 'negative']),
	violation_detected: z.boolean(),
	public_response: z.object({
		text: z.string(),
		tone: z.string(),
	}),
	appeal: z
		.object({
			text: z.string(),
			legal_grounds: z.array(
				z.object({
					source: z.enum(['platform_rules', 'gk_rf', 'uk_rf']),
					article: z.string(),
					citation: z.string(),
				}),
			),
			confidence: z.number().min(0).max(1),
		})
		.optional(),
	recommendation: z.object({
		action: z.enum(['approve', 'review_carefully', 'reject']),
		reason: z.string(),
	}),
});

type AppealResponse = z.infer<typeof AppealResponseSchema>;
```

### Правила валидации

- Все входящие данные от API/LLM проходят Zod-схему
- При ошибке валидации → Self-healing retry (максимум 3 попытки)
- Все схемы хранятся в `src/shared/schemas.ts`

---

## 5. Обработка ошибок

### Retry Policy

```typescript
// Для всех внешних вызовов (Tavily, DeepSeek, Supabase, Telegram)
const retryConfig = {
	maxAttempts: 3,
	baseDelayMs: 1000, // Экспоненциальный backoff
	maxDelayMs: 10000,
};
```

### Circuit Breaker

- Встроен в Cloudflare AI Gateway
- Срабатывает при error rate > 10%
- Автоматическое переключение DeepSeek → GPT-4o-mini

### Graceful Degradation

```typescript
// Пример: fallback при ошибке генерации апелляции
try {
	const response = await generateAppeal(review);
} catch (error) {
	// Предложить стандартный шаблон ответа
	return getFallbackTemplate(review);
}
```

---

## 6. Логирование

### Формат

```typescript
// Всегда структурированный JSON
const log = {
  level: 'info' | 'warn' | 'error',
  trace_id: string,
  owner_id: string,
  property_id: string,
  message: string,
  data?: Record<string, unknown>,
  timestamp: string
};
```

### Запреты

- ❌ `console.log()` в production-Workers (отлавливается линтером)
- ✅ Только структурированный вывод через middleware логирования

### Ретенция

- Logpush: 14 дней (горячие логи)
- R2 архив: 90 дней
- Audit Log в Supabase: 12 месяцев

---

## 7. Комментирование и документация

### JSDoc для публичных API

```typescript
/**
 * Анализирует отзыв и генерирует публичный ответ с апелляцией при необходимости.
 * @param review - Текст отзыва (PII уже замаскирован)
 * @param propertyId - ID объекта
 * @returns {AppealResponse} Результат анализа
 * @throws {ValidationError} При невалидном ответе LLM
 */
async function analyzeReview(
	review: string,
	propertyId: string,
): Promise<AppealResponse> {
	// ...
}
```

### Self-documenting code

- Имена переменных и функций должны отражать намерение
- Сложная логика → комментарий с объяснением «почему», а не «что»

---

## 8. Тестирование

### Инструменты

- **Unit/Integration:** Vitest
- **Contract:** Zod + JSON-Schema
- **E2E:** Playwright
- **AI Evaluation:** LLM-as-Judge + Golden Set
- **Adversarial:** Кастомный Red Team Suite

### Запуск

```bash
npm run lint          # ESLint + Prettier
npm run test:unit     # Vitest
npm run test:e2e      # Playwright
npm run test:ai-eval  # Прогон Golden Set
npm run test          # Всё вместе
```

### Pre-commit хуки

```bash
# husky + lint-staged
npm run lint
npm run test:unit
```

---

## 9. Git и Conventional Commits

### Формат коммитов

```
feat: add Browser Rendering fallback for Yandex Travel
fix: correct Redis key TTL calculation
docs: update PROMPTS.md with new appeal structure
refactor: extract retry logic to shared adapter
test: add cross-tenant isolation tests
chore: upgrade wrangler to v4
```

### Процесс

- Каждая задача — отдельная feature-ветка от `dev`
- Перед пушем: `npm run lint && npm run test`
- Слияние в `main` только из стабильного `dev`

---

## 10. Безопасность кода

### Secrets Management

- ❌ Никаких ключей в коде
- ✅ `wrangler secrets` для production
- ✅ `.dev.vars` для локальной разработки (в `.gitignore`)
- ✅ `service_key` только на сервере, фронтенд использует JWT

### PII Masking

```typescript
// До отправки в LLM
function maskPII(text: string): string {
	return text
		.replace(/\b\d{10,12}\b/g, '[PHONE]')
		.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL]')
		.replace(/\b[А-Я][а-я]+\s+[А-Я][а-я]+\b/g, '[NAME]');
}
```

### RLS

- Все запросы к Supabase идут с JWT владельца
- `service_key` используется только для системных задач Cron

---

## 11. Инструментарий разработчика (DX)

| Инструмент          | Назначение                                        |
| ------------------- | ------------------------------------------------- |
| Cursor / VS Code    | Основная IDE                                      |
| Wrangler CLI        | Деплой и управление Workers                       |
| Miniflare           | Локальная эмуляция Workers, Cron, Durable Objects |
| ESLint + Prettier   | Линтинг и форматирование                          |
| TypeScript strict   | Типовая безопасность                              |
| Vitest              | Unit/Integration тесты                            |
| Playwright          | E2E тесты                                         |
| Sentry              | Мониторинг ошибок                                 |
| Husky + lint-staged | Pre-commit хуки                                   |

### Локальный запуск

```bash
# Backend
npx wrangler dev

# Frontend
cd frontend && npm run dev
```

---

## Связанные документы

- [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) — полный контекст архитектуры
- [PROMPTS.md](./PROMPTS.md) — системные промпты
- [AI_LAYER.md](./AI_LAYER.md) — логика AI-слоя
- [DATA_MODEL.md](./DATA_MODEL.md) — схема БД
- [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) — деплой и CI/CD
