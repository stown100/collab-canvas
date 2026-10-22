import { Router } from 'express';
import recordsRouter from './records';
import assetsRouter from './assets';
import notesRouter from './notes';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

router.use('/boards/:id/records', recordsRouter);
router.use('/boards/:id/assets', assetsRouter);
router.use('/boards/:id/notes', notesRouter);

export default router;
