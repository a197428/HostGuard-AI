import { z } from 'zod';

// =============================================================================
// Platform & Enums
// =============================================================================

export const PlatformSchema = z.enum(['avito', 'ostrovok', 'yandex']);
export type Platform = z.infer<typeof PlatformSchema>;

export const SentimentSchema = z.enum(['positive', 'neutral', 'negative']);
export type Sentiment = z.infer<typeof SentimentSchema>;

export const ReviewStatusSchema = z.enum([
  'new',
  'draft_ready',
  'approved',
  'edited',
  'rejected',
  'appeal_sent',
  'appeal_success',
  'appeal_denied',
]);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

export const ViolationTypeSchema = z.enum([
  'insult',
  'profanity',
  'personal_data',
  'competitor_ads',
  'discrimination',
]);
export type ViolationType = z.infer<typeof ViolationTypeSchema>;

export const AgentMemoryLevelSchema = z.enum(['global', 'local', 'tactical']);
export type AgentMemoryLevel = z.infer<typeof AgentMemoryLevelSchema>;

export const LLMProviderSchema = z.enum(['deepseek', 'gpt-4o-mini']);
export type LLMProvider = z.infer<typeof LLMProviderSchema>;

export const LegalGroundSourceSchema = z.enum(['platform_rules', 'gk_rf', 'uk_rf']);
export type LegalGroundSource = z.infer<typeof LegalGroundSourceSchema>;

export const AppealRecommendationActionSchema = z.enum(['approve', 'review_carefully', 'reject']);
export type AppealRecommendationAction = z.infer<typeof AppealRecommendationActionSchema>;

// =============================================================================
// Supabase Tables
// =============================================================================

// owners – Владельцы объектов (отельеры)
export const OwnerSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  telegram_id: z.number().int().optional(),
  tone_of_voice: z.string().optional(),
  greeting_template: z.string().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  is_deleted: z.boolean().default(false),
  deleted_at: z.string().datetime().optional(),
});
export type Owner = z.infer<typeof OwnerSchema>;

// properties – Объекты недвижимости (апартаменты, отели)
export const PropertySchema = z.object({
  id: z.string().uuid(),
  owner_id: z.string().uuid(),
  name: z.string(),
  address: z.string().optional(),
  features: z.record(z.unknown()).optional(),
  typical_complaints: z.array(z.string()).optional(),
  monitoring_interval: z.number().int().default(120),
  is_monitoring_active: z.boolean().default(true),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  is_deleted: z.boolean().default(false),
  deleted_at: z.string().datetime().optional(),
});
export type Property = z.infer<typeof PropertySchema>;

