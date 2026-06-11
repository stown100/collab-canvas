import type { Request, Response, NextFunction } from 'express';

// Guards backend routes that may only be called server-to-server by the Next.js
// API layer. The browser never holds this secret — Next.js authenticates the
// user (NextAuth) and checks board membership, then forwards here with it.
export function internalAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'INTERNAL_API_SECRET is not configured' });
    return;
  }
  if (req.header('x-internal-secret') !== secret) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}
