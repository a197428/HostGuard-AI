// =============================================================================
// Telegram Bot Tests
// HostGuard AI — тестирование логики формирования сообщений и PII маскирования
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  buildAlertMessage,
  maskPIIForTelegram,
  parseCallbackData,
  CALLBACK_DATA,
  type ReviewAlertPayload,
} from "../src/backend/infrastructure/telegram";

// =============================================================================
// Test Data
// =============================================================================

const mockPayload: ReviewAlertPayload = {
  reviewId: "550e8400-e29b-41d4-a716-446655440000",
  propertyName: "Уютные апартаменты в центре",
  platform: "avito",
  rating: 2,
  reviewText:
    "Ужасное место! Воняло из канализации, соседи шумели всю ночь. " +
    "Хозяйка Ирина Петрова грубила по телефону +79161234567. " +
    "Никому не советую! Пишите на admin@example.com если хотите подробности.",
  authorName: "Иван Иванов",
  reviewDate: "2026-04-28",
  publicResponse:
    "Уважаемый гость! Приносим извинения за доставленные неудобства. " +
    "Мы проверили систему канализации и устранили неполадки. " +
    "С уважением, администрация.",
  appealText:
    "Уважаемая модерация Avito! Отзыв содержит недостоверную информацию " +
    "и нарушает п. 4.1 Правил Avito (оскорбления). Просим удалить отзыв " +
    "на основании ст. 152 ГК РФ.",
  appealConfidence: 0.85,
  legalGrounds: [
    {
      source: "platform_rules",
      article: "п. 4.1 Правил Avito",
      citation: "Запрет на оскорбления и нецензурную лексику",
    },
    {
      source: "gk_rf",
      article: "ст. 152 ГК РФ",
      citation: "Защита чести, достоинства и деловой репутации",
    },
  ],
  violationDetected: true,
};

// =============================================================================
// PII Masking Tests
// =============================================================================

describe("PII Masking for Telegram", () => {
  it("should mask phone numbers", () => {
    const text = "Мой телефон +79161234567, звоните";
    const masked = maskPIIForTelegram(text);
    expect(masked).toContain("[PHONE]");
    expect(masked).not.toContain("+79161234567");
  });

  it("should mask email addresses", () => {
    const text = "Пишите на admin@example.com для связи";
    const masked = maskPIIForTelegram(text);
    expect(masked).toContain("[EMAIL]");
    expect(masked).not.toContain("admin@example.com");
  });

  it("should mask full names (Russian format)", () => {
    const text = "Хозяйка Ирина Петрова грубила";
    const masked = maskPIIForTelegram(text);
    expect(masked).toContain("[NAME]");
    expect(masked).not.toContain("Ирина Петрова");
  });

  it("should mask multiple PII occurrences", () => {
    const text =
      "Иван Иванов: тел. +79001234567, email ivan@test.com";
    const masked = maskPIIForTelegram(text);
    expect(masked).toContain("[NAME]");
    expect(masked).toContain("[PHONE]");
    expect(masked).toContain("[EMAIL]");
    expect(masked).not.toContain("Иван Иванов");
    expect(masked).not.toContain("+79001234567");
    expect(masked).not.toContain("ivan@test.com");
  });

  it("should handle text without PII", () => {
    const text = "Чисто, уютно, всё понравилось";
    const masked = maskPIIForTelegram(text);
    expect(masked).toBe(text);
  });

  it("should handle empty text", () => {
    expect(maskPIIForTelegram("")).toBe("");
  });
});

// =============================================================================
// Message Builder Tests
// =============================================================================

