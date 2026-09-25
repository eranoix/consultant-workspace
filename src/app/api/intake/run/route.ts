import { z } from 'zod';
import { pool } from '@/lib/server/db';
import { json, parseBody, withUser } from '@/lib/server/http';
import { runMailIntake } from '@/lib/server/services/intake';

/** Check the mailbox now, from the web process, without waiting for the worker. */
export const POST = withUser(async (req) => {
  const { channel } = await parseBody(req, z.object({ channel: z.enum(['email', 'meeting']) }));
  return json(await runMailIntake(pool(), channel));
});
