import type { Metadata } from 'next';
import { getT } from '@/i18n/server';
import { PERMISSIONS, ROLE_PERMISSIONS, ROUTE_PERMISSIONS } from '@/lib/domain/tokens';
import { CopyBlock } from '@/components/settings/CopyBlock';

export const metadata: Metadata = { title: 'Board API' };

export default async function ApiDocsPage() {
  const { t } = await getT();
  const base = (process.env.PUBLIC_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const token = 'cwk_xxxxxxxx_yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy';
  const handoff = `You can manage tasks on my board over HTTP.

Base URL: ${base}/api/v1
Send every request with the header: Authorization: Bearer <token>

- GET  /tasks?status=todo            list tasks (status: backlog, todo, doing, review, done)
- POST /tasks                        create: {"title", "description", "status", "clientId", "dueDate": "YYYY-MM-DD", "priority": "low|normal|high"}
- POST /tasks/{id}/move              move: {"status": "doing"}
- GET  /clients                      clients and their side, to fill clientId

Use GET /clients before setting a client. Never invent ids. If a call returns 403,
the token does not have that permission: say so instead of retrying.`;
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t('api.docs.title')}</h1>
        <p className="mt-1 text-sm text-ink-600">{t('api.docs.intro')}</p>
      </div>

      <section className="card p-5">
        <h2 className="mb-2 text-sm font-semibold">{t('api.docs.auth')}</h2>
        <p className="mb-3 text-sm text-ink-600">{t('api.docs.authText')}</p>
        <CopyBlock code={`Authorization: Bearer ${token}`} />
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold">{t('api.docs.endpoints')}</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wide text-ink-500">
            <tr>
              <th className="pb-2 font-medium">{t('api.docs.method')}</th>
              <th className="pb-2 font-medium">{t('api.docs.path')}</th>
              <th className="pb-2 font-medium">{t('api.permissions')}</th>
              <th className="pb-2 font-medium">{t('api.docs.what')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {ROUTE_PERMISSIONS.map((r) => (
              <tr key={r.method + r.path}>
                <td className="py-2 font-mono text-xs font-semibold text-brand-700">{r.method}</td>
                <td className="py-2 font-mono text-xs">{r.path}</td>
                <td className="py-2 font-mono text-xs text-ink-600">{r.permission}</td>
                <td className="py-2 text-xs text-ink-600">{r.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold">{t('api.docs.roles')}</h2>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-ink-500">
              <th className="pb-2 font-medium" />
              {PERMISSIONS.map((p) => (
                <th key={p} className="pb-2 text-center font-mono font-medium">
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {(Object.keys(ROLE_PERMISSIONS) as (keyof typeof ROLE_PERMISSIONS)[]).map((role) => (
              <tr key={role}>
                <td className="py-2 font-medium">{t(`api.roles.${role}`)}</td>
                {PERMISSIONS.map((p) => (
                  <td key={p} className="py-2 text-center">
                    {ROLE_PERMISSIONS[role].includes(p) ? '✓' : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-ink-500">{t('api.docs.rolesNote')}</p>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="text-sm font-semibold">{t('api.docs.examples')}</h2>
        <CopyBlock label={t('api.docs.exList')} code={`curl -s ${base}/api/v1/tasks?status=todo \\\n  -H "Authorization: Bearer $TOKEN"`} />
        <CopyBlock
          label={t('api.docs.exCreate')}
          code={`curl -s -X POST ${base}/api/v1/tasks \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '{"title": "Order printer labels", "status": "todo", "dueDate": "2026-10-02", "priority": "high"}'`}
        />
        <CopyBlock label={t('api.docs.exMove')} code={`curl -s -X POST ${base}/api/v1/tasks/$TASK_ID/move \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '{"status": "doing"}'`} />
        <CopyBlock
          label={t('api.docs.exJs')}
          code={`const res = await fetch('${base}/api/v1/tasks', {\n  method: 'POST',\n  headers: { Authorization: \`Bearer \${process.env.BOARD_TOKEN}\`, 'Content-Type': 'application/json' },\n  body: JSON.stringify({ title: 'Collect receipts', status: 'backlog' }),\n});\nif (res.status === 403) console.log('token lacks the permission');`}
        />
        <CopyBlock label={t('api.docs.exErrors')} code={`401 {"error": "Invalid token", "code": "unauthenticated"}\n403 {"error": "This token lacks the tasks:create permission", "code": "forbidden"}\n400 {"error": "Invalid request", "issues": [{"path": "title", "message": "..."}]}`} />
      </section>

      <section className="card p-5">
        <h2 className="mb-1 text-sm font-semibold">{t('api.docs.handoff')}</h2>
        <p className="mb-3 text-sm text-ink-600">{t('api.docs.handoffText')}</p>
        <CopyBlock code={handoff} />
      </section>
    </div>
  );
}
