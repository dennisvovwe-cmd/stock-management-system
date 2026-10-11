-- One stock row per product per branch, enforced by the database
ALTER TABLE stock ADD CONSTRAINT stock_product_branch_unique UNIQUE (product_id, branch_id);

-- Give every existing product a row for every branch (quantity 0 where missing)
INSERT INTO stock (product_id, branch_id, quantity)
SELECT p.id, b.id, 0 FROM products p CROSS JOIN branches b
ON CONFLICT (product_id, branch_id) DO NOTHING;