import { Router } from 'express';
import { internalAuth } from '../middleware/internalAuth';
import { loadRecords, saveRecords, type RecordsDelta } from '../services/boardRecords';

// Mounted at /api/boards/:id/records — mergeParams exposes :id here.
const router = Router({ mergeParams: true });

router.use(internalAuth);

router.get('/', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const snapshot = await loadRecords(id);
    res.json(snapshot);
  } catch (err) {
    next(err);
  }
});

router.patch('/', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    await saveRecords(id, req.body as RecordsDelta);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
