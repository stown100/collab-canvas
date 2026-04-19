import { Pool } from 'pg';

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (!_pool) {
    const uri = process.env.DATABASE_URL;
    if (!uri) throw new Error('DATABASE_URL is not defined');
    _pool = new Pool({ connectionString: uri });
  }
  return _pool;
}

export async function connectDB() {
  const client = await getPool().connect();
  client.release();
  console.log('PostgreSQL connected');
}
