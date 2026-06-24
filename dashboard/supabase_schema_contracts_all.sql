-- Migration: Extend contracts table and configure RLS policies
-- Copy this query, go to Supabase Dashboard -> SQL Editor -> New Query, paste and run it.

-- 1. Extend columns in contracts table
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS stt_ton TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS stt INTEGER;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS employee_code TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS employee_name TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS onboard_date DATE;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS probation_contract_number TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS probation_start_date DATE;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS probation_end_date DATE;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS base_salary_insurance NUMERIC;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS performance_bonus NUMERIC;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS allowances NUMERIC;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS total_income NUMERIC;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS last_salary_adj_date DATE;

-- 2. Configure RLS Policies
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public select for contracts" ON public.contracts;
CREATE POLICY "Allow public select for contracts" ON public.contracts FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert for contracts" ON public.contracts;
CREATE POLICY "Allow public insert for contracts" ON public.contracts FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update for contracts" ON public.contracts;
CREATE POLICY "Allow public update for contracts" ON public.contracts FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete for contracts" ON public.contracts;
CREATE POLICY "Allow public delete for contracts" ON public.contracts FOR DELETE USING (true);
