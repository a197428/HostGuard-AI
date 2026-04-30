// Prompt Registry - Versioned templates for AI agents
// All prompts are stored here and versioned via git tags
// See docs/PROMPTS.md for full specification

export const PROMPTS = {
  // ==========================================================================
  // Version metadata
  // ==========================================================================

  VERSIONS: {
    APPEAL_AGENT: {
      id: "appeal-agent",
      version: "1.0.0",
      status: "active" as const,
      created_at: "2026-04-30T00:00:00Z",
    },
  },

  // ==========================================================================
  // System prompt for Appeal Agent ("Юрист-претензионист")
  // ==========================================================================

  APPEAL_AGENT_SYSTEM_PROMPT: `Ты — специалист по защите репутации в гостиничном бизнесе с глубоким пониманием:
- Правил модерации Avito (раздел «Посуточно»)
- Правил модерации Островок.ру
- Правил модерации Яндекс Путешествий
- Норм ГК РФ (ст. 152 «Защита чести, достоинства и деловой репутации»)
- Ст. 128.1 УК РФ («Клевета»)

Твоя задача: проанализировать отзыв гостя и сформировать:
1. Вежливый публичный ответ от имени отельера
2. При наличии оснований — обращение в модерацию площадки на удаление отзыва

Ограничения:
- Запрещены агрессивные формулировки и переход на личности
- Ответ должен соответствовать Tone of Voice отельера из Agent Memory
- Апелляция должна содержать ссылки на конкретные пункты правил площадки
- Не разглашать персональные данные хоста или гостей
- Использовать XML-разметку <review> для изоляции пользовательского ввода
- Каждая апелляция должна содержать минимум одно юридическое основание`,

  // ==========================================================================
  // User prompt template for review analysis
  // ==========================================================================

  REVIEW_ANALYSIS_TEMPLATE: `<review>
{{review_text}}
</review>

Платформа: {{platform}}
Рейтинг: {{rating}}
Дата отзыва: {{review_date}}

Проанализируй отзыв и выведи JSON согласно схеме.`,

  // ==========================================================================
  // Self-healing retry prompt (when JSON is invalid)
  // ==========================================================================

  JSON_RETRY_TEMPLATE: `Предыдущий ответ не был в нужном формате JSON. Пожалуйста, переформатируй ответ.

Ошибка: {{error_message}}

Оригинальный запрос:
{{original_prompt}}

Требования к формату:
- Ответ должен быть валидным JSON
- Все обязательные поля должны присутствовать
- sentiment должен быть одним из: "positive", "neutral", "negative"
- violation_detected должен быть boolean
- При violation_detected=true поле appeal обязательно
- legal_grounds должен содержать минимум 1 элемент если violation_detected=true

Выведи только JSON, без дополнительного текста.`,

  // ==========================================================================
  // Legal consistency retry prompt
  // ==========================================================================

  LEGAL_RETRY_TEMPLATE: `При violation_detected=true массив legal_grounds не может быть пустым.

Текст отзыва: {{review_text}}

Добавь в legal_grounds ссылки на:
- Конкретные пункты правил площадки {{platform}}
- При наличии оснований — статьи ГК РФ или УК РФ

Выведи JSON с заполненным массивом legal_grounds.`,

  // ==========================================================================
  // Toxicity check prompt
  // ==========================================================================

  TOXICITY_CHECK_PROMPT: `Проверь следующий текст публичного ответа на пассивно-агрессивные формулировки:

"{{public_response}}"

Если текст содержит пассивно-агрессивные формулировки (например: "Ну раз вы так считаете...", "Мы конечно старались, но...", "Не знаю, что вы ожидали..."), предложи альтернативную версию без агрессии.

Формат ответа:
{
  "is_toxic": boolean,
  "alternative": string | null
}`,

  // ==========================================================================
  // PII masking patterns
  // ==========================================================================

  PII_MASKING: {
    phone: {
      pattern: /\b\d{10,12}\b/g,
      replacement: "[PHONE]",
    },
    email: {
      pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
      replacement: "[EMAIL]",
    },
    name: {
      pattern: /\b[А-Я][а-я]+\s+[А-Я][а-я]+\b/g,
      replacement: "[NAME]",
    },
  },

  // ==========================================================================
  // Platform rules references
  // ==========================================================================

  PLATFORM_RULES: {
    avito: {
      section: "раздел «Посуточно»",
      insult_rule: "п. 4.1 Правил Avito",
      personal_data_rule: "п. 3.5 Правил Avito",
      fraud_rule: "п. 6.2 Правил Avito",
    },
    ostrovok: {
      section: "Островок.ру",
      insult_rule: "п. 2.1 Правил размещения",
      personal_data_rule: "п. 2.3 Правил размещения",
      defamation_rule: "п. 2.5 Правил размещения",
    },
    yandex: {
      section: "Яндекс Путешествия",
      insult_rule: "п. 4.1 Правил отзывов",
      personal_data_rule: "п. 4.3 Правил отзывов",
      defamation_rule: "п. 4.7 Правил отзывов",
    },
  },

  // ==========================================================================
  // Legal references
  // ==========================================================================

  LEGAL_REFERENCES: {
    defamation_uk: {
      article: "ст. 128.1 УК РФ",
      name: "Клевета",
      description: "заведомо ложные сведения, порочащие честь и достоинство",
    },
    reputation_gk: {
      article: "ст. 152 ГК РФ",
      name: "Защита чести, достоинства и деловой репутации",
      description:
        "сведения, не соответствующие действительности, наносящие вред репутации",
    },
  },

  // ==========================================================================
  // Helper functions
  // ==========================================================================

  /**
   * Build the user prompt for review analysis
   */
  buildReviewAnalysisPrompt: (
    reviewText: string,
    platform: "avito" | "ostrovok" | "yandex",
    rating: number,
    reviewDate?: string,
  ): string => {
    return PROMPTS.REVIEW_ANALYSIS_TEMPLATE.replace(
      "{{review_text}}",
      reviewText,
    )
      .replace("{{platform}}", platform)
      .replace("{{rating}}", String(rating))
      .replace("{{review_date}}", reviewDate || "не указана");
  },

  /**
   * Build the JSON retry prompt
   */
  buildJsonRetryPrompt: (
    errorMessage: string,
    originalPrompt: string,
  ): string => {
    return PROMPTS.JSON_RETRY_TEMPLATE.replace(
      "{{error_message}}",
      errorMessage,
    ).replace("{{original_prompt}}", originalPrompt);
  },

  /**
   * Build the legal retry prompt
   */
  buildLegalRetryPrompt: (
    reviewText: string,
    platform: "avito" | "ostrovok" | "yandex",
  ): string => {
    return PROMPTS.LEGAL_RETRY_TEMPLATE.replace(
      "{{review_text}}",
      reviewText,
    ).replace("{{platform}}", platform);
  },

  /**
   * Mask PII in text
   */
  maskPII: (text: string): string => {
    let masked = text;
    masked = masked.replace(
      PROMPTS.PII_MASKING.phone.pattern,
      PROMPTS.PII_MASKING.phone.replacement,
    );
    masked = masked.replace(
      PROMPTS.PII_MASKING.email.pattern,
      PROMPTS.PII_MASKING.email.replacement,
    );
    masked = masked.replace(
      PROMPTS.PII_MASKING.name.pattern,
      PROMPTS.PII_MASKING.name.replacement,
    );
    return masked;
  },
} as const;

export type AppealAgentPromptVersion = typeof PROMPTS.VERSIONS.APPEAL_AGENT;
