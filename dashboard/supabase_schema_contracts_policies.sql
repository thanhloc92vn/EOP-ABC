-- SQL Schema to configure Row Level Security (RLS) policies for contracts table
-- Copy this query, go to Supabase -> SQL Editor -> New Query, paste and run it.

-- Enable Row-Level Security (RLS)
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

-- Drop and recreate public access policies to allow read/write from client
DROP POLICY IF EXISTS "Allow public select for contracts" ON public.contracts;
CREATE POLICY "Allow public select for contracts" ON public.contracts FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert for contracts" ON public.contracts;
CREATE POLICY "Allow public insert for contracts" ON public.contracts FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update for contracts" ON public.contracts;
CREATE POLICY "Allow public update for contracts" ON public.contracts FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete for contracts" ON public.contracts;
CREATE POLICY "Allow public delete for contracts" ON public.contracts FOR DELETE USING (true);
