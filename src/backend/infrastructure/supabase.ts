import {
	AgentMemory,
	FeatureFlag,
	LLmCall,
	Owner,
	Property,
	PropertyUrl,
	Review,
} from '@hostguard/shared';
import {
	AgentMemorySchema,
	FeatureFlagSchema,
	LLmCallSchema,
	OwnerSchema,
	PropertySchema,
	PropertyUrlSchema,
	ReviewSchema,
} from '@hostguard/shared/schemas';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

type Insertable<T, OmittedKeys extends keyof T = never> = Omit<
	T,
	'id' | 'created_at' | 'updated_at' | OmittedKeys
> &
	Partial<Pick<T, Extract<'id' | 'created_at' | 'updated_at', keyof T>>>;

export interface Database {
	public: {
		Tables: {
			owners: {
				Row: Owner;
				Insert: Insertable<Owner, 'is_deleted' | 'deleted_at'>;
				Update: Partial<Omit<Owner, 'id' | 'created_at'>>;
				Relationships: [];
			};
			properties: {
				Row: Property;
				Insert: Insertable<Property, 'is_deleted' | 'deleted_at'>;
				Update: Partial<Omit<Property, 'id' | 'created_at'>>;
				Relationships: [];
			};
			property_urls: {
				Row: PropertyUrl;
				Insert: Insertable<PropertyUrl>;
				Update: Partial<Omit<PropertyUrl, 'id' | 'created_at'>>;
				Relationships: [];
			};
			reviews: {
				Row: Review;
				Insert: Insertable<Review, 'is_deleted' | 'deleted_at'>;
				Update: Partial<Omit<Review, 'id' | 'created_at'>>;
				Relationships: [];
			};
			llm_calls: {
				Row: LLmCall;
				Insert: Insertable<LLmCall>;
				Update: never; // LLM calls are immutable
				Relationships: [];
			};
			feature_flags: {
				Row: FeatureFlag;
				Insert: Insertable<FeatureFlag>;
				Update: Partial<Omit<FeatureFlag, 'id' | 'created_at'>>;
				Relationships: [];
			};
			agent_memory: {
				Row: AgentMemory;
				Insert: Insertable<AgentMemory>;
				Update: Partial<Omit<AgentMemory, 'id' | 'created_at'>>;
				Relationships: [];
			};
		};
		Views: Record<string, never>;
		Functions: Record<string, never>;
		Enums: Record<string, never>;
	};
}

export function createSupabaseClient(
	supabaseUrl: string,
	supabaseKey: string,
	options?: {
		auth?: { persistSession?: boolean };
		global?: { headers?: Record<string, string> };
	},
): SupabaseClient<Database> {
	return createClient<Database>(supabaseUrl, supabaseKey, {
		auth: options?.auth,
		global: options?.global,
	});
}

// Validation helpers using Zod schemas from shared
export function validateOwner(data: unknown): Owner {
	return OwnerSchema.parse(data);
}

export function validateProperty(data: unknown): Property {
	return PropertySchema.parse(data);
}

export function validatePropertyUrl(data: unknown): PropertyUrl {
	return PropertyUrlSchema.parse(data);
}

export function validateReview(data: unknown): Review {
	return ReviewSchema.parse(data);
}

export function validateLLmCall(data: unknown): LLmCall {
	return LLmCallSchema.parse(data);
}

export function validateFeatureFlag(data: unknown): FeatureFlag {
	return FeatureFlagSchema.parse(data);
}

export function validateAgentMemory(data: unknown): AgentMemory {
	return AgentMemorySchema.parse(data);
}

// =============================================================================
// Repository pattern for data access
// =============================================================================

export class SupabaseRepository {
	constructor(public client: SupabaseClient<Database>) {}

	// Owners
	async getOwner(id: string): Promise<Owner | null> {
		const { data, error } = await this.client
			.from('owners')
			.select('*')
			.eq('id', id)
			.maybeSingle();

		if (error) throw error;
		return data ? validateOwner(data) : null;
	}

