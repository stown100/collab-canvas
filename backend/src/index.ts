import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { connectDB } from './services/db';
import router from './routes';
import { initWebSocket } from './ws';

dotenv.config();

const app = express();
const httpServer = createServer(app);

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));
app.use(express.json());
app.use('/api', router);

initWebSocket(httpServer);

const PORT = process.env.PORT || 4000;

connectDB().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
  });
});
