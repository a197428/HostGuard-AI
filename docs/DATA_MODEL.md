# DATA_MODEL.md – Схема данных и Agent Memory

Полное описание схемы базы данных, структуры ключей Redis и устройства Agent Memory для HostGuard AI.

## 1. Основная база данных (Supabase PostgreSQL)

### 1.1 Таблица `owners`

Владельцы объектов (отельеры).

| Колонка             | Тип           | Ограничения                     | Описание                        |
| ------------------- | ------------- | ------------------------------- | ------------------------------- |
| `id`                | `uuid`        | PK, default `gen_random_uuid()` | Уникальный идентификатор        |
| `email`             | `text`        | UNIQUE, NOT NULL                | Email для входа                 |
| `telegram_id`       | `bigint`      | UNIQUE                          | ID пользователя в Telegram      |
| `tone_of_voice`     | `text`        |                                 | Стиль общения (из Agent Memory) |
| `greeting_template` | `text`        |                                 | Шаблон приветствия в ответах    |
| `created_at`        | `timestamptz` | NOT NULL, default `now()`       |                                 |
| `updated_at`        | `timestamptz` | NOT NULL, default `now()`       |                                 |
| `is_deleted`        | `boolean`     | default `false`                 | Soft delete                     |
| `deleted_at`        | `timestamptz` |                                 |                                 |

### 1.2 Таблица `properties`

Объекты недвижимости (апартаменты, отели), которые мониторятся.

| Колонка                | Тип           | Ограничения              | Описание                                          |
| ---------------------- | ------------- | ------------------------ | ------------------------------------------------- |
| `id`                   | `uuid`        | PK                       |                                                   |
| `owner_id`             | `uuid`        | FK → owners.id, NOT NULL | Владелец                                          |
| `name`                 | `text`        | NOT NULL                 | Название объекта                                  |
| `address`              | `text`        |                          | Адрес                                             |
| `features`             | `jsonb`       |                          | Особенности: расположение, ремонт, инфраструктура |
| `typical_complaints`   | `text[]`      |                          | Типичные жалобы: шум, парковка                    |
| `monitoring_interval`  | `int`         | default `120`            | Интервал сканирования в минутах                   |
| `is_monitoring_active` | `boolean`     | default `true`           | Флаг активности мониторинга                       |
| `created_at`           | `timestamptz` | NOT NULL                 |                                                   |
| `updated_at`           | `timestamptz` | NOT NULL                 |                                                   |
| `is_deleted`           | `boolean`     | default `false`          |                                                   |
| `deleted_at`           | `timestamptz` |                          |                                                   |

### 1.3 Таблица `property_urls`

URL карточек объекта на разных площадках.

| Колонка       | Тип           | Ограничения                                      | Описание             |
| ------------- | ------------- | ------------------------------------------------ | -------------------- |
| `id`          | `uuid`        | PK                                               |                      |
| `property_id` | `uuid`        | FK → properties.id, NOT NULL                     |                      |
| `platform`    | `text`        | NOT NULL, CHECK IN ('avito','ostrovok','yandex') | Площадка             |
| `url`         | `text`        | NOT NULL                                         | URL карточки объекта |
| `created_at`  | `timestamptz` | NOT NULL                                         |                      |
| `updated_at`  | `timestamptz` | NOT NULL                                         |                      |

Уникальность: `UNIQUE(property_id, platform)`

### 1.4 Таблица `reviews`

Собранные отзывы.

