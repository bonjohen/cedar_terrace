import express from 'express';
import dotenv from 'dotenv';
import { getDatabase } from './db';
import { createApiRouter } from './api';

// Load environment variables
dotenv.config({ path: '.env.local' });

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS for local development
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-user-id');
  next();
});

// Health check endpoint
app.get('/health', (_req, res) => {
  try {
    const db = getDatabase();
    // Simple health check query
    db.prepare('SELECT 1').get();
    res.json({ status: 'healthy', database: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', error: String(error) });
  }
});

// API routes
const db = getDatabase();
app.use('/api', createApiRouter(db));

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    name: 'Cedar Terrace Parking Enforcement API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      api: '/api/v1',
    },
  });
});

// Error handling middleware
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.ENV || 'development'}`);
  console.log(`Database: ${process.env.DATABASE_PATH || 'data/cedar_terrace.db'}`);
});
