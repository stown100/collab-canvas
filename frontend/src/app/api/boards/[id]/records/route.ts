import { NextResponse } from 'next/server';
import { authorizeBoardMember, BACKEND_URL, internalSecretHeader } from '@/shared/lib/boardBackend';

function jsonHeaders(): HeadersInit {
  return { ...internalSecretHeader(), 'Content-Type': 'application/json' };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const denied = await authorizeBoardMember(id);
  if (denied) return denied;

  const res = await fetch(`${BACKEND_URL}/api/boards/${id}/records`, {
    headers: jsonHeaders(),
    cache: 'no-store',
  });
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const denied = await authorizeBoardMember(id);
  if (denied) return denied;

  const payload = await req.text();
  const res = await fetch(`${BACKEND_URL}/api/boards/${id}/records`, {
    method: 'PATCH',
    headers: jsonHeaders(),
    body: payload,
  });
  return new NextResponse(null, { status: res.status });
}