	async getOwnerByEmail(email: string): Promise<Owner | null> {
		const { data, error } = await this.client
			.from('owners')
			.select('*')
			.eq('email', email)
			.maybeSingle();

		if (error) throw error;
		return data ? validateOwner(data) : null;
	}

	async createOwner(
		owner: Database['public']['Tables']['owners']['Insert'],
	): Promise<Owner> {
		const { data, error } = await this.client
			.from('owners')
			.insert(owner as Database['public']['Tables']['owners']['Insert'])
			.select()
			.single();

		if (error) throw error;
		return validateOwner(data);
	}

	// Properties
	async getProperties(ownerId: string): Promise<Property[]> {
		const { data, error } = await this.client
			.from('properties')
			.select('*')
			.eq('owner_id', ownerId)
			.eq('is_deleted', false);

		if (error) throw error;
		return data.map(validateProperty);
	}

	async getProperty(id: string): Promise<Property | null> {
		const { data, error } = await this.client
			.from('properties')
			.select('*')
			.eq('id', id)
			.maybeSingle();

		if (error) throw error;
		return data ? validateProperty(data) : null;
	}

	async createProperty(
		property: Database['public']['Tables']['properties']['Insert'],
	): Promise<Property> {
		const { data, error } = await this.client
			.from('properties')
			.insert(property as Database['public']['Tables']['properties']['Insert'])
			.select()
			.single();

		if (error) throw error;
		return validateProperty(data);
	}

	async updateProperty(
		id: string,
		updates: Partial<Property>,
	): Promise<Property> {
		const { data, error } = await this.client
			.from('properties')
			.update(updates as Database['public']['Tables']['properties']['Update'])
			.eq('id', id)
			.select()
			.single();

		if (error) throw error;
		return validateProperty(data);
	}

	// Property URLs
	async getPropertyUrls(propertyId: string): Promise<PropertyUrl[]> {
		const { data, error } = await this.client
			.from('property_urls')
			.select('*')
			.eq('property_id', propertyId);

		if (error) throw error;
		return data.map(validatePropertyUrl);
	}

	async createPropertyUrl(
		propertyId: string,
		platform: 'avito' | 'ostrovok' | 'yandex',
		url: string,
	): Promise<PropertyUrl> {
		const { data, error } = await this.client
			.from('property_urls')
			.insert({ property_id: propertyId, platform, url })
			.select()
			.single();

		if (error) throw error;
		return validatePropertyUrl(data);
	}

	// Reviews
	async getReviews(propertyId: string): Promise<Review[]> {
		const { data, error } = await this.client
			.from('reviews')
			.select('*')
			.eq('property_id', propertyId)
			.eq('is_deleted', false)
			.order('created_at', { ascending: false });

		if (error) throw error;
		return data.map(validateReview);
	}

	async getReviewByPlatformId(
		platform: 'avito' | 'ostrovok' | 'yandex',
		platformReviewId: string,
	): Promise<Review | null> {
		const { data, error } = await this.client
			.from('reviews')
			.select('*')
			.eq('platform', platform)
			.eq('platform_review_id', platformReviewId)
			.single();

		if (error) throw error;
		return data ? validateReview(data) : null;
	}

	async createReview(
		review: Database['public']['Tables']['reviews']['Insert'],
	): Promise<Review> {
		const { data, error } = await this.client
			.from('reviews')
			.insert(review as Database['public']['Tables']['reviews']['Insert'])
			.select()
			.single();

		if (error) throw error;
		return validateReview(data);
	}

	async updateReview(id: string, updates: Partial<Review>): Promise<Review> {
		const { data, error } = await this.client
			.from('reviews')
			.update(updates as Database['public']['Tables']['reviews']['Update'])
			.eq('id', id)
			.select()
			.single();

		if (error) throw error;
		return validateReview(data);
	}

	// LLM Calls (audit log)
	async createLLmCall(
		call: Database['public']['Tables']['llm_calls']['Insert'],
	): Promise<LLmCall> {
		const { data, error } = await this.client
			.from('llm_calls')
			.insert(call as Database['public']['Tables']['llm_calls']['Insert'])
			.select()
			.single();

		if (error) throw error;
		return validateLLmCall(data);
	}