| Колонка                  | Тип           | Ограничения                                | Описание                                                                                         |
| ------------------------ | ------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `id`                     | `uuid`        | PK                                         |                                                                                                  |
| `property_id`            | `uuid`        | FK → properties.id, NOT NULL               |                                                                                                  |
| `owner_id`               | `uuid`        | FK → owners.id, NOT NULL                   | Денормализован для RLS                                                                           |
| `platform`               | `text`        | NOT NULL                                   |                                                                                                  |
| `platform_review_id`     | `text`        | NOT NULL                                   | ID отзыва на площадке                                                                            |
| `author_name_hash`       | `text`        |                                            | Хеш имени автора (PII masking)                                                                   |
| `rating`                 | `int`         | CHECK (1..5)                               | Оценка                                                                                           |
| `text`                   | `text`        | NOT NULL                                   | Текст отзыва                                                                                     |
| `review_date`            | `timestamptz` |                                            | Дата публикации отзыва                                                                           |
| `sentiment`              | `text`        | CHECK IN ('positive','neutral','negative') | После AI-анализа                                                                                 |
| `violation_detected`     | `boolean`     | default `false`                            |                                                                                                  |
| `violations`             | `jsonb`       |                                            | Массив найденных нарушений                                                                       |
| `public_response`        | `text`        |                                            | Сгенерированный ответ                                                                            |
| `public_response_edited` | `text`        |                                            | Отредактированный владельцем                                                                     |
| `appeal_text`            | `text`        |                                            | Черновик апелляции                                                                               |
| `appeal_confidence`      | `float`       | CHECK (0..1)                               | Уверенность модели                                                                               |
| `legal_grounds`          | `jsonb`       |                                            | Юридические основания                                                                            |
| `status`                 | `text`        | default 'new'                              | Статус: new, draft_ready, approved, edited, rejected, appeal_sent, appeal_success, appeal_denied |
| `created_at`             | `timestamptz` | NOT NULL                                   |                                                                                                  |
| `updated_at`             | `timestamptz` | NOT NULL                                   |                                                                                                  |
| `is_deleted`             | `boolean`     | default `false`                            |                                                                                                  |
| `deleted_at`             | `timestamptz` |                                            |                                                                                                  |

Уникальность: `UNIQUE(platform, platform_review_id)`

### 1.5 Таблица `llm_calls`

Audit log для каждого вызова LLM.

| Колонка           | Тип           | Ограничения              | Описание                                   |
| ----------------- | ------------- | ------------------------ | ------------------------------------------ |
| `id`              | `uuid`        | PK                       |                                            |
| `owner_id`        | `uuid`        | FK → owners.id, NOT NULL |                                            |
| `review_id`       | `uuid`        | FK → reviews.id          | Связанный отзыв                            |
| `model`           | `text`        | NOT NULL                 | deepseek-v3, gpt-4o-mini                   |
| `prompt_id`       | `text`        | NOT NULL                 | ID версии промпта                          |
| `prompt_version`  | `text`        | NOT NULL                 | Версия промпта                             |
| `input_tokens`    | `int`         | NOT NULL                 |                                            |
| `output_tokens`   | `int`         | NOT NULL                 |                                            |
| `latency_ms`      | `int`         | NOT NULL                 |                                            |
| `trace_id`        | `text`        | NOT NULL                 | Из AI Gateway                              |
| `response_status` | `text`        | NOT NULL                 | success, validation_error, retry, fallback |
| `created_at`      | `timestamptz` | NOT NULL                 |                                            |

### 1.6 Таблица `feature_flags`

Управление канареечными развёртываниями.

| Колонка              | Тип           | Ограничения                 | Описание                        |
| -------------------- | ------------- | --------------------------- | ------------------------------- |
| `id`                 | `uuid`        | PK                          |                                 |
| `name`               | `text`        | UNIQUE, NOT NULL            | Название фичи                   |
| `enabled`            | `boolean`     | default `false`             |                                 |
| `rollout_percentage` | `int`         | CHECK (0..100), default `0` | % трафика                       |
| `owner_ids`          | `uuid[]`      |                             | Список владельцев для канарейки |
| `created_at`         | `timestamptz` | NOT NULL                    |                                 |
| `updated_at`         | `timestamptz` | NOT NULL                    |                                 |

### 1.7 Таблица `agent_memory`

Долгосрочная память агента (правила площадок, успешные апелляции, кейсы).

