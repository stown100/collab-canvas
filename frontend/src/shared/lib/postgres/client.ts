import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL as string;

if (!connectionString) {
  throw new Error('Please add your DATABASE_URL to .env.local');
}

declare global {
  var _pgPool: Pool | undefined;
}

const pool = global._pgPool ?? new Pool({ connectionString });

if (process.env.NODE_ENV === 'development') {
  global._pgPool = pool;
}

export default pool;
