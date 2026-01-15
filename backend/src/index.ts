import express from 'express';
import { getPool } from './db';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check endpoint
app.get('/health', async (_req, res) => {
  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', database: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', error: String(error) });
  }
});

// API routes will be added here
app.get('/api/v1', (_req, res) => {
  res.json({ message: 'Cedar Terrace Parking Enforcement API v1' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
