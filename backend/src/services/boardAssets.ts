import { randomUUID } from 'crypto';
import type { Readable } from 'stream';
import { getPool } from './db';
import { deleteObject, getObjectStream, putObject } from './storage';

// Asset bytes live in MinIO; board_assets holds only metadata (object_key, mime,
// size). Authorization is assumed to have happened upstream (Next.js).

export interface UploadedFile {
  data: Buffer;
  mimeType: string;
  name: string;
}

export interface AssetStream {
  stream: Readable;
  mimeType: string;
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'file';
}

export async function createAsset(boardId: string, file: UploadedFile): Promise<string> {
  const objectKey = `boards/${boardId}/${randomUUID()}-${sanitize(file.name)}`;
  await putObject(objectKey, file.data, file.mimeType);

  const { rows } = await getPool().query(
    `INSERT INTO board_assets (board_id, object_key, mime_type, byte_size)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [boardId, objectKey, file.mimeType, file.data.length],
  );
  return rows[0].id;
}

export async function getAsset(boardId: string, assetId: string): Promise<AssetStream | null> {
  const { rows } = await getPool().query(
    'SELECT object_key, mime_type FROM board_assets WHERE id = $1 AND board_id = $2',
    [assetId, boardId],
  );
  if (!rows[0]?.object_key) return null;

  const stream = await getObjectStream(rows[0].object_key);
  return { stream, mimeType: rows[0].mime_type };
}

export async function deleteAsset(boardId: string, assetId: string): Promise<void> {
  const { rows } = await getPool().query(
    'SELECT object_key FROM board_assets WHERE id = $1 AND board_id = $2',
    [assetId, boardId],
  );
  if (!rows[0]?.object_key) return;

  await deleteObject(rows[0].object_key).catch(() => {});
  await getPool().query('DELETE FROM board_assets WHERE id = $1 AND board_id = $2', [assetId, boardId]);
}