// property_urls – URL карточек объекта на разных площадках
export const PropertyUrlSchema = z.object({
  id: z.string().uuid(),
  property_id: z.string().uuid(),
  platform: PlatformSchema,
  url: z.string().url(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type PropertyUrl = z.infer<typeof PropertyUrlSchema>;

// reviews – Собранные отзывы
export const ReviewSchema = z.object({
  id: z.string().uuid(),
  property_id: z.string().uuid(),
  owner_id: z.string().uuid(),
  platform: PlatformSchema,
  platform_review_id: z.string(),
  author_name_hash: z.string().optional(),
  rating: z.number().int().min(1).max(5),
  text: z.string(),
  review_date: z.string().datetime().optional(),
  sentiment: SentimentSchema.optional(),
  violation_detected: z.boolean().default(false),
  violations: z.array(z.unknown()).optional(),
  public_response: z.string().optional(),
  public_response_edited: z.string().optional(),
  appeal_text: z.string().optional(),
  appeal_confidence: z.number().min(0).max(1).optional(),
  legal_grounds: z.array(z.unknown()).optional(),
  status: ReviewStatusSchema.default('new'),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  is_deleted: z.boolean().default(false),
  deleted_at: z.string().datetime().optional(),
});
export type Review = z.infer<typeof ReviewSchema>;

// llm_calls – Audit log для каждого вызова LLM
export const LLmCallResponseStatusSchema = z.enum(['success', 'validation_error', 'retry', 'fallback']);
export type LLmCallResponseStatus = z.infer<typeof LLmCallResponseStatusSchema>;

export const LLmCallSchema = z.object({
  id: z.string().uuid(),
  owner_id: z.string().uuid(),
  review_id: z.string().uuid().optional(),
  model: LLMProviderSchema,
  prompt_id: z.string(),
  prompt_version: z.string(),
  input_tokens: z.number().int(),
  output_tokens: z.number().int(),
  latency_ms: z.number().int(),
  trace_id: z.string(),
  response_status: LLmCallResponseStatusSchema,
  created_at: z.string().datetime(),
});
export type LLmCall = z.infer<typeof LLmCallSchema>;

// feature_flags – Управление канареечными развёртываниями
export const FeatureFlagSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  enabled: z.boolean().default(false),
  rollout_percentage: z.number().int().min(0).max(100).default(0),
  owner_ids: z.array(z.string().uuid()).optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;

// agent_memory – Долгосрочная память агента
export const AgentMemoryScopeSchema = z.object({
  platform: PlatformSchema.optional(),
  property_id: z.string().uuid().optional(),
  case_type: z.string().optional(),
});
export type AgentMemoryScope = z.infer<typeof AgentMemoryScopeSchema>;

export const AgentMemorySchema = z.object({
  id: z.string().uuid(),
  level: AgentMemoryLevelSchema,
  scope: z.string().optional(),
  content: z.record(z.unknown()),
  embedding: z.array(z.number()).optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type AgentMemory = z.infer<typeof AgentMemorySchema>;

// =============================================================================
// AI JSON Response Structure (from PROMPTS.md)
// =============================================================================

// Stay Verification
export const StayVerificationSchema = z.object({
  guest_stayed: z.boolean().nullable(),
  evidence: z.string(),
});
export type StayVerification = z.infer<typeof StayVerificationSchema>;

// Violation
export const ViolationSchema = z.object({
  type: ViolationTypeSchema,
  description: z.string(),
  rule_reference: z.string(),
});
export type Violation = z.infer<typeof ViolationSchema>;

// Legal Ground
export const LegalGroundSchema = z.object({
  source: LegalGroundSourceSchema,
  article: z.string(),
  citation: z.string(),
});
export type LegalGround = z.infer<typeof LegalGroundSchema>;

// Public Response
export const PublicResponseSchema = z.object({
  text: z.string(),
  tone: z.string(),
});
export type PublicResponse = z.infer<typeof PublicResponseSchema>;

// Appeal
export const AppealSchema = z.object({
  text: z.string(),
  legal_grounds: z.array(LegalGroundSchema).min(1),
  confidence: z.number().min(0).max(1),
});
export type Appeal = z.infer<typeof AppealSchema>;

// Recommendation
export const RecommendationSchema = z.object({
  action: AppealRecommendationActionSchema,
  reason: z.string(),
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

// Main AI Response (Appeal Agent)
export const AppealAgentResponseSchema = z.object({
  review_id: z.string(),
  platform: PlatformSchema,
  sentiment: SentimentSchema,
  violation_detected: z.boolean(),
  stay_verification: StayVerificationSchema,
  violations: z.array(ViolationSchema),
  public_response: PublicResponseSchema,
  appeal: AppealSchema.optional(),
  recommendation: RecommendationSchema,
});
export type AppealAgentResponse = z.infer<typeof AppealAgentResponseSchema>;

// =============================================================================
// Validation Helpers
// =============================================================================

export function validateSchema<T extends z.ZodType>(
  schema: T,
  data: unknown,
): z.infer<T> {
  return schema.parse(data);
}

export function safeValidateSchema<T extends z.ZodType>(
  schema: T,
  data: unknown,
): { success: true; data: z.infer<T> } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