| Колонка      | Тип            | Ограничения                                      | Описание                         |
| ------------ | -------------- | ------------------------------------------------ | -------------------------------- |
| `id`         | `uuid`         | PK                                               |                                  |
| `level`      | `text`         | NOT NULL, CHECK IN ('global','local','tactical') | Уровень памяти                   |
| `scope`      | `text`         |                                                  | platform, property_id, case_type |
| `content`    | `jsonb`        | NOT NULL                                         | Данные                           |
| `embedding`  | `vector(1536)` |                                                  | Для будущего semantic search     |
| `created_at` | `timestamptz`  | NOT NULL                                         |                                  |
| `updated_at` | `timestamptz`  | NOT NULL                                         |                                  |

## 2. Принципы дизайна схемы

- **Single Source of Truth:** PostgreSQL — единственный источник правды. Redis — только эфемерный буфер.
- **Иммутабельность событий:** Отзывы и черновики — append-only, история не перезаписывается.
- **Soft Delete:** Флаг `is_deleted` и `deleted_at` вместо физического удаления — для аналитики и аудита.
- **Обязательные атрибуты:** `created_at`, `updated_at`, `owner_id` во всех бизнес-таблицах.
- **RLS:** Все запросы фильтруются по `owner_id`, изоляция тенантов на уровне БД.

## 3. Upstash Redis (оперативный кеш)

### 3.1 Дедупликация отзывов

Ключ: review:{platform}:{platform_review_id}
Значение: "processed"
TTL: 90 дней (7 776 000 сек)

Проверяется перед анализом каждого отзыва. При попадании в кеш — процесс завершается без побочных эффектов.

### 3.2 Rate Limiting

Ключ: ratelimit:{owner_id}:{endpoint}
Значение: счётчик запросов
TTL: 60 сек (скользящее окно)

Используется AI Gateway (100 req/min на владельца) + дополнительные лимиты на Workers.

## 4. Agent Memory (двухуровневая)

### 4.1 Глобальный уровень (Owner)

| Поле               | Описание                                            |
| ------------------ | --------------------------------------------------- |
| Tone of Voice      | Стиль общения: официальный, дружелюбный, сдержанный |
| greeting_template  | Шаблон приветствия: «С уважением, Алексей»          |
| standard_responses | Типовые ответы на частые ситуации                   |
| owner_name         | Имя владельца для подписи                           |

Хранение: таблица `owners` + `agent_memory` (level='global')

### 4.2 Локальный уровень (Property)

| Поле                   | Описание                                     |
| ---------------------- | -------------------------------------------- |
| Особенности объекта    | Расположение, ремонт, инфраструктура         |
| Типичные жалобы        | Шум, парковка, чистота                       |
| История взаимодействий | Предыдущие ответы на отзывы по этому объекту |

Хранение: таблица `properties` + `agent_memory` (level='local')

### 4.3 Тактический уровень (Case)

| Поле                    | Описание                                   |
| ----------------------- | ------------------------------------------ |
| Успешные апелляции      | Шаблоны сработавших обращений по площадкам |
| Отклонённые апелляции   | Кейсы, где модерация отказала              |
| Свежие правила площадок | Актуальные пункты правил для ссылок        |

Хранение: таблица `agent_memory` (level='tactical') + автообновление раз в квартал

## 5. Безопасность данных

- **Row Level Security:** Каждый запрос фильтруется по `owner_id` через JWT.
- **PII Masking:** Имя автора → `author_name_hash`, телефон/email удаляются до LLM.
- **Audit Log:** Таблица `llm_calls` хранит полный трейс взаимодействий с AI.
- **Шифрование:** Supabase — encryption at rest, Redis — TLS 1.3.

## Связанные документы

- [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) — полный контекст архитектуры
- [PROMPTS.md](./PROMPTS.md) — системные промпты
- [AI_LAYER.md](./AI_LAYER.md) — логика AI-слоя

```

```
