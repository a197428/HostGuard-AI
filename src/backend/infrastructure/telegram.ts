// =============================================================================
// Telegram Bot Infrastructure (grammY)
// HostGuard AI — уведомления владельцам через Telegram Bot API
// =============================================================================

import { Bot, InlineKeyboard, type Context } from "grammy";
import type { Env } from "../env";
import { PROMPTS } from "@hostguard/shared/prompts";
import { logStructured } from "./logging";
import { reportError } from "./observability";
import { createSupabaseClient, SupabaseRepository } from "./supabase";

// =============================================================================
// Types
// =============================================================================

export interface ReviewAlertPayload {
  reviewId: string;
  propertyName: string;
  platform: string;
  rating: number;
  reviewText: string;
  authorName?: string;
  reviewDate?: string;
  publicResponse: string;
  appealText?: string;
  appealConfidence?: number;
  legalGrounds?: Array<{ source: string; article: string; citation: string }>;
  violationDetected: boolean;
}

export type OwnerDecision = "approved" | "edited" | "rejected";

export interface OwnerDecisionResult {
  reviewId: string;
  decision: OwnerDecision;
  ownerTelegramId: number;
  timestamp: string;
}

// =============================================================================
// Callback data constants
// =============================================================================

export const CALLBACK_DATA = {
  APPROVE: "review_approve",
  EDIT: "review_edit",
  REJECT: "review_reject",
} as const;

// =============================================================================
// PII Masking (расширенная версия для Telegram)
// =============================================================================

/**
 * Маскирует PII (персональные данные) в тексте перед отправкой в Telegram.
 * Использует паттерны из PROMPTS.PII_MASKING + дополнительные правила.
 */
export function maskPIIForTelegram(text: string): string {
  let masked = text;

  // 1. Маскируем телефоны (с + или без, 10-12 цифр)
  masked = masked.replace(/\+?\d{10,12}(?!\w)/g, "[PHONE]");

  // 2. Маскируем email
  masked = masked.replace(
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    "[EMAIL]",
  );

  // 3. Маскируем имена в формате "Имя Фамилия" (русские)
  // Используем lookbehind/lookahead для границ слов вместо \b
  masked = masked.replace(
    /(^|[\s,;:.!?«»"(-])([А-Я][а-я]+\s+[А-Я][а-я]+)(?=[\s,;:.!?»")-]|$)/g,
    "$1[NAME]",
  );

  return masked;
}

// =============================================================================
// Message Builder
// =============================================================================

/**
 * Формирует текст сообщения для отправки владельцу в Telegram.
 * Все PII данные маскируются перед включением в сообщение.
 */
export function buildAlertMessage(payload: ReviewAlertPayload): string {
  const maskedReviewText = maskPIIForTelegram(payload.reviewText);
  const maskedPublicResponse = maskPIIForTelegram(payload.publicResponse);
  const maskedAppealText = payload.appealText
    ? maskPIIForTelegram(payload.appealText)
    : undefined;

  const lines: string[] = [];

  // Header
  lines.push("🚨 **HostGuard AI — Обнаружен новый отзыв**");
  lines.push("");

  // Property info
  lines.push(`🏠 **Объект:** ${payload.propertyName}`);
  lines.push(`📱 **Платформа:** ${payload.platform}`);
  lines.push(
    `⭐ **Рейтинг:** ${"★".repeat(payload.rating)}${"☆".repeat(5 - payload.rating)} (${payload.rating}/5)`,
  );
  if (payload.reviewDate) {
    lines.push(`📅 **Дата:** ${payload.reviewDate}`);
  }
  lines.push("");

  // Review text
  lines.push("**📝 Текст отзыва:**");
  lines.push(`> ${maskedReviewText}`);
  lines.push("");

  // Violation info
  if (payload.violationDetected) {
    lines.push("⚠️ **Обнаружены нарушения правил площадки**");
    if (payload.legalGrounds && payload.legalGrounds.length > 0) {
      lines.push("**Юридические основания:**");
      for (const ground of payload.legalGrounds) {
        lines.push(
          `  • ${ground.source}: ${ground.article} — ${ground.citation}`,
        );
      }
    }
    lines.push("");
  }

  // Public response draft
  lines.push("**💬 Черновик публичного ответа:**");
  lines.push(`> ${maskedPublicResponse}`);
  lines.push("");

  // Appeal draft (if exists)
  if (maskedAppealText) {
    lines.push("**📄 Черновик апелляции в модерацию:**");
    lines.push(`> ${maskedAppealText}`);
    if (payload.appealConfidence !== undefined) {
      const confidencePercent = Math.round(payload.appealConfidence * 100);
      lines.push(`Уверенность AI: ${confidencePercent}%`);
    }
    lines.push("");
  }

  // Footer
  lines.push("---");
  lines.push("Выберите действие:");

  return lines.join("\n");
}

/**
 * Создаёт инлайн-клавиатуру для алерта.
 */
