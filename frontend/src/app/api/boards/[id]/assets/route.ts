import { NextResponse } from 'next/server';
import { authorizeBoardMember, BACKEND_URL, internalSecretHeader } from '@/shared/lib/boardBackend';

// Uploads a board asset: the raw file is forwarded to the Express backend, which
// stores it in MinIO and returns the access-controlled proxy URL.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const denied = await authorizeBoardMember(id);
  if (denied) return denied;

  const body = await req.arrayBuffer();
  const res = await fetch(`${BACKEND_URL}/api/boards/${id}/assets`, {
    method: 'POST',
    headers: {
      ...internalSecretHeader(),
      'Content-Type': req.headers.get('content-type') ?? 'application/octet-stream',
      'x-file-name': req.headers.get('x-file-name') ?? 'file',
    },
    body,
  });

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
