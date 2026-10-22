import { NextResponse } from 'next/server';
import { authorizeBoardMember, BACKEND_URL, internalSecretHeader } from '@/shared/lib/boardBackend';

// The board's notes document (Yjs binary). GET returns the stored state; POST
// merges a client's update into it.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const denied = await authorizeBoardMember(id);
  if (denied) return denied;

  const res = await fetch(`${BACKEND_URL}/api/boards/${id}/notes/doc`, {
    headers: internalSecretHeader(),
    cache: 'no-store',
  });
  if (!res.ok) return new NextResponse(null, { status: res.status });

  return new NextResponse(await res.arrayBuffer(), {
    headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' },
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const denied = await authorizeBoardMember(id);
  if (denied) return denied;

  const res = await fetch(`${BACKEND_URL}/api/boards/${id}/notes/doc`, {
    method: 'POST',
    headers: { ...internalSecretHeader(), 'Content-Type': 'application/octet-stream' },
    body: await req.arrayBuffer(),
  });
  return new NextResponse(null, { status: res.status });
}
