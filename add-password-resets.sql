CREATE TABLE password_reset_requests (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    new_password_hash VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMP DEFAULT NOW()
);