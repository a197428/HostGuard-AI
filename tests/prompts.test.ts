import { describe, expect, it } from "vitest";
import { PROMPTS } from "../src/shared/prompts";

describe("Prompt PII masking", () => {
  it("masks names, phones, and emails before LLM input", () => {
    const masked = PROMPTS.maskPII(
      "Иван Иванов написал на owner@example.com и оставил +79161234567.",
    );

    expect(masked).toContain("[NAME]");
    expect(masked).toContain("[EMAIL]");
    expect(masked).toContain("[PHONE]");
    expect(masked).not.toContain("Иван Иванов");
    expect(masked).not.toContain("owner@example.com");
    expect(masked).not.toContain("+79161234567");
  });
});
