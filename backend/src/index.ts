import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { connectDB } from './services/db';
import router from './routes';
import { initWebSocket } from './ws';

dotenv.config();

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));
// gzip responses; compressible types (JSON) are compressed, binary assets
// (images) are skipped automatically.
app.use(compression());
app.use(express.json({ limit: '5mb' }));
app.use('/api', router);

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error('Request failed:', err);
  res.status(500).json({ error: 'Internal Server Error' });
};
app.use(errorHandler);

// On Vercel the exported app runs as a serverless function — no long-lived
// server, so no WebSocket. Locally it is a regular HTTP server.
if (!process.env.VERCEL) {
  const httpServer = createServer(app);
  initWebSocket(httpServer);

  const PORT = process.env.PORT || 4000;

  connectDB().then(() => {
    httpServer.listen(PORT, () => {
      console.log(`Backend running on http://localhost:${PORT}`);
    });
  });
}

export default app;
