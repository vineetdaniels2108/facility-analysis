-- ==============================================================================
-- Simpl AI - Initial Supabase Schema
-- ==============================================================================

-- 1. Facilities Table
CREATE TABLE facilities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- e.g., 'Psychiatry', 'Psychology', 'Rehab'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert Mock Facilities
INSERT INTO facilities (name, type) VALUES
    ('Simpl Psychiatry Center', 'Psychiatry'),
    ('Peak Psychology Clinic', 'Psychology'),
    ('Marine Creek Treatment', 'Rehab');

-- 2. Users Table (Extends Supabase Auth Auth.users)
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    role TEXT NOT NULL DEFAULT 'user', -- e.g., 'admin', 'doctor', 'nurse'
    facility_id UUID REFERENCES facilities(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Basic Policies (Adjust as needed for stricter access control)
-- Allow authenticated users to view facilities
CREATE POLICY "Allow authenticated read access on facilities" ON facilities
    FOR SELECT USING (auth.role() = 'authenticated');

-- Allow authenticated users to view users
CREATE POLICY "Allow authenticated read access on users" ON users
    FOR SELECT USING (auth.role() = 'authenticated');

-- Allow users to update their own profile
CREATE POLICY "Allow users to update own profile" ON users
    FOR UPDATE USING (auth.uid() = id);
