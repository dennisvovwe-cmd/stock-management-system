const express = require('express');
const pool = require('./db');

const app = express();
app.use(express.json());

const PORT =3000;

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
  if (req.user.role !== 'accountant') {
    return res.status(403).json({ error: 'Accountant access only' });
  }
  next();
}

app.post('/products', authenticate,requireAccountant, async (req, res) => {
    const { name, description, category, unit_type, cost_price, selling_price} = req.body;
    try{
        const result = await pool.query(
            `INSERT INTO products (name, description, category, unit_type, cost_price, selling_price)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [name, description, category, unit_type, cost_price, selling_price]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500). json({ error: err.message});
    }
});

app.get('/products', authenticate, async (req, res) => {
    try{
        const result = await pool.query('SELECT * FROM products');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/products/:id', async (req, res) =>{
    try{
        const result = await  pool.query('SELECT *FROM products WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({error: 'Product not found'});
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/products/:id', async (req, res) => {
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

app.delete('/products/:id', async (req, res) => {
    try{
        const result = await pool.query('DELETE FROM products WHERE id= $1 RETURNING *', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
        res.json({ message: 'Product deleted' });
    } catch (err){
        res.status(500).json({ error: err.message });
    }
});

app.get('/branches/:id/stock', async (req, res) => {
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

app.post('/stock/adjust', async (req, res) => {
  const { product_id, branch_id, change_amount, reason } = req.body;
  try {
    await pool.query(
      `UPDATE stock SET quantity = quantity + $1 WHERE product_id=$2 AND branch_id=$3`,
      [change_amount, product_id, branch_id]
    );
    await pool.query(
      `INSERT INTO stock_movements (product_id, branch_id, change_amount, reason)
       VALUES ($1, $2, $3, $4)`,
      [product_id, branch_id, change_amount, reason]
    );
    res.json({ message: 'Stock updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

app.post('/signup', async (req, res) => {
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

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Invalid email or password' });
    }
    const user = result.rows[0];
    const match = await bcrypt.compare(password,user.password_hash);
    if (!match){
        return res.status(404).json({ error: 'Invalid email or password' });
}
const token = jwt.sign(
    { id: user.id, role: user.role, branch_id: user.branch_id }, 
    process.env.JWT_SECRET, 
    { expiresIn: '1h' }
);
res.json({ token, role: user.role, name: user.name });
} catch (err) {
    res.status(500).json({ error: err.message });
}
});
app.listen(PORT, () =>{
    console.log(`Server running on http://localhost:${PORT}`);
})