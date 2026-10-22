import {
  authorizeBoardMember,
  BACKEND_URL,
  getBoardAccess,
  internalSecretHeader,
  relayJson,
  userJsonHeaders,
} from '@/shared/lib/boardBackend';

// Board notes: visible to and editable by every board member.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const denied = await authorizeBoardMember(id);
  if (denied) return denied;

  const res = await fetch(`${BACKEND_URL}/api/boards/${id}/notes`, {
    headers: internalSecretHeader(),
    cache: 'no-store',
  });
  return relayJson(res);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await getBoardAccess(id);
  if (access.denied) return access.denied;

  const res = await fetch(`${BACKEND_URL}/api/boards/${id}/notes`, {
    method: 'POST',
    headers: userJsonHeaders(access.userId),
    body: await req.text(),
  });
  return relayJson(res);
}
