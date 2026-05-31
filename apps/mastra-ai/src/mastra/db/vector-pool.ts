import pg from 'pg';
import { env } from '../env.js';

const { Pool } = pg;

export const vectorPool = new Pool({
  connectionString: env.VECTOR_DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 60000,
});

vectorPool.on('error', (err) => {
  console.error('[vectorPool] idle client error:', err);
});
