-- HostGuard AI - Owner Decisions Log
-- Таблица для логирования решений владельца, принятых через Telegram
-- Version: 003
-- Created: 2026-04-30

-- =============================================================================
-- Table: owner_decisions
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.owner_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES public.owners(id) ON DELETE CASCADE,
    decision TEXT NOT NULL CHECK (decision IN ('approved', 'edited', 'rejected')),
    source TEXT NOT NULL DEFAULT 'telegram' CHECK (source IN ('telegram', 'dashboard', 'api')),
    telegram_message_id BIGINT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_owner_decisions_review_id ON public.owner_decisions(review_id);
CREATE INDEX IF NOT EXISTS idx_owner_decisions_owner_id ON public.owner_decisions(owner_id);
CREATE INDEX IF NOT EXISTS idx_owner_decisions_decision ON public.owner_decisions(decision);
CREATE INDEX IF NOT EXISTS idx_owner_decisions_created_at ON public.owner_decisions(created_at);

-- =============================================================================
-- RLS Policies
-- =============================================================================

ALTER TABLE public.owner_decisions ENABLE ROW LEVEL SECURITY;

-- Owners can see their own decisions
CREATE POLICY "owner_decisions_select_own" ON public.owner_decisions
    FOR SELECT USING (owner_id = auth.uid());

-- Owners can insert their own decisions
CREATE POLICY "owner_decisions_insert_own" ON public.owner_decisions
    FOR INSERT WITH CHECK (owner_id = auth.uid());

-- Service role can do all operations
CREATE POLICY "owner_decisions_service_role_all" ON public.owner_decisions
    FOR ALL USING (true) WITH CHECK (true);