export function createAlertKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Одобрить", CALLBACK_DATA.APPROVE)
    .text("✏️ Правка", CALLBACK_DATA.EDIT)
    .text("❌ Отклонить", CALLBACK_DATA.REJECT);
}

// =============================================================================
// Callback Data Parsing
// =============================================================================

/**
 * Парсит callback_data и возвращает решение владельца.
 * Поддерживает формат "action" и "action:reviewId".
 */
export function parseCallbackData(callbackData: string): OwnerDecision | null {
  // Извлекаем префикс действия (до первого ":")
  const action = callbackData.split(":")[0];

  switch (action) {
    case CALLBACK_DATA.APPROVE:
      return "approved";
    case CALLBACK_DATA.EDIT:
      return "edited";
    case CALLBACK_DATA.REJECT:
      return "rejected";
    default:
      return null;
  }
}

// =============================================================================
// Bot Factory
// =============================================================================

/**
 * Создаёт и настраивает экземпляр Telegram Bot (grammY).
 * Регистрирует обработчики команд и callback-запросов.
 */
export function createTelegramBot(env: Env): Bot<Context> | null {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    logStructured("warn", {
      trace_id: "telegram_init",
      owner_id: "system",
      property_id: "system",
      message: "TELEGRAM_BOT_TOKEN not configured, Telegram bot disabled",
    });
    return null;
  }

  const bot = new Bot(token);

  // Register error handler
  bot.catch((err) => {
    logStructured("error", {
      trace_id: `telegram_error_${Date.now()}`,
      owner_id: "system",
      property_id: "system",
      message: "Telegram bot error",
      data: {
        error: err.message,
        stack: err.stack,
      },
    });
  });

  // Register command handlers
  bot.command("start", async (ctx) => {
    const telegramId = ctx.from?.id;
    await ctx.reply(
      `👋 Добро пожаловать в HostGuard AI!\n\n` +
        `Я буду уведомлять вас о новых отзывах на ваши объекты. ` +
        `Вы сможете одобрить черновик ответа, запросить правку или отклонить его.`,
    );
    logStructured("info", {
      trace_id: `telegram_start_${Date.now()}`,
      owner_id: "system",
      property_id: "system",
      message: "User started bot",
      data: { telegram_id: telegramId },
    });
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      `🤖 **HostGuard AI — Помощь**\n\n` +
        `Команды:\n` +
        `/start — Начать работу\n` +
        `/help — Эта справка\n\n` +
        `При обнаружении негативного отзыва я пришлю вам:\n` +
        `• Текст отзыва\n` +
        `• Черновик публичного ответа\n` +
        `• Черновик апелляции (если есть основания)\n` +
        `• Кнопки для принятия решения\n\n` +
        `**Кнопки:**\n` +
        `✅ Одобрить — ответ готов к публикации\n` +
        `✏️ Правка — запросить доработку\n` +
        `❌ Отклонить — отклонить черновик`,
      { parse_mode: "Markdown" },
    );
  });

  return bot;
}

// =============================================================================
// Callback Query Handler
// =============================================================================

/**
 * Обрабатывает callback-запросы от инлайн-кнопок.
 * Записывает решение владельца в Supabase.
 */
export async function handleCallbackQuery(
  ctx: Context,
  env: Env,
): Promise<void> {
  const callbackData = ctx.callbackQuery?.data;
  const telegramId = ctx.from?.id;
  const messageText = ctx.callbackQuery?.message;

  if (!callbackData || !telegramId || !messageText) {
    await ctx.answerCallbackQuery({ text: "Ошибка: неверные данные" });
    return;
  }

  const decision = parseCallbackData(callbackData);
  if (!decision) {
    await ctx.answerCallbackQuery({ text: "Неизвестная команда" });
    return;
  }

  // Извлекаем reviewId из сообщения (он в callback_data не передаётся,
  // поэтому используем контекст — reviewId будет передан через data-атрибут
  // при создании клавиатуры. Для этого мы храним reviewId в callback_data
  // через разделитель. Но для простоты используем KV или парсинг из текста.
  // В текущей реализации reviewId передаётся через callback_data с префиксом.

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    await ctx.answerCallbackQuery({
      text: "Ошибка: база данных не настроена",
    });
    return;
  }

  const supabase = createSupabaseClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });
  const repo = new SupabaseRepository(supabase);

  // Парсим reviewId из callback_data (формат: "action:reviewId")
  const parts = callbackData.split(":");
  const reviewId = parts.length > 1 ? parts.slice(1).join(":") : undefined;

  if (!reviewId) {
    await ctx.answerCallbackQuery({
      text: "Ошибка: идентификатор отзыва не найден",
    });
    return;
  }

  try {
    // Обновляем статус отзыва в Supabase
    const statusMap: Record<OwnerDecision, string> = {
      approved: "approved",
      edited: "edited",
      rejected: "rejected",
    };

    await repo.updateReview(reviewId, {
      status: statusMap[decision] as any,
    });

    // Отвечаем пользователю
    const decisionLabels: Record<OwnerDecision, string> = {
      approved: "✅ Черновик одобрен! Ответ готов к публикации.",
      edited: "✏️ Запрошена доработка черновика.",
      rejected: "❌ Черновик отклонён.",
    };

    // Редактируем сообщение, убирая кнопки
    try {
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    } catch {
      // Игнорируем ошибку редактирования (сообщение могло быть уже изменено)
    }

    await ctx.answerCallbackQuery({
      text: decisionLabels[decision],
    });

    // Отправляем подтверждение в чат
    await ctx.reply(
      `✅ **Решение принято!**\n\n${decisionLabels[decision]}\n\n` +
        `Вы всегда можете изменить решение в дашборде HostGuard AI.`,
      { parse_mode: "Markdown" },
    );

    logStructured("info", {
      trace_id: `telegram_callback_${Date.now()}`,
      owner_id: "system",
      property_id: "system",
      message: "Owner decision recorded",
      data: {
        review_id: reviewId,
        decision,
        telegram_id: telegramId,
      },
    });
  } catch (error) {
    logStructured("error", {
      trace_id: `telegram_callback_error_${Date.now()}`,
      owner_id: "system",
      property_id: "system",
      message: "Failed to process callback query",
      data: {
        error: error instanceof Error ? error.message : "Unknown",
        review_id: reviewId,
        decision,
      },
    });

    await ctx.answerCallbackQuery({
      text: "Произошла ошибка при сохранении решения. Попробуйте ещё раз.",
    });
  }
}