describe("buildAlertMessage", () => {
  it("should include header with emoji", () => {
    const message = buildAlertMessage(mockPayload);
    expect(message).toContain("🚨");
    expect(message).toContain("HostGuard AI");
    expect(message).toContain("Обнаружен новый отзыв");
  });

  it("should include property name", () => {
    const message = buildAlertMessage(mockPayload);
    expect(message).toContain("Уютные апартаменты в центре");
  });

  it("should include platform name", () => {
    const message = buildAlertMessage(mockPayload);
    expect(message).toContain("avito");
  });

  it("should include rating stars", () => {
    const message = buildAlertMessage(mockPayload);
    expect(message).toContain("★");
    expect(message).toContain("2/5");
  });

  it("should include review date", () => {
    const message = buildAlertMessage(mockPayload);
    expect(message).toContain("2026-04-28");
  });

  it("should mask PII in review text", () => {
    const message = buildAlertMessage(mockPayload);
    expect(message).not.toContain("+79161234567");
    expect(message).not.toContain("admin@example.com");
    expect(message).not.toContain("Ирина Петрова");
    expect(message).toContain("[PHONE]");
    expect(message).toContain("[EMAIL]");
    expect(message).toContain("[NAME]");
  });

  it("should include public response draft", () => {
    const message = buildAlertMessage(mockPayload);
    expect(message).toContain("Черновик публичного ответа");
    expect(message).toContain("Приносим извинения");
  });

  it("should include appeal draft when violation detected", () => {
    const message = buildAlertMessage(mockPayload);
    expect(message).toContain("Черновик апелляции");
    expect(message).toContain("Уважаемая модерация Avito");
  });

  it("should include legal grounds when violation detected", () => {
    const message = buildAlertMessage(mockPayload);
    expect(message).toContain("Юридические основания");
    expect(message).toContain("п. 4.1 Правил Avito");
    expect(message).toContain("ст. 152 ГК РФ");
  });

  it("should include confidence percentage", () => {
    const message = buildAlertMessage(mockPayload);
    expect(message).toContain("85%");
  });

  it("should include action prompt", () => {
    const message = buildAlertMessage(mockPayload);
    expect(message).toContain("Выберите действие");
  });

  it("should not include appeal section when no violation", () => {
    const payloadWithoutViolation: ReviewAlertPayload = {
      ...mockPayload,
      violationDetected: false,
      appealText: undefined,
      appealConfidence: undefined,
      legalGrounds: undefined,
    };
    const message = buildAlertMessage(payloadWithoutViolation);
    expect(message).not.toContain("Черновик апелляции");
    expect(message).not.toContain("Юридические основания");
  });

  it("should not include review date when not provided", () => {
    const payloadWithoutDate: ReviewAlertPayload = {
      ...mockPayload,
      reviewDate: undefined,
    };
    const message = buildAlertMessage(payloadWithoutDate);
    expect(message).not.toContain("📅 **Дата:**");
  });
});

// =============================================================================
// Callback Data Parsing Tests
// =============================================================================

describe("parseCallbackData", () => {
  it("should parse approve callback", () => {
    expect(parseCallbackData(CALLBACK_DATA.APPROVE)).toBe("approved");
  });

  it("should parse edit callback", () => {
    expect(parseCallbackData(CALLBACK_DATA.EDIT)).toBe("edited");
  });

  it("should parse reject callback", () => {
    expect(parseCallbackData(CALLBACK_DATA.REJECT)).toBe("rejected");
  });

  it("should return null for unknown callback", () => {
    expect(parseCallbackData("unknown_action")).toBeNull();
  });

  it("should return null for empty string", () => {
    expect(parseCallbackData("")).toBeNull();
  });

  it("should parse callback with reviewId suffix", () => {
    // callback_data может содержать reviewId через разделитель
    // parseCallbackData смотрит только на префикс
    expect(parseCallbackData(`${CALLBACK_DATA.APPROVE}:review-uuid-123`)).toBe(
      "approved",
    );
    expect(parseCallbackData(`${CALLBACK_DATA.EDIT}:review-uuid-123`)).toBe(
      "edited",
    );
    expect(parseCallbackData(`${CALLBACK_DATA.REJECT}:review-uuid-123`)).toBe(
      "rejected",
    );
  });
});

// =============================================================================
// Message Length Tests
// =============================================================================

describe("Message formatting", () => {
  it("should produce a reasonably sized message", () => {
    const message = buildAlertMessage(mockPayload);
    // Telegram имеет лимит 4096 символов
    expect(message.length).toBeLessThan(4000);
    expect(message.length).toBeGreaterThan(100);
  });

  it("should use Markdown formatting", () => {
    const message = buildAlertMessage(mockPayload);
    expect(message).toContain("**");
    expect(message).toContain("> ");
  });

  it("should handle long review text", () => {
    const longText = "А".repeat(2000);
    const payloadWithLongText: ReviewAlertPayload = {
      ...mockPayload,
      reviewText: longText,
    };
    const message = buildAlertMessage(payloadWithLongText);
    expect(message.length).toBeLessThan(4000);
    expect(message).toContain(longText);
  });
});
