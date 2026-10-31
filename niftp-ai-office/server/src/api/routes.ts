// HTTP API。入力の検証と状態遷移は OfficeService に任せ、ここでは受け渡しだけを行う。
import fs from 'node:fs';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { JobAction } from '../domain/types.ts';
import type { ChangeBus } from '../events.ts';
import type { ExecutionAdapter } from '../runner/adapter.ts';
import type { MaterialsService } from '../services/materials.ts';
import { UserError, type OfficeService } from '../services/office.ts';
import type { OperationsService } from '../services/operations.ts';
import type { ResearchProgram } from '../services/research.ts';

type IdParams = { id: string };

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new UserError('IDが不正です', 400);
  return id;
}

type Services = { office: OfficeService; materials: MaterialsService; ops: OperationsService; research: ResearchProgram };

export function registerRoutes(app: FastifyInstance, { office, materials, ops, research }: Services, bus: ChangeBus, adapters: ExecutionAdapter[]): void {
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

  app.get('/api/office/events', async () => office.officeEvents());

  app.get<{ Params: IdParams }>('/api/jobs/:id', async (req) => office.jobDetail(parseId(req.params.id)));

  app.post<{ Body: Record<string, unknown> }>('/api/jobs', async (req, reply) => {
    const job = office.createJob(req.body ?? {});
    return reply.code(201).send(office.jobDetail(job.id));
  });

  app.post<{ Params: IdParams & { action: string }; Body: Record<string, unknown> }>('/api/jobs/:id/actions/:action', async (req) => {
    const action = req.params.action as JobAction;
    if (!['start', 'pause', 'resume', 'halt', 'cancel'].includes(action)) throw new UserError('未対応の操作です', 400);
    const job = office.applyAction(parseId(req.params.id), action, req.body ?? {});
    return office.jobDetail(job.id);
  });

  app.post<{ Params: IdParams; Body: { decision?: string; comment?: unknown } }>('/api/approvals/:id/decision', async (req) => {
    const decision = req.body?.decision;
    if (decision !== 'approve' && decision !== 'reject') throw new UserError('承認または差し戻しを指定してください');
    return office.decideApproval(parseId(req.params.id), decision, req.body?.comment);
  });

  app.get('/api/deliverables', async () => office.deliverablesWithExistence());

  // ---- 資料（添付・承認済み成果物の参照） ----
  app.post<{ Params: IdParams; Body: Record<string, unknown> }>('/api/jobs/:id/attachments', { bodyLimit: 2 * 1024 * 1024 }, async (req, reply) =>
    reply.code(201).send(materials.upload(parseId(req.params.id), req.body ?? {})),
  );
  app.post<{ Params: IdParams; Body: Record<string, unknown> }>('/api/jobs/:id/references', async (req, reply) =>
    reply.code(201).send(materials.addReference(parseId(req.params.id), req.body ?? {})),
  );
  app.post<{ Params: IdParams }>('/api/attachments/:id/remove', async (req) => {
    materials.remove(parseId(req.params.id));
    return { ok: true };
  });
  app.get<{ Params: IdParams }>('/api/attachments/:id/content', async (req) => materials.content(parseId(req.params.id)));
  app.get('/api/approved-deliverables', async () => materials.approvedDeliverables());

  // ---- 受信箱 ----
  app.get('/api/inbox', async () => ops.inbox());
  app.post<{ Params: IdParams; Body: Record<string, unknown> }>('/api/jobs/:id/answers', async (req) => ops.answerQuestions(parseId(req.params.id), req.body ?? {}));
  app.post<{ Params: IdParams; Body: Record<string, unknown> }>('/api/jobs/:id/plan/approve', async (req) => ops.approvePlan(parseId(req.params.id), req.body ?? {}));
  app.post<{ Params: IdParams; Body: Record<string, unknown> }>('/api/jobs/:id/plan/revise', async (req) => ops.revisePlan(parseId(req.params.id), req.body ?? {}));

  // ---- 待ち行列 ----
  app.get('/api/queue', async () => ops.queue());
  app.post('/api/queue/start', async () => ops.setQueueRunning(true));
  app.post('/api/queue/stop', async () => ops.setQueueRunning(false));
  app.post<{ Params: IdParams; Body: { direction?: string } }>('/api/queue/:id/move', async (req) => ops.move(parseId(req.params.id), String(req.body?.direction ?? '')));

  // ---- 会社の記憶 ----
  app.get('/api/memory', async () => ops.memory());
  app.post<{ Body: Record<string, unknown> }>('/api/memory', async (req, reply) => reply.code(201).send(ops.addMemory(req.body ?? {})));
  app.put<{ Params: IdParams; Body: Record<string, unknown> }>('/api/memory/:id', async (req) => ops.updateMemory(parseId(req.params.id), req.body ?? {}));
  app.post<{ Params: IdParams; Body: Record<string, unknown> }>('/api/notes/:id/promote', async (req) => ops.promoteNote(parseId(req.params.id), req.body ?? {}));

  // ---- 定期研究（研究員） ----
  app.get('/api/research', async () => research.view());
  app.post<{ Body: Record<string, unknown> }>('/api/research/topics', async (req, reply) => reply.code(201).send(research.addTopic(req.body ?? {})));
  app.put<{ Params: IdParams; Body: Record<string, unknown> }>('/api/research/topics/:id', async (req) => research.updateTopic(parseId(req.params.id), req.body ?? {}));
  app.post('/api/research/run-now', async () => research.runNow());

  // ---- 業務状況・利用状況・テンプレート ----
  app.get('/api/summary', async () => ops.summary());
  app.get('/api/usage', async () => ops.usage());
  app.get('/api/templates', async () => office.templates());

  // ---- バックアップ（復元はサーバーを止めて npm run restore で行う） ----
  app.get('/api/backups', async () => ops.backups());
  app.post('/api/backups', async (_req, reply) => {
    const { path: _p, ...info } = await ops.createBackup();
    return reply.code(201).send(info);
  });
  app.get<{ Params: { name: string } }>('/api/backups/:name/download', async (req, reply) => {
    const p = ops.backupFile(req.params.name);
    reply.header('Content-Type', 'application/gzip');
    reply.header('Content-Disposition', `attachment; filename="${req.params.name}"`);
    return reply.send(fs.createReadStream(p));
  });

  app.get<{ Params: IdParams }>('/api/deliverables/:id/content', async (req) => office.deliverableContent(parseId(req.params.id)));

  app.get<{ Params: IdParams }>('/api/deliverables/:id/download', async (req, reply) => {
    const f = office.deliverableFile(parseId(req.params.id));
    reply.header('Content-Type', f.mime === 'text/html' || f.mime === 'image/svg+xml' ? 'text/plain; charset=utf-8' : f.mime);
    reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`);
    return reply.send(fs.createReadStream(f.path));
  });

  app.put<{ Params: IdParams; Body: Record<string, unknown> }>('/api/employees/:id', async (req) => office.updateEmployee(req.params.id, req.body ?? {}));

  app.put<{ Body: Record<string, unknown> }>('/api/settings', async (req) => office.updateSettings(req.body ?? {}));

  app.put<{ Body: Record<string, unknown> }>('/api/company', async (req) => office.updateCompany(req.body ?? {}));

  app.post('/api/adapters/refresh', async () => {
    await Promise.all(adapters.map((a) => a.refreshAvailability()));
    bus.changed();
    return office.adapterInfo();
  });
}
