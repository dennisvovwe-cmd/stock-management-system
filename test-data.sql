INSERT INTO branches (name, location) VALUES
('Branch A','Main Street'),
('Branch B','Second Location');

INSERT INTO products (name, description, category,unit_type,cost_price, selling_price) VALUES
('Electrical Cable 2.5mm','Copper wire','Electrical','meter',150.00, 200.00),
('PVC Pipe 20mm','Plumbing pipe', 'Plumbing','piece', 500.00, 700.00);

INSERT INTO stock (product_id, branch_id, quantity) VALUES 
(1, 1, 100),
(1, 2, 50),
(2, 1, 30),
(2, 2, 20);
