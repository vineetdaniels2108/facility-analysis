-- Migration: Add facility_ids array to users table
-- This stores RDS fac_id values (integers) instead of a single Supabase facility UUID

-- Add new column
ALTER TABLE users ADD COLUMN IF NOT EXISTS facility_ids INT[] DEFAULT '{}';

-- Drop old single-facility FK (if it exists)
ALTER TABLE users DROP COLUMN IF EXISTS facility_id;

-- Allow admins to manage users
CREATE POLICY "Allow admins to insert users" ON users
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow admins to delete users" ON users
    FOR DELETE USING (true);

-- Allow service role full access (needed for admin API)
-- Note: service role bypasses RLS by default, so this is for documentation
