import { tx } from '@/lib/server/db';
import { json, withUser } from '@/lib/server/http';
import { completeReview } from '@/lib/server/services/approvals';

export const POST = withUser<{ id: string }>(async (_req, { user, params }) => {
  const result = await tx((db) => completeReview(db, params.id, user.id));
  return json(result);
});
