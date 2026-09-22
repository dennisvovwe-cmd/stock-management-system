CREATE TABLE sales (
    id SERIAL PRIMARY KEY,
    branch_id INTEGER REFERENCES branches(id),
    user_id INTEGER REFERENCES users(id),
    customer_name VARCHAR(150),
    is_credit BOOLEAN DEFAULT FALSE,
    amount_paid NUMERIC(10, 2) DEFAULT 0,
    total_amount NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE sale_items (
    id SERIAL PRIMARY KEY,
    sale_id INTEGER REFERENCES sales(id),
    product_id INTEGER REFERENCES products(id),
    quantity NUMERIC(10, 2) NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL,
    subtotal NUMERIC(10, 2) NOT NULL
);