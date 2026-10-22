import express, { Router, type Request } from 'express';
import * as Y from 'yjs';
import { internalAuth } from '../middleware/internalAuth';
import {
  createNote,
  deleteNote,
  listNotes,
  updateNote,
  NOTE_COLORS,
  type NoteColor,
  type NoteInput,
} from '../services/boardNotes';
import { applyNotesDocUpdate, getNotesDoc } from '../services/boardNotesDoc';

// `body` is a plain-text copy of the note's rich text, kept for search.
const MAX_BODY_LENGTH = 100000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Mounted at /api/boards/:id/notes — mergeParams exposes :id here.
const router = Router({ mergeParams: true });

router.use(internalAuth);

// The Next.js proxy forwards the authenticated user's id; it is recorded as
// the note's creator / last editor.
function userIdOf(req: Request): string | null {
  const userId = req.header('x-user-id');
  return userId && UUID_RE.test(userId) ? userId : null;
}

// Validates a create/update body. Only known fields are picked; absent ones
// stay undefined so an update leaves them untouched.
function parseNoteInput(body: unknown): { input: NoteInput } | { error: string } {
  const { body: text, color } = (body ?? {}) as Record<string, unknown>;
  const input: NoteInput = {};

  if (text !== undefined) {
    if (typeof text !== 'string' || text.length > MAX_BODY_LENGTH) return { error: 'Invalid body' };
    input.body = text;
  }
  if (color !== undefined) {
    if (!NOTE_COLORS.includes(color as NoteColor)) return { error: 'Invalid color' };
    input.color = color as NoteColor;
  }
  return { input };
}

function isYjsUpdate(data: unknown): data is Buffer {
  if (!Buffer.isBuffer(data) || data.length === 0) return false;
  try {
    Y.decodeUpdate(data);
    return true;
  } catch {
    return false;
  }
}

router.get('/', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    res.json(await listNotes(id));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const userId = userIdOf(req);
    if (!userId) return res.status(400).json({ error: 'Missing user' });

    const noteId = (req.body as { id?: unknown } | undefined)?.id;
    if (typeof noteId !== 'string' || !UUID_RE.test(noteId)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const parsed = parseNoteInput(req.body);
    if ('error' in parsed) return res.status(400).json({ error: parsed.error });

    const note = await createNote(id, noteId, userId, parsed.input);
    if (!note) return res.status(409).json({ error: 'Id already in use' });
    res.status(201).json(note);
  } catch (err) {
    next(err);
  }
});

// The board's notes document (Yjs), as raw binary.
router.get('/doc', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const state = await getNotesDoc(id);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.send(state);
  } catch (err) {
    next(err);
  }
});

// Merges a client's Yjs update into the stored document.
router.post(
  '/doc',
  express.raw({ type: 'application/octet-stream', limit: '10mb' }),
  async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };
      if (!isYjsUpdate(req.body)) return res.status(400).json({ error: 'Invalid update' });

      await applyNotesDocUpdate(id, req.body);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

router.patch('/:noteId', async (req, res, next) => {
  try {
    const { id, noteId } = req.params as { id: string; noteId: string };
    if (!UUID_RE.test(noteId)) return res.status(404).json({ error: 'Not found' });

    const userId = userIdOf(req);
    if (!userId) return res.status(400).json({ error: 'Missing user' });

    const parsed = parseNoteInput(req.body);
    if ('error' in parsed) return res.status(400).json({ error: parsed.error });

    const note = await updateNote(id, noteId, userId, parsed.input);
    if (!note) return res.status(404).json({ error: 'Not found' });
    res.json(note);
  } catch (err) {
    next(err);
  }
});

router.delete('/:noteId', async (req, res, next) => {
  try {
    const { id, noteId } = req.params as { id: string; noteId: string };
    if (UUID_RE.test(noteId)) await deleteNote(id, noteId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