	// Feature Flags
	async getFeatureFlag(name: string): Promise<FeatureFlag | null> {
		const { data, error } = await this.client
			.from('feature_flags')
			.select('*')
			.eq('name', name)
			.single();

		if (error) throw error;
		return data ? validateFeatureFlag(data) : null;
	}

	async getEnabledFeatureFlags(ownerId?: string): Promise<FeatureFlag[]> {
		let query = this.client
			.from('feature_flags')
			.select('*')
			.eq('enabled', true);

		const { data, error } = await query;

		if (error) throw error;

		// Filter by owner_id if specified (for canary deployments)
		if (ownerId) {
			return data
				.filter(
					f =>
						!f.owner_ids ||
						f.owner_ids.length === 0 ||
						f.owner_ids.includes(ownerId),
				)
				.map(validateFeatureFlag);
		}

		return data.map(validateFeatureFlag);
	}

	// Agent Memory
	async getAgentMemory(
		level: 'global' | 'local' | 'tactical',
		scope?: string,
	): Promise<AgentMemory[]> {
		let query = this.client.from('agent_memory').select('*').eq('level', level);

		if (scope) {
			query = query.eq('scope', scope);
		}

		const { data, error } = await query;

		if (error) throw error;
		return data.map(validateAgentMemory);
	}

	async createAgentMemory(
		memory: Database['public']['Tables']['agent_memory']['Insert'],
	): Promise<AgentMemory> {
		const { data, error } = await this.client
			.from('agent_memory')
			.insert(memory as Database['public']['Tables']['agent_memory']['Insert'])
			.select()
			.single();

		if (error) throw error;
		return validateAgentMemory(data);
	}

	async updateAgentMemory(
		id: string,
		updates: Partial<AgentMemory>,
	): Promise<AgentMemory> {
		const { data, error } = await this.client
			.from('agent_memory')
			.update(updates as Database['public']['Tables']['agent_memory']['Update'])
			.eq('id', id)
			.select()
			.single();

		if (error) throw error;
		return validateAgentMemory(data);
	}
}
// =============================================================================
// Mock Repository for Testing
// =============================================================================

export class MockSupabaseRepository implements SupabaseRepository {
	client = undefined as unknown as SupabaseClient<Database>;
	async getOwner(id: string): Promise<Owner | null> {
		return {
			id,
			telegram_id: 123456789,
			email: 'test@example.com',
			tone_of_voice: 'official',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			is_deleted: false,
		};
	}

	async getOwnerByEmail(email: string): Promise<Owner | null> {
		return null;
	}

	async createOwner(
		owner: Database['public']['Tables']['owners']['Insert'],
	): Promise<Owner> {
		return {
			id: '550e8400-e29b-41d4-a716-446655440001',
			email: owner.email,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			is_deleted: false,
		};
	}

	async getProperties(ownerId: string): Promise<Property[]> {
		return [
			{
				id: '550e8400-e29b-41d4-a716-446655440000',
				owner_id: ownerId,
				name: 'Test Property',
				monitoring_interval: 60,
				is_monitoring_active: true,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				is_deleted: false,
			},
		];
	}

	async getProperty(id: string): Promise<Property | null> {
		return {
			id,
			owner_id: '550e8400-e29b-41d4-a716-446655440001',
			name: 'Test Property',
			monitoring_interval: 60,
			is_monitoring_active: true,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			is_deleted: false,
		};
	}

	async createProperty(
		property: Database['public']['Tables']['properties']['Insert'],
	): Promise<Property> {
		return {
			id: '550e8400-e29b-41d4-a716-446655440000',
			owner_id: property.owner_id,
			name: property.name || 'Test Property',
			monitoring_interval: property.monitoring_interval || 60,
			is_monitoring_active: property.is_monitoring_active ?? true,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			is_deleted: false,
		};
	}

