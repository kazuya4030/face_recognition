// HTTP API。入力の検証と状態遷移は OfficeService に任せ、ここでは受け渡しだけを行う。
import fs from 'node:fs';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { JobAction } from '../domain/types.ts';
import type { ChangeBus } from '../events.ts';
import type { ExecutionAdapter } from '../runner/adapter.ts';
import { UserError, type OfficeService } from '../services/office.ts';

type IdParams = { id: string };

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new UserError('IDが不正です', 400);
  return id;
}

export function registerRoutes(app: FastifyInstance, office: OfficeService, bus: ChangeBus, adapters: ExecutionAdapter[]): void {
  app.setErrorHandler((err, _req, reply: FastifyReply) => {
    if (err instanceof UserError) return reply.code(err.status).send({ error: err.message });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ error: '不正なリクエストです' });
    app.log.error(err);
    return reply.code(500).send({ error: 'サーバー内部でエラーが発生しました' });
  });

  app.get('/api/state', async () => office.snapshot());

  app.get('/api/events', (req, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const send = (data: unknown) => reply.raw.write(`event: change\ndata: ${JSON.stringify(data)}\n\n`);
    send({ version: bus.currentVersion() });
    bus.on('change', send);
    const heartbeat = setInterval(() => reply.raw.write(': keep-alive\n\n'), 25000);
    req.raw.on('close', () => {
      clearInterval(heartbeat);
      bus.off('change', send);
    });
  });

  app.get<{ Params: IdParams }>('/api/jobs/:id', async (req) => office.jobDetail(parseId(req.params.id)));

  app.post<{ Body: Record<string, unknown> }>('/api/jobs', async (req, reply) => {
    const job = office.createJob(req.body ?? {});
    return reply.code(201).send(office.jobDetail(job.id));
  });

  app.post<{ Params: IdParams & { action: string }; Body: Record<string, unknown> }>('/api/jobs/:id/actions/:action', async (req) => {
    const action = req.params.action as JobAction;
    if (!['start', 'pause', 'resume', 'cancel'].includes(action)) throw new UserError('未対応の操作です', 400);
    const job = office.applyAction(parseId(req.params.id), action, req.body ?? {});
    return office.jobDetail(job.id);
  });

  app.post<{ Params: IdParams; Body: { decision?: string; comment?: unknown } }>('/api/approvals/:id/decision', async (req) => {
    const decision = req.body?.decision;
    if (decision !== 'approve' && decision !== 'reject') throw new UserError('承認または差し戻しを指定してください');
    return office.decideApproval(parseId(req.params.id), decision, req.body?.comment);
  });

  app.get('/api/deliverables', async () => office.deliverablesWithExistence());

  app.get<{ Params: IdParams }>('/api/deliverables/:id/content', async (req) => office.deliverableContent(parseId(req.params.id)));

  app.get<{ Params: IdParams }>('/api/deliverables/:id/download', async (req, reply) => {
    const f = office.deliverableFile(parseId(req.params.id));
    reply.header('Content-Type', f.mime === 'text/html' || f.mime === 'image/svg+xml' ? 'text/plain; charset=utf-8' : f.mime);
    reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`);
    return reply.send(fs.createReadStream(f.path));
  });

  app.put<{ Params: IdParams; Body: Record<string, unknown> }>('/api/employees/:id', async (req) => office.updateEmployee(req.params.id, req.body ?? {}));

  app.put<{ Body: Record<string, unknown> }>('/api/settings', async (req) => office.updateSettings(req.body ?? {}));

  app.post('/api/adapters/refresh', async () => {
    await Promise.all(adapters.map((a) => a.refreshAvailability()));
    bus.changed();
    return office.adapterInfo();
  });
}
