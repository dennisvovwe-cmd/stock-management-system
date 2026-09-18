CREATE TABLE branches (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    location VARCHAR(200)
);

CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    unit_type VARCHAR(50),
    cost_price NUMERIC(10,2),
    selling_price NUMERIC(10,2)
);

CREATE TABLE product_variant (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id),
    variant_name VARCHAR(100)
);

CREATE TABLE stock (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id),
    branch_id INTEGER REFERENCES branches(id), 
    quantity INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE stock_movements (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id),
    branch_id INTEGER REFERENCES branches(id),
     change_amount INTEGER,
    reason VARCHAR(100),
    date TIMESTAMP DEFAULT NOW()
);