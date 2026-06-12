import express, { Router } from 'express';
import { internalAuth } from '../middleware/internalAuth';
import { createAsset, deleteAsset, getAsset } from '../services/boardAssets';

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];

// Mounted at /api/boards/:id/assets — mergeParams exposes :id here.
const router = Router({ mergeParams: true });

router.use(internalAuth);

// Upload: the raw file is streamed in as the request body; name/type come from
// headers set by the Next.js proxy.
router.post('/', express.raw({ type: '*/*', limit: '30mb' }), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const data = req.body as Buffer;
    const mimeType = req.header('content-type') || 'application/octet-stream';
    const name = decodeURIComponent(req.header('x-file-name') || 'file');

    if (!Buffer.isBuffer(data) || data.length === 0) {
      return res.status(400).json({ error: 'Empty body' });
    }
    if (data.length > MAX_BYTES) return res.status(413).json({ error: 'File too large' });
    if (!ALLOWED_TYPES.includes(mimeType)) return res.status(415).json({ error: 'Unsupported type' });

    const assetId = await createAsset(id, { data, mimeType, name });
    res.json({ assetId, url: `/api/boards/${id}/assets/${assetId}` });
  } catch (err) {
    next(err);
  }
});

router.get('/:assetId', async (req, res, next) => {
  try {
    const { id, assetId } = req.params as { id: string; assetId: string };
    const asset = await getAsset(id, assetId);
    if (!asset) return res.status(404).json({ error: 'Not found' });

    res.setHeader('Content-Type', asset.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    asset.stream.on('error', next).pipe(res);
  } catch (err) {
    next(err);
  }
});

router.delete('/:assetId', async (req, res, next) => {
  try {
    const { id, assetId } = req.params as { id: string; assetId: string };
    await deleteAsset(id, assetId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
