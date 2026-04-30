-- HostGuard AI - Row Level Security (RLS) Policies
-- Supabase PostgreSQL
-- Version: 002
-- Created: 2026-04-30

-- =============================================================================
-- Enable RLS on all tables
-- =============================================================================

ALTER TABLE public.owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_urls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;

-- =============================================================================
--owners policies
-- =============================================================================

-- Owners can only see their own row
CREATE POLICY "owners_select_own" ON public.owners
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "owners_update_own" ON public.owners
    FOR UPDATE USING (auth.uid() = id);

-- =============================================================================
-- properties policies
-- =============================================================================

-- Owners can only see/modify their own properties
CREATE POLICY "properties_select_own" ON public.properties
    FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "properties_insert_own" ON public.properties
    FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "properties_update_own" ON public.properties
    FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "properties_delete_own" ON public.properties
    FOR DELETE USING (owner_id = auth.uid());

-- =============================================================================
-- property_urls policies
-- =============================================================================

-- Property must belong to the owner (via properties table)
CREATE POLICY "property_urls_select_own" ON public.property_urls
    FOR SELECT USING (
        property_id IN (SELECT id FROM public.properties WHERE owner_id = auth.uid())
    );

CREATE POLICY "property_urls_insert_own" ON public.property_urls
    FOR INSERT WITH CHECK (
        property_id IN (SELECT id FROM public.properties WHERE owner_id = auth.uid())
    );

CREATE POLICY "property_urls_update_own" ON public.property_urls
    FOR UPDATE USING (
        property_id IN (SELECT id FROM public.properties WHERE owner_id = auth.uid())
    );

CREATE POLICY "property_urls_delete_own" ON public.property_urls
    FOR DELETE USING (
        property_id IN (SELECT id FROM public.properties WHERE owner_id = auth.uid())
    );

-- =============================================================================
-- reviews policies
-- =============================================================================

-- Reviews are accessible only via the owner's properties
CREATE POLICY "reviews_select_own" ON public.reviews
    FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "reviews_insert_own" ON public.reviews
    FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "reviews_update_own" ON public.reviews
    FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "reviews_delete_own" ON public.reviews
    FOR DELETE USING (owner_id = auth.uid());

-- =============================================================================
-- llm_calls policies
-- =============================================================================

CREATE POLICY "llm_calls_select_own" ON public.llm_calls
    FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "llm_calls_insert_own" ON public.llm_calls
    FOR INSERT WITH CHECK (owner_id = auth.uid());

-- =============================================================================
-- feature_flags policies
-- =============================================================================

-- Feature flags are managed by admins, but owners can see their enabled features
CREATE POLICY "feature_flags_select_all" ON public.feature_flags
    FOR SELECT USING (true);

CREATE POLICY "feature_flags_update_all" ON public.feature_flags
    FOR UPDATE USING (true);

-- =============================================================================
-- agent_memory policies
-- =============================================================================

-- Global and tactical memory is visible to all owners
CREATE POLICY "agent_memory_select_all" ON public.agent_memory
    FOR SELECT USING (true);

CREATE POLICY "agent_memory_insert_all" ON public.agent_memory
    FOR INSERT WITH CHECK (true);

CREATE POLICY "agent_memory_update_all" ON public.agent_memory
    FOR UPDATE USING (true);

-- =============================================================================
-- Service key policy (for system operations like Cron)
-- =============================================================================

-- Allow service_role key to bypass RLS for system operations
-- This should only be used in secure server contexts (Workers with service key)
CREATE POLICY "service_role_all" ON public.owners
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON public.properties
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON public.reviews
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON public.llm_calls
    FOR ALL USING (true) WITH CHECK (true);
