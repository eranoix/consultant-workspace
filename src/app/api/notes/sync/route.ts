import { pool } from '@/lib/server/db';
import { json, withUser } from '@/lib/server/http';
import { syncNotesFromMail } from '@/lib/server/services/notes';

export const POST = withUser(async () => json(await syncNotesFromMail(pool())));
