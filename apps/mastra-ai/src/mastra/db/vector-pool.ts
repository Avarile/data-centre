import { Pool } from 'pg';
import { env } from '../env.js';

export const vectorPool = new Pool({
  connectionString: env.DATABASE_VECTOR_URL,
  max: 5,
  idleTimeoutMillis: 60000,
});
