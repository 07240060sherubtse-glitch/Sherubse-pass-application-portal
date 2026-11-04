CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  student_number VARCHAR(40) UNIQUE,
  course VARCHAR(120),
  study_year VARCHAR(30),
  section VARCHAR(10),
  hostel_name VARCHAR(120),
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'student',
  attendance_percent NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (attendance_percent >= 0 AND attendance_percent <= 100),
  email_verified BOOLEAN NOT NULL DEFAULT TRUE,
  verification_token_hash TEXT,
  verification_token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS course VARCHAR(120);
ALTER TABLE users ADD COLUMN IF NOT EXISTS study_year VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS section VARCHAR(10);
ALTER TABLE users ADD COLUMN IF NOT EXISTS hostel_name VARCHAR(120);
UPDATE users
SET section=SUBSTRING(study_year FROM 8 FOR 1),
    study_year=SUBSTRING(study_year FROM 1 FOR 6)
WHERE section IS NULL
  AND study_year ~ '^Year [1-4] [AB]$';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
UPDATE users SET role='dsa' WHERE role='tutor';
UPDATE users SET role='sso' WHERE role='warden';
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('student','dsa','sso'));

CREATE TABLE IF NOT EXISTS leave_balance (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  total_days INTEGER NOT NULL DEFAULT 10 CHECK (total_days >= 0),
  used_days INTEGER NOT NULL DEFAULT 0 CHECK (used_days >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (used_days <= total_days)
);
CREATE TABLE IF NOT EXISTS leave_requests (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  leave_type VARCHAR(40) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending_sso',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date)
);
ALTER TABLE leave_requests ALTER COLUMN status SET DEFAULT 'pending_sso';
ALTER TABLE leave_requests DROP CONSTRAINT IF EXISTS leave_requests_status_check;
UPDATE leave_requests SET status='pending_dsa' WHERE status='pending_tutor';
UPDATE leave_requests SET status='pending_sso' WHERE status='pending_warden';
CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE name='approval_order_sso_then_dsa_v1') THEN
    -- Every request still awaiting review must enter the new first stage (SSO).
    UPDATE leave_requests SET status='pending_sso' WHERE status IN ('pending_dsa','pending_sso');
    INSERT INTO schema_migrations(name) VALUES('approval_order_sso_then_dsa_v1');
  END IF;
END $$;
ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_status_check CHECK (status IN ('pending_dsa','pending_sso','approved','rejected','cancelled'));
CREATE INDEX IF NOT EXISTS idx_leave_requests_student ON leave_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON leave_requests(student_id,start_date,end_date);

CREATE TABLE IF NOT EXISTS approvals (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
  reviewer_id INTEGER NOT NULL REFERENCES users(id),
  reviewer_role VARCHAR(20) NOT NULL,
  decision VARCHAR(20) NOT NULL CHECK (decision IN ('approved','rejected','cancelled')),
  comment TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE approvals DROP CONSTRAINT IF EXISTS approvals_reviewer_role_check;
UPDATE approvals SET reviewer_role='dsa' WHERE reviewer_role='tutor';
UPDATE approvals SET reviewer_role='sso' WHERE reviewer_role='warden';
ALTER TABLE approvals ADD CONSTRAINT approvals_reviewer_role_check CHECK (reviewer_role IN ('student','dsa','sso'));


-- ==========================================
-- WORKING-DAY LEAVE QUOTA EXTENSION
-- ==========================================

-- Track leave reserved by pending applications.
ALTER TABLE leave_balance
ADD COLUMN IF NOT EXISTS pending_days INTEGER NOT NULL DEFAULT 0;

-- Track the actual working days requested.
ALTER TABLE leave_requests
ADD COLUMN IF NOT EXISTS leave_days INTEGER NOT NULL DEFAULT 0;

ALTER TABLE leave_requests
ADD COLUMN IF NOT EXISTS quota_exceeded BOOLEAN NOT NULL DEFAULT FALSE;

-- Ensure quota values cannot be negative.
ALTER TABLE leave_balance
DROP CONSTRAINT IF EXISTS leave_balance_pending_days_check;

ALTER TABLE leave_balance
ADD CONSTRAINT leave_balance_pending_days_check
CHECK (pending_days >= 0);

-- Emergency requests may exceed quota only after a recorded DSA override.
ALTER TABLE leave_balance
DROP CONSTRAINT IF EXISTS leave_balance_check;

ALTER TABLE leave_balance
DROP CONSTRAINT IF EXISTS leave_balance_used_days_check;

ALTER TABLE leave_balance
DROP CONSTRAINT IF EXISTS leave_balance_quota_check;

ALTER TABLE leave_balance
ADD CONSTRAINT leave_balance_quota_check
CHECK (
  total_days >= 0
  AND used_days >= 0
  AND pending_days >= 0
);

-- Store official public holidays and college holidays.
CREATE TABLE IF NOT EXISTS holidays (
  id SERIAL PRIMARY KEY,
  holiday_date DATE NOT NULL UNIQUE,
  holiday_name VARCHAR(180) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_holidays_date
ON holidays(holiday_date);
