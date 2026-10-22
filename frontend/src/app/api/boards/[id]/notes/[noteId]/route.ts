import {
  authorizeBoardMember,
  BACKEND_URL,
  getBoardAccess,
  internalSecretHeader,
  relayJson,
  userJsonHeaders,
} from '@/shared/lib/boardBackend';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> },
) {
  const { id, noteId } = await params;
  const access = await getBoardAccess(id);
  if (access.denied) return access.denied;

  const res = await fetch(`${BACKEND_URL}/api/boards/${id}/notes/${encodeURIComponent(noteId)}`, {
    method: 'PATCH',
    headers: userJsonHeaders(access.userId),
    body: await req.text(),
  });
  return relayJson(res);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> },
) {
  const { id, noteId } = await params;
  const denied = await authorizeBoardMember(id);
  if (denied) return denied;

  const res = await fetch(`${BACKEND_URL}/api/boards/${id}/notes/${encodeURIComponent(noteId)}`, {
    method: 'DELETE',
    headers: internalSecretHeader(),
  });
  return relayJson(res);
}