	async updateProperty(
		id: string,
		updates: Partial<Property>,
	): Promise<Property> {
		return {
			id,
			owner_id: '550e8400-e29b-41d4-a716-446655440001',
			name: updates.name || 'Test Property',
			monitoring_interval: updates.monitoring_interval || 60,
			is_monitoring_active: updates.is_monitoring_active ?? true,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			is_deleted: updates.is_deleted ?? false,
		};
	}

	async getPropertyUrls(propertyId: string): Promise<PropertyUrl[]> {
		return [
			{
				id: '550e8400-e29b-41d4-a716-446655440001',
				property_id: propertyId,
				platform: 'avito',
				url: 'https://avito.ru/test',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			},
		];
	}

	async createPropertyUrl(
		propertyId: string,
		platform: 'avito' | 'ostrovok' | 'yandex',
		url: string,
	): Promise<PropertyUrl> {
		return {
			id: '550e8400-e29b-41d4-a716-446655440001',
			property_id: propertyId,
			platform,
			url,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		};
	}

	async getReviews(propertyId: string): Promise<Review[]> {
		return [];
	}

	async getReviewByPlatformId(
		platform: 'avito' | 'ostrovok' | 'yandex',
		platformReviewId: string,
	): Promise<Review | null> {
		return null;
	}

	async createReview(
		review: Database['public']['Tables']['reviews']['Insert'],
	): Promise<Review> {
		return {
			id: 'review_123',
			property_id: review.property_id,
			owner_id: review.owner_id,
			platform: review.platform,
			platform_review_id: review.platform_review_id,
			rating: review.rating,
			text: review.text,
			review_date: review.review_date,
			sentiment: review.sentiment,
			violation_detected: review.violation_detected,
			violations: review.violations || [],
			public_response: review.public_response,
			appeal_text: review.appeal_text,
			appeal_confidence: review.appeal_confidence,
			legal_grounds: review.legal_grounds,
			status: review.status,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			is_deleted: false,
		};
	}

	async updateReview(id: string, updates: Partial<Review>): Promise<Review> {
		return {
			id,
			property_id: '550e8400-e29b-41d4-a716-446655440000',
			owner_id: '550e8400-e29b-41d4-a716-446655440001',
			platform: 'avito',
			platform_review_id: 'review_123',
			rating: 5,
			text: 'Test review',
			review_date: new Date().toISOString(),
			sentiment: 'positive',
			violation_detected: false,
			violations: [],
			public_response: 'Thank you',
			appeal_text: undefined,
			appeal_confidence: undefined,
			legal_grounds: undefined,
			status: 'draft_ready',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			is_deleted: false,
			...updates,
		};
	}

	async createLLmCall(
		llmCall: Database['public']['Tables']['llm_calls']['Insert'],
	): Promise<LLmCall> {
		return {
			id: 'llm_call_123',
			owner_id: llmCall.owner_id,
			review_id: llmCall.review_id,
			model: llmCall.model,
			prompt_id: llmCall.prompt_id,
			prompt_version: llmCall.prompt_version,
			input_tokens: llmCall.input_tokens,
			output_tokens: llmCall.output_tokens,
			latency_ms: llmCall.latency_ms,
			trace_id: llmCall.trace_id,
			response_status: llmCall.response_status,
			created_at: new Date().toISOString(),
		};
	}

	async getFeatureFlag(name: string): Promise<FeatureFlag | null> {
		return null;
	}

	async getEnabledFeatureFlags(ownerId?: string): Promise<FeatureFlag[]> {
		return [];
	}

	async getAgentMemory(
		level: 'global' | 'local' | 'tactical',
		scope?: string,
	): Promise<AgentMemory[]> {
		return [];
	}

	async createAgentMemory(
		memory: Database['public']['Tables']['agent_memory']['Insert'],
	): Promise<AgentMemory> {
		return {
			id: 'memory_123',
			level: memory.level,
			scope: memory.scope,
			content: memory.content,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		};
	}

	async updateAgentMemory(
		id: string,
		updates: Partial<AgentMemory>,
	): Promise<AgentMemory> {
		return {
			id,
			level: 'global',
			scope: 'test',
			content: { test: 'value' },
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			...updates,
		};
	}
}
