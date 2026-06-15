-- SQL Schema to configure Row Level Security (RLS) policies for candidates table
-- Copy this query, go to Supabase -> SQL Editor -> New Query, paste and run it.

-- Enable Row-Level Security (RLS)
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;

-- Drop and recreate public access policies to allow read/write from client
DROP POLICY IF EXISTS "Allow public select for candidates" ON public.candidates;
CREATE POLICY "Allow public select for candidates" ON public.candidates FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert for candidates" ON public.candidates;
CREATE POLICY "Allow public insert for candidates" ON public.candidates FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update for candidates" ON public.candidates;
CREATE POLICY "Allow public update for candidates" ON public.candidates FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete for candidates" ON public.candidates;
CREATE POLICY "Allow public delete for candidates" ON public.candidates FOR DELETE USING (true);
