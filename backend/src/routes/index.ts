import { Router } from 'express';
import recordsRouter from './records';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

router.use('/boards/:id/records', recordsRouter);

export default router;
