const express = require('express');
const pool = require('./db');
const path = require('path');
const ALLOWED_SIGNUP_ROLES = ['staff', 'accountant'];

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

function requireAccountant(req, res, next) {
  if (req.user.role !== 'accountant' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Accountant access only' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access only' });
  }
  next();
}

app.get('/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, role, branch_id, status, created_at FROM users ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/products', authenticate, requireAccountant, async (req, res) => {
  const { name, description, category, unit_type, cost_price, selling_price } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Product name is required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO products (name, description, category, unit_type, cost_price, selling_price)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [String(name).trim(), description, category, unit_type, cost_price, selling_price]
    );
    await client.query(
      `INSERT INTO stock (product_id, branch_id, quantity) SELECT $1, id, 0 FROM branches`,
      [result.rows[0].id]
    );
    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.get('/products', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products');
    let products = result.rows;

      if (req.user.role === 'staff') {
      products = products.map(({ cost_price, ...rest }) => rest);
    }


    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/products/:id', authenticate, async (req, res) =>{
    try{
        const result = await  pool.query('SELECT *FROM products WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({error: 'Product not found'});

        let product = result.rows[0];

      if (req.user.role === 'staff') {
      const { cost_price, ...rest } = product;
      product = rest;
    }

        res.json(product);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/products/:id', authenticate,requireAccountant, async (req, res) => {
    const { name, description, category, unit_type, cost_price, selling_price } = req.body;
    try{
        const result = await pool. query(
            `UPDATE products SET name=$1, description =$2, category=$3, unit_type=$4, cost_price=$5, selling_price=$6
            WHERE id=$7 RETURNING *`,
            [name, description, category, unit_type, cost_price, selling_price, req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({error: err.message });
    }
});

app.put('/products/:id/threshold', authenticate, requireAccountant, async (req, res) => {
  const { reorder_threshold } = req.body;
  try {
    const result = await pool.query(
      `UPDATE products SET reorder_threshold = $1 WHERE id = $2 RETURNING *`,
      [reorder_threshold, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/products/:id', authenticate, requireAccountant, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const used = await client.query('SELECT 1 FROM sale_items WHERE product_id = $1 LIMIT 1', [req.params.id]);
    if (used.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This product has sales history and cannot be deleted.' });
    }

    await client.query('DELETE FROM stock_movements WHERE product_id = $1', [req.params.id]);
    await client.query('DELETE FROM stock WHERE product_id = $1', [req.params.id]);
    await client.query('DELETE FROM product_variant WHERE product_id = $1', [req.params.id]);
    const result = await client.query('DELETE FROM products WHERE id = $1 RETURNING id', [req.params.id]);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Product not found' });
    }

    await client.query('COMMIT');
    res.json({ message: 'Product deleted' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.get('/branches/:id/stock', authenticate, async (req, res) => {
    try{
        const result = await pool.query(
            `SELECT p.id, p.name, s.quantity
            FROM stock s JOIN products p ON s.product_id = p.id
            WHERE s.branch_id =$1`,
            [req.params.id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/branches/:id/low-stock', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.name, s.quantity, p.reorder_threshold
       FROM stock s
       JOIN products p ON s.product_id = p.id
       WHERE s.branch_id = $1 AND s.quantity <= p.reorder_threshold`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/stock/adjust', authenticate, async (req, res) => {
  const { product_id, branch_id, change_amount, reason } = req.body;
  const change = Number(change_amount);

  if (!product_id || !branch_id || !Number.isFinite(change) || change === 0) {
    return res.status(400).json({ error: 'Product, branch and a non-zero quantity are required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO stock (product_id, branch_id, quantity) VALUES ($1, $2, 0)
       ON CONFLICT (product_id, branch_id) DO NOTHING`,
      [product_id, branch_id]
    );

    const updated = await client.query(
      `UPDATE stock SET quantity = quantity + $1::numeric
       WHERE product_id = $2 AND branch_id = $3 AND quantity + $1::numeric >= 0
       RETURNING quantity`,
      [change, product_id, branch_id]
    );
    if (updated.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Not enough stock to remove that quantity.' });
    }

    await client.query(
      `INSERT INTO stock_movements (product_id, branch_id, change_amount, reason)
       VALUES ($1, $2, $3, $4)`,
      [product_id, branch_id, change, reason]
    );

    await client.query('COMMIT');
    res.json({ message: 'Stock updated', quantity: updated.rows[0].quantity });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

app.post('/signup', authenticate, requireAccountant, async (req, res) => {
    if (!ALLOWED_SIGNUP_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Role must be staff or accountant.' });
  }  
  const { name, email, password, role, branch_id } = req.body;
    try {
        const password_hash = await bcrypt.hash(password, 10);
        const result = await pool.query(
            `INSERT INTO users (name, email, password_hash, role, branch_id)
             VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role, branch_id`,
            [name, email, password_hash, role, branch_id]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}); 

app.post('/signup-request', async (req, res) => {
    if (!ALLOWED_SIGNUP_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Role must be staff or accountant.' });
  }
  const { name, email, password, role, branch_id } = req.body;
  try {
    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, branch_id, status)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id, name, email, role, branch_id, status`,
      [name, email, password_hash, role, branch_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/signup-requests', authenticate, requireAccountant, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, role, branch_id, created_at FROM users WHERE status = 'pending' ORDER BY created_at ASC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/signup-requests/:id/approve', authenticate, requireAccountant, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE users SET status = 'approved' WHERE id = $1 AND status = 'pending' RETURNING id, name, email, role, status`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Request not found or already handled' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/signup-requests/:id/reject', authenticate, requireAccountant, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE users SET status = 'rejected' WHERE id = $1 AND status = 'pending' RETURNING id, name, email, role, status`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Request not found or already handled' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const user = result.rows[0];

    if (user.status === 'pending') {
      return res.status(403).json({ error: 'Your account is awaiting approval.' });
    }
    if (user.status === 'rejected') {
      return res.status(403).json({ error: 'Your account request was not approved.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = jwt.sign(
      { id: user.id, role: user.role, branch_id: user.branch_id },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({ token, role: user.role, name: user.name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/password-reset-request', async (req, res) => {
  const { email, new_password, confirm_password } = req.body;

  if (!email || !new_password || !confirm_password) {
    return res.status(400).json({ error: 'Fill in all fields.' });
  }
  if (new_password !== confirm_password) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'Password should be at least 6 characters.' });
  }

  try {
    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'No account found with that email.' });
    }
    const user_id = userResult.rows[0].id;
    const new_password_hash = await bcrypt.hash(new_password, 10);

    await pool.query(
      `INSERT INTO password_reset_requests (user_id, new_password_hash) VALUES ($1, $2)`,
      [user_id, new_password_hash]
    );

    res.status(201).json({ message: 'Reset request submitted for approval.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/password-reset-requests', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT prr.id, prr.created_at, u.id AS user_id, u.name, u.email, u.role
       FROM password_reset_requests prr
       JOIN users u ON prr.user_id = u.id
       WHERE prr.status = 'pending'
       ORDER BY prr.created_at ASC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/password-reset-requests/:id/approve', authenticate, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const reqResult = await client.query(
      `SELECT * FROM password_reset_requests WHERE id = $1 AND status = 'pending'`,
      [req.params.id]
    );
    if (reqResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Request not found or already handled' });
    }
    const resetRequest = reqResult.rows[0];

    await client.query(
      `UPDATE users SET password_hash = $1 WHERE id = $2`,
      [resetRequest.new_password_hash, resetRequest.user_id]
    );
    await client.query(
      `UPDATE password_reset_requests SET status = 'approved' WHERE id = $1`,
      [req.params.id]
    );

    await client.query('COMMIT');
    res.json({ message: 'Password reset approved and applied.' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.put('/password-reset-requests/:id/reject', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE password_reset_requests SET status = 'rejected' WHERE id = $1 AND status = 'pending' RETURNING id`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Request not found or already handled' });
    res.json({ message: 'Request rejected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/sales', authenticate, async (req, res) => {
  const { branch_id, customer_name, is_credit, amount_paid, items } = req.body;

  if (!branch_id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'A branch and at least one item are required.' });
  }
  for (const item of items) {
    if (!item.product_id || !(Number(item.quantity) > 0) || !(Number(item.unit_price) >= 0)) {
      return res.status(400).json({ error: 'Every item needs a product, a quantity above 0, and a price.' });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const total_amount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

    const saleResult = await client.query(
      `INSERT INTO sales (branch_id, user_id, customer_name, is_credit, amount_paid, total_amount)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [branch_id, req.user.id, customer_name, is_credit || false, amount_paid || 0, total_amount]
    );
    const sale_id = saleResult.rows[0].id;

    for (const item of items) {
      const subtotal = item.quantity * item.unit_price;

      await client.query(
        `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, subtotal)
         VALUES ($1, $2, $3, $4, $5)`,
        [sale_id, item.product_id, item.quantity, item.unit_price, subtotal]
      );

      const deducted = await client.query(
        `UPDATE stock SET quantity = quantity - $1::numeric
         WHERE product_id = $2 AND branch_id = $3 AND quantity >= $1::numeric
         RETURNING quantity`,
        [item.quantity, item.product_id, branch_id]
      );

      if (deducted.rows.length === 0) {
        const info = await client.query(
          `SELECT p.name, COALESCE(s.quantity, 0) AS available
           FROM products p LEFT JOIN stock s ON s.product_id = p.id AND s.branch_id = $2
           WHERE p.id = $1`,
          [item.product_id, branch_id]
        );
        const err = new Error(
          info.rows.length === 0
            ? 'Product not found.'
            : `Not enough stock for ${info.rows[0].name} at this branch (available: ${Number(info.rows[0].available)}).`
        );
        err.status = 400;
        throw err;
      }

      await client.query(
        `INSERT INTO stock_movements (product_id, branch_id, change_amount, reason)
         VALUES ($1, $2, $3, 'sale')`,
        [item.product_id, branch_id, -item.quantity]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ sale_id, total_amount });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(err.status || 500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.get('/sales', authenticate, requireAccountant, async (req, res) => {
  const { branch_id, start_date, end_date, include_voided } = req.query;
  try {
    let query = `
      SELECT s.id, s.branch_id, s.customer_name, s.is_credit, s.amount_paid, s.total_amount,
             (s.total_amount - s.amount_paid) AS balance,
             s.created_at, s.voided, s.void_reason, s.edited_at,
             u.name AS cashier_name
      FROM sales s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE 1=1`;
    const params = [];

    if (include_voided !== 'true') {
      query += ` AND s.voided = FALSE`;
    }
    if (branch_id) {
      params.push(branch_id);
      query += ` AND s.branch_id = $${params.length}`;
    }
    if (start_date) {
      params.push(start_date);
      query += ` AND s.created_at >= $${params.length}::date`;
    }
    if (end_date) {
      params.push(end_date);
      query += ` AND s.created_at < ($${params.length}::date + 1)`;
    }

    query += ` ORDER BY s.created_at DESC LIMIT 500`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/sales/:id', authenticate, requireAccountant, async (req, res) => {
  try {
    const sale = await pool.query(
      `SELECT s.*, u.name AS cashier_name, vu.name AS voided_by_name
       FROM sales s
       LEFT JOIN users u ON s.user_id = u.id
       LEFT JOIN users vu ON s.voided_by = vu.id
       WHERE s.id = $1`,
      [req.params.id]
    );
    if (sale.rows.length === 0) return res.status(404).json({ error: 'Sale not found' });

    const items = await pool.query(
      `SELECT si.*, p.name FROM sale_items si
       JOIN products p ON si.product_id = p.id
       WHERE si.sale_id = $1`,
      [req.params.id]
    );

    res.json({ ...sale.rows[0], items: items.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/sales/credit/outstanding', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, customer_name, branch_id, total_amount, amount_paid, 
              (total_amount - amount_paid) AS balance_owed, created_at
       FROM sales
       WHERE is_credit = true AND amount_paid < total_amount AND voided = FALSE
       ORDER BY created_at ASC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/sales/credit/by-customer', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT customer_name,
              COUNT(*) AS number_of_sales,
              SUM(total_amount) AS total_billed,
              SUM(amount_paid) AS total_paid,
              SUM(total_amount - amount_paid) AS total_owed
       FROM sales
       WHERE is_credit = true AND amount_paid < total_amount AND voided = FALSE
       GROUP BY customer_name
       ORDER BY total_owed DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/sales/:id/payment', authenticate, requireAccountant, async (req, res) => {
  const { additional_payment } = req.body;
  try {
    const saleCheck = await pool.query('SELECT * FROM sales WHERE id = $1', [req.params.id]);
    if (saleCheck.rows.length === 0) return res.status(404).json({ error: 'Sale not found' });

    if (sale.voided) return res.status(400).json({ error: 'This sale has been deleted.' });
    const newAmountPaid = parseFloat(sale.amount_paid) + parseFloat(additional_payment);

    if (newAmountPaid > parseFloat(sale.total_amount)) {
      return res.status(400).json({ error: 'Payment exceeds remaining balance' });
    }

    const result = await pool.query(
      `UPDATE sales SET amount_paid = $1 WHERE id = $2 RETURNING *`,
      [newAmountPaid, req.params.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/reports/sales-summary', authenticate, async (req, res) => {
  const { branch_id, start_date, end_date } = req.query;
  try {
    let query = `SELECT COUNT(*) AS total_sales, SUM(total_amount) AS total_revenue, SUM(amount_paid) AS total_collected
                 FROM sales WHERE voided = FALSE`;
    const params = [];

    if (branch_id) {
      params.push(branch_id);
      query += ` AND branch_id = $${params.length}`;
    }
    if (start_date) {
      params.push(start_date);
      query += ` AND created_at >= $${params.length}`;
    }
    if (end_date) {
      params.push(end_date);
      query += ` AND created_at <= $${params.length}`;
    }

    const result = await pool.query(query, params);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/reports/stock-valuation', authenticate, requireAccountant, async (req, res) => {
  const { branch_id } = req.query;
  try {
    let query = `
      SELECT p.id, p.name, s.branch_id, s.quantity, p.cost_price,
             (s.quantity * p.cost_price) AS stock_value
      FROM stock s
      JOIN products p ON s.product_id = p.id
      WHERE 1=1`;
    const params = [];

    if (branch_id) {
      params.push(branch_id);
      query += ` AND s.branch_id = $${params.length}`;
    }

    const result = await pool.query(query, params);
    const total_value = result.rows.reduce((sum, row) => sum + parseFloat(row.stock_value), 0);

    res.json({ items: result.rows, total_value });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/reports/best-sellers', authenticate, async (req, res) => {
  const { branch_id, limit } = req.query;
  try {
    let query = `
      SELECT p.id, p.name, SUM(si.quantity) AS total_quantity_sold, SUM(si.subtotal) AS total_revenue
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      JOIN sales s ON si.sale_id = s.id
      WHERE s.voided = FALSE`;
    const params = [];

    if (branch_id) {
      params.push(branch_id);
      query += ` AND s.branch_id = $${params.length}`;
    }

    query += ` GROUP BY p.id, p.name ORDER BY total_quantity_sold DESC`;

    if (limit) {
      params.push(limit);
      query += ` LIMIT $${params.length}`;
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'E.png'));
});
// Edit customer name and amount paid
app.put('/sales/:id', authenticate, requireAccountant, async (req, res) => {
  const { customer_name, amount_paid } = req.body;
  const paid = Number(amount_paid);

  if (!customer_name || !String(customer_name).trim()) {
    return res.status(400).json({ error: 'Customer name is required.' });
  }
  if (!Number.isFinite(paid) || paid < 0) {
    return res.status(400).json({ error: 'Amount paid must be 0 or more.' });
  }

  try {
    const existing = await pool.query('SELECT total_amount, voided FROM sales WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Sale not found' });
    if (existing.rows[0].voided) return res.status(400).json({ error: 'A deleted sale cannot be edited.' });
    if (paid > Number(existing.rows[0].total_amount)) {
      return res.status(400).json({ error: 'Amount paid cannot be more than the total.' });
    }

    const result = await pool.query(
      `UPDATE sales
       SET customer_name = $1,
           amount_paid = $2::numeric,
           is_credit = (is_credit OR $2::numeric < total_amount),
           edited_at = NOW(),
           edited_by = $3
       WHERE id = $4
       RETURNING *`,
      [String(customer_name).trim(), paid, req.user.id, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// "Delete" a sale: return stock, keep a record of who/when/why
app.post('/sales/:id/void', authenticate, requireAccountant, async (req, res) => {
  const reason = String(req.body.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'Give a reason for deleting this sale.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const saleResult = await client.query('SELECT * FROM sales WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (saleResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Sale not found' });
    }
    const sale = saleResult.rows[0];
    if (sale.voided) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This sale has already been deleted.' });
    }

    const items = await client.query(
      'SELECT product_id, quantity FROM sale_items WHERE sale_id = $1',
      [sale.id]
    );

    for (const item of items.rows) {
      await client.query(
        `UPDATE stock SET quantity = quantity + $1 WHERE product_id = $2 AND branch_id = $3`,
        [item.quantity, item.product_id, sale.branch_id]
      );
      await client.query(
        `INSERT INTO stock_movements (product_id, branch_id, change_amount, reason)
         VALUES ($1, $2, $3, $4)`,
        [item.product_id, sale.branch_id, item.quantity, `sale #${sale.id} deleted`]
      );
    }

    await client.query(
      `UPDATE sales SET voided = TRUE, voided_at = NOW(), voided_by = $1, void_reason = $2 WHERE id = $3`,
      [req.user.id, reason, sale.id]
    );

    await client.query('COMMIT');
    res.json({ message: 'Sale deleted and stock returned.' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.post('/products/import', authenticate, requireAccountant, async (req, res) => {
  const rows = req.body.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'There are no rows to import.' });
  }
  if (rows.length > 2000) {
    return res.status(400).json({ error: 'Too many rows. Import at most 2000 products at a time.' });
  }

  const num = (v) => (v === undefined || v === null || v === '' ? 0 : Number(v));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const branchRows = await client.query('SELECT id FROM branches ORDER BY id');
    const branchIds = branchRows.rows.map(b => b.id);

    const existing = await client.query('SELECT LOWER(TRIM(name)) AS name FROM products');
    const seen = new Set(existing.rows.map(r => r.name));

    let imported = 0;
    const skipped = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || {};
      const rowNum = r.row || i + 2;
      const name = String(r.name || '').trim();
      const category = String(r.category || '').trim();
      const unit_type = String(r.unit_type || '').trim();
      const description = String(r.description || '').trim();
      const cost = num(r.cost_price);
      const selling = num(r.selling_price);
      const opening = r.opening_stock || {};

      let problem = null;
      if (!name) problem = 'Missing product name';
      else if (name.length > 150) problem = 'Name is longer than 150 characters';
      else if (category.length > 100) problem = 'Category is longer than 100 characters';
      else if (unit_type.length > 50) problem = 'Unit is longer than 50 characters';
      else if (!Number.isFinite(cost) || cost < 0 || cost >= 1e8) problem = 'Invalid cost price';
      else if (!Number.isFinite(selling) || selling < 0 || selling >= 1e8) problem = 'Invalid selling price';
      else if (seen.has(name.toLowerCase())) problem = 'A product with this name already exists';

      const quantities = {};
      if (!problem) {
        for (const bid of branchIds) {
          const q = num(opening[bid]);
          if (!Number.isFinite(q) || q < 0 || q >= 1e9) {
            problem = `Invalid opening stock for branch ${bid}`;
            break;
          }
          quantities[bid] = q;
        }
      }

      if (problem) {
        skipped.push({ row: rowNum, name, reason: problem });
        continue;
      }

      const p = await client.query(
        `INSERT INTO products (name, description, category, unit_type, cost_price, selling_price)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [name, description || null, category || null, unit_type || null, cost, selling]
      );
      const productId = p.rows[0].id;

      for (const bid of branchIds) {
        await client.query(
          `INSERT INTO stock (product_id, branch_id, quantity) VALUES ($1, $2, $3)`,
          [productId, bid, quantities[bid]]
        );
        if (quantities[bid] > 0) {
          await client.query(
            `INSERT INTO stock_movements (product_id, branch_id, change_amount, reason)
             VALUES ($1, $2, $3, 'opening stock')`,
            [productId, bid, quantities[bid]]
          );
        }
      }

      seen.add(name.toLowerCase());
      imported++;
    }

    await client.query('COMMIT');
    res.json({ imported, skipped });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.get('/branches', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name FROM branches ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}
module.exports = app;


