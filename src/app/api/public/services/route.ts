import { pool } from '@/lib/server/db';
import { errorResponse, json } from '@/lib/server/http';
import { listServices } from '@/lib/server/services/bookings';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const services = await listServices(pool());
    return json({ services: services.map(({ slug, name, description, duration_min, price_label, calendar_label }) => ({ slug, name, description, duration_min, price_label, calendar_label })) });
  } catch (err) {
    return errorResponse(err);
  }
}
