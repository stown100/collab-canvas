import { Pool } from 'pg';

declare global {
  var _pgPool: Pool | undefined;
}

let instance: Pool | undefined;

function getPool(): Pool {
  if (instance) return instance;
  // Reuse the pool across dev hot reloads.
  if (global._pgPool) return (instance = global._pgPool);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Please add your DATABASE_URL to .env.local');
  }
  instance = new Pool({ connectionString });
  if (process.env.NODE_ENV === 'development') {
    global._pgPool = instance;
  }
  return instance;
}

// The pool is created on first use, not at import: `next build` loads every
// route to collect page data, and builds without DB env (Vercel preview
// deployments) must still succeed. Callers use it like a regular Pool.
const pool = new Proxy({} as Pool, {
  get(_, prop) {
    const target = getPool();
    const value = Reflect.get(target, prop, target);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});

export default pool;
