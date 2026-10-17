import { NextResponse } from 'next/server';
import { authorizeBoardMember, BACKEND_URL, internalSecretHeader } from '@/shared/lib/boardBackend';

// Streams a board asset from MinIO (via Express) to board members only.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> },
) {
  const { id, assetId } = await params;
  const denied = await authorizeBoardMember(id);
  if (denied) return denied;

  const res = await fetch(`${BACKEND_URL}/api/boards/${id}/assets/${assetId}`, {
    headers: internalSecretHeader(),
    cache: 'no-store',
  });
  if (!res.ok || !res.body) return new NextResponse(null, { status: res.status });

  return new NextResponse(res.body, {
    status: 200,
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'application/octet-stream',
      'Cache-Control': res.headers.get('cache-control') ?? 'private, max-age=31536000, immutable',
    },
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> },
) {
  const { id, assetId } = await params;
  const denied = await authorizeBoardMember(id);
  if (denied) return denied;

  const res = await fetch(`${BACKEND_URL}/api/boards/${id}/assets/${assetId}`, {
    method: 'DELETE',
    headers: internalSecretHeader(),
  });
  return new NextResponse(null, { status: res.status });
}
