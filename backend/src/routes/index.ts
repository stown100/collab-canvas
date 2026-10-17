import { Router } from 'express';
import recordsRouter from './records';
import assetsRouter from './assets';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

router.use('/boards/:id/records', recordsRouter);
router.use('/boards/:id/assets', assetsRouter);

export default router;
