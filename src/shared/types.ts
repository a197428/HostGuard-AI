// Domain types for HostGuard AI
// These types complement the Zod schemas in schemas.ts

export type Owner = {
  id: string;
  email: string;
  telegram_id?: number;
  tone_of_voice?: string;
  greeting_template?: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  deleted_at?: string;
};

export type Property = {
  id: string;
  owner_id: string;
  name: string;
  address?: string;
  features?: Record<string, unknown>;
  typical_complaints?: string[];
  monitoring_interval: number;
  is_monitoring_active: boolean;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  deleted_at?: string;
};

export type PropertyUrl = {
  id: string;
  property_id: string;
  platform: "avito" | "ostrovok" | "yandex";
  url: string;
  created_at: string;
  updated_at: string;
};

export type Review = {
  id: string;
  property_id: string;
  owner_id: string;
  platform: "avito" | "ostrovok" | "yandex";
  platform_review_id: string;
  author_name_hash?: string;
  rating: number;
  text: string;
  review_date?: string;
  sentiment?: "positive" | "neutral" | "negative";
  violation_detected: boolean;
  violations?: unknown[];
  public_response?: string;
  public_response_edited?: string;
  appeal_text?: string;
  appeal_confidence?: number;
  legal_grounds?: unknown[];
  status: ReviewStatus;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  deleted_at?: string;
};

export type ReviewStatus =
  | "new"
  | "draft_ready"
  | "approved"
  | "edited"
  | "rejected"
  | "appeal_sent"
  | "appeal_success"
  | "appeal_denied";

export type Platform = "avito" | "ostrovok" | "yandex";

export type Sentiment = "positive" | "neutral" | "negative";

export type ViolationType =
  | "insult"
  | "profanity"
  | "personal_data"
  | "competitor_ads"
  | "discrimination";

export type AgentMemoryLevel = "global" | "local" | "tactical";

export type LLMProvider = "deepseek" | "gpt-4o-mini";

export type LegalGroundSource = "platform_rules" | "gk_rf" | "uk_rf";

export type AppealRecommendationAction =
  | "approve"
  | "review_carefully"
  | "reject";
