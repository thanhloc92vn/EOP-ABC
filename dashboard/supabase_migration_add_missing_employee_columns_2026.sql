-- Migration: Add missing employee columns to match Excel template (Image 1)
-- Run this in Supabase Dashboard > SQL Editor

ALTER TABLE employees ADD COLUMN IF NOT EXISTS cccd_date TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS cccd_place TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS permanent_address TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS temporary_address TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact_relationship TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;