// =============================================================================
// Alert Sender
// =============================================================================

/**
 * Отправляет алерт владельцу в Telegram.
 * Возвращает true если отправка успешна.
 */
export async function sendReviewAlert(
  env: Env,
  ownerTelegramId: number,
  payload: ReviewAlertPayload,
): Promise<boolean> {
  const bot = createTelegramBot(env);
  if (!bot) {
    logStructured("warn", {
      trace_id: `telegram_send_${Date.now()}`,
      owner_id: "system",
      property_id: "system",
      message: "Telegram bot not configured, cannot send alert",
      data: { review_id: payload.reviewId },
    });
    return false;
  }

  try {
    const messageText = buildAlertMessage(payload);
    const keyboard = createAlertKeyboard();

    // Создаём callback_data с reviewId для каждого действия
    const reviewPrefix = payload.reviewId;
    const keyboardWithReviewId = new InlineKeyboard()
      .text("✅ Одобрить", `${CALLBACK_DATA.APPROVE}:${reviewPrefix}`)
      .text("✏️ Правка", `${CALLBACK_DATA.EDIT}:${reviewPrefix}`)
      .text("❌ Отклонить", `${CALLBACK_DATA.REJECT}:${reviewPrefix}`);

    await bot.api.sendMessage(ownerTelegramId, messageText, {
      parse_mode: "Markdown",
      reply_markup: keyboardWithReviewId,
    });

    logStructured("info", {
      trace_id: `telegram_send_${Date.now()}`,
      owner_id: "system",
      property_id: "system",
      message: "Alert sent to Telegram",
      data: {
        review_id: payload.reviewId,
        owner_telegram_id: ownerTelegramId,
        platform: payload.platform,
        rating: payload.rating,
        has_appeal: Boolean(payload.appealText),
      },
    });

    return true;
  } catch (error) {
    void reportError(
      {
        SENTRY_DSN: env.SENTRY_DSN,
        SENTRY_ENVIRONMENT: env.SENTRY_ENVIRONMENT,
        SENTRY_RELEASE: env.SENTRY_RELEASE,
      },
      {
        trace_id: `telegram_send_error_${Date.now()}`,
        owner_id: "system",
        property_id: "system",
        message: "Failed to send Telegram alert",
        data: {
          review_id: payload.reviewId,
          owner_telegram_id: ownerTelegramId,
        },
      },
      error,
    );
    return false;
  }
}

// =============================================================================
// Webhook Handler (для Cloudflare Workers)
// =============================================================================

/**
 * Обрабатывает входящий webhook от Telegram.
 * Должен быть вызван из Hono-роутера на /api/telegram/webhook.
 */
export async function handleTelegramWebhook(
  request: Request,
  env: Env,
): Promise<Response> {
  const bot = createTelegramBot(env);
  if (!bot) {
    return new Response(
      JSON.stringify({ ok: false, error: "Telegram bot not configured" }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }

  try {
    const update = (await request.json()) as Record<string, unknown>;
    await bot.handleUpdate(update as any);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    void reportError(
      {
        SENTRY_DSN: env.SENTRY_DSN,
        SENTRY_ENVIRONMENT: env.SENTRY_ENVIRONMENT,
        SENTRY_RELEASE: env.SENTRY_RELEASE,
      },
      {
        trace_id: `telegram_webhook_${Date.now()}`,
        owner_id: "system",
        property_id: "system",
        message: "Failed to handle Telegram webhook",
      },
      error,
    );
    return new Response(
      JSON.stringify({ ok: false, error: "Internal error" }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }
}
