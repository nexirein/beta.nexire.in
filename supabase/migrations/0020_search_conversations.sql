-- 0020_search_conversations.sql
-- Creates the table to store conversational search sessions and their 5-stage states

CREATE TABLE public.search_conversations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Stores the chat history (array of { role: 'user' | 'assistant', content: string, widgetData?: jsonb })
    messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- Stores the running state of parsed filters (e.g., { technologies: [], location: null, seniority: [] })
    accumulated_context JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- The current state of the 5-stage machine
    status TEXT NOT NULL DEFAULT 'IDLE' CHECK (status IN ('IDLE', 'COLLECTING', 'RESOLVING', 'CONFIRMING', 'SEARCHING')),
    
    -- Used when the search is finally resolved and submitted to Prospeo
    prospeo_filters JSONB,
    estimated_matches INTEGER,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Turn on Row Level Security
ALTER TABLE public.search_conversations ENABLE ROW LEVEL SECURITY;

-- Users can only see their own conversations
CREATE POLICY "Users can insert their own search conversations"
    ON public.search_conversations FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own search conversations"
    ON public.search_conversations FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own search conversations"
    ON public.search_conversations FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own search conversations"
    ON public.search_conversations FOR DELETE
    USING (auth.uid() = user_id);

-- Update trigger for updated_at
CREATE TRIGGER update_search_conversations_modtime
    BEFORE UPDATE ON public.search_conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();
