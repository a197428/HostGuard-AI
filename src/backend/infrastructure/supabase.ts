import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Owner, Property, PropertyUrl, Review, LLmCall, FeatureFlag, AgentMemory } from '@hostguard/shared';
import { OwnerSchema, PropertySchema, PropertyUrlSchema, ReviewSchema, LLmCallSchema, FeatureFlagSchema, AgentMemorySchema } from '@hostguard/shared/schemas';

export interface Database {
  public: {
    Tables: {
      owners: {
        Row: Owner;
        Insert: Omit<Owner, 'created_at' | 'updated_at' | 'is_deleted' | 'deleted_at'>;
        Update: Partial<Omit<Owner, 'id' | 'created_at'>>;
      };
      properties: {
        Row: Property;
        Insert: Omit<Property, 'created_at' | 'updated_at' | 'is_deleted' | 'deleted_at'>;
        Update: Partial<Omit<Property, 'id' | 'created_at'>>;
      };
      property_urls: {
        Row: PropertyUrl;
        Insert: Omit<PropertyUrl, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<PropertyUrl, 'id' | 'created_at'>>;
      };
      reviews: {
        Row: Review;
        Insert: Omit<Review, 'created_at' | 'updated_at' | 'is_deleted' | 'deleted_at'>;
        Update: Partial<Omit<Review, 'id' | 'created_at'>>;
      };
      llm_calls: {
        Row: LLmCall;
        Insert: Omit<LLmCall, 'id' | 'created_at'>;
        Update: never; // LLM calls are immutable
      };
      feature_flags: {
        Row: FeatureFlag;
        Insert: Omit<FeatureFlag, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<FeatureFlag, 'id' | 'created_at'>>;
      };
      agent_memory: {
        Row: AgentMemory;
        Insert: Omit<AgentMemory, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<AgentMemory, 'id' | 'created_at'>>;
      };
    };
  };
}

export function createSupabaseClient(
  supabaseUrl: string,
  supabaseKey: string,
  options?: {
    auth?: { persistSession?: boolean };
    global?: { headers?: Record<string, string> };
  }
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
  constructor(private client: SupabaseClient<Database>) {}

  // Owners
  async getOwner(id: string): Promise<Owner | null> {
    const { data, error } = await this.client
      .from('owners')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data ? validateOwner(data) : null;
  }

  async getOwnerByEmail(email: string): Promise<Owner | null> {
    const { data, error } = await this.client
      .from('owners')
      .select('*')
      .eq('email', email)
      .single();

    if (error) throw error;
    return data ? validateOwner(data) : null;
  }

  async createOwner(owner: Omit<Owner, 'id' | 'created_at' | 'updated_at'>): Promise<Owner> {
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
      .single();

    if (error) throw error;
    return data ? validateProperty(data) : null;
  }

  async createProperty(property: Omit<Property, 'id' | 'created_at' | 'updated_at'>): Promise<Property> {
    const { data, error } = await this.client
      .from('properties')
      .insert(property as Database['public']['Tables']['properties']['Insert'])
      .select()
      .single();

    if (error) throw error;
    return validateProperty(data);
  }

  async updateProperty(id: string, updates: Partial<Property>): Promise<Property> {
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
    url: string
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
    platformReviewId: string
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

  async createReview(review: Omit<Review, 'id' | 'created_at' | 'updated_at'>): Promise<Review> {
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
    call: Omit<LLmCall, 'id' | 'created_at'>
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
        .filter(f => !f.owner_ids || f.owner_ids.length === 0 || f.owner_ids.includes(ownerId))
        .map(validateFeatureFlag);
    }

    return data.map(validateFeatureFlag);
  }

  // Agent Memory
  async getAgentMemory(
    level: 'global' | 'local' | 'tactical',
    scope?: string
  ): Promise<AgentMemory[]> {
    let query = this.client
      .from('agent_memory')
      .select('*')
      .eq('level', level);

    if (scope) {
      query = query.eq('scope', scope);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data.map(validateAgentMemory);
  }

  async createAgentMemory(
    memory: Omit<AgentMemory, 'id' | 'created_at' | 'updated_at'>
  ): Promise<AgentMemory> {
    const { data, error } = await this.client
      .from('agent_memory')
      .insert(memory as Database['public']['Tables']['agent_memory']['Insert'])
      .select()
      .single();

    if (error) throw error;
    return validateAgentMemory(data);
  }

  async updateAgentMemory(id: string, updates: Partial<AgentMemory>): Promise<AgentMemory> {
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
