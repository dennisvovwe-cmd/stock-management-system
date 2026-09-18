const express = require('express');
const pool = require('./db');

const app = express();
app.use(express.json());

const PORT =3000;

app.post('/products', async (req, res) => {
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

app.get('/products', async (req, res) => {
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
    try{
        await pool.query(
            `UPDATE stock SET quantity = quantity + $1 WHERE product_id=$2 AND branch_id=$3`,
            [change_amount, product_id, branch_id]
        );
        res.json({ message: 'Stock updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () =>{
    console.log(`Server running on http://localhost:${PORT}`);
})