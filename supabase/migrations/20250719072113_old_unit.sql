/*
  # Complete VMS Database Setup
  
  This migration ensures all required tables, types, and demo users are properly created.
  It's safe to run multiple times as it uses IF NOT EXISTS checks.

  1. User Role Enum
  2. Users Table with proper structure
  3. Demo users for testing
  4. Row Level Security policies
*/

-- Create enum for user roles (safe to run multiple times)
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'employee', 'guard');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create users table if it doesn't exist
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  role user_role NOT NULL DEFAULT 'employee',
  department text DEFAULT 'General',
  created_at timestamptz DEFAULT now(),
  last_login timestamptz,
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Admins can read all users" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;

-- Create policies
CREATE POLICY "Users can read own data"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = auth_user_id);

CREATE POLICY "Admins can read all users"
  ON users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE auth_user_id = auth.uid() 
      AND role = 'admin'
    )
  );

CREATE POLICY "Users can update own data"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = auth_user_id);

-- Insert demo users (safe to run multiple times)
INSERT INTO users (email, name, role, department) VALUES
  ('admin@company.com', 'System Administrator', 'admin', 'IT'),
  ('john@company.com', 'John Employee', 'employee', 'Sales'),
  ('guard@company.com', 'Security Guard', 'guard', 'Security')
ON CONFLICT (email) DO NOTHING;