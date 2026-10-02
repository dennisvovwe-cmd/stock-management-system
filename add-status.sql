ALTER TABLE users ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'approved' 
  CHECK (status IN ('pending', 'approved', 'rejected'));

UPDATE users SET status = 'approved';