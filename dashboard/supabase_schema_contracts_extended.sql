-- Migration: Extend contracts table to support full contract and salary tracking fields from Excel
-- Run this in Supabase Dashboard > SQL Editor

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
