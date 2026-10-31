// アプリの組み立て。画面（静的ファイル）・業務管理（OfficeService）・AI実行（JobRunner + アダプター）を接続する。
import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { AppConfig } from './config.ts';
import type { AdapterId } from './domain/types.ts';
import { ChangeBus } from './events.ts';
import { registerRoutes } from './api/routes.ts';
import { registerSecurity } from './api/security.ts';
import type { ExecutionAdapter } from './runner/adapter.ts';
import { ClaudeCodeAdapter } from './runner/claudeAdapter.ts';
import { DemoAdapter } from './runner/demoAdapter.ts';
import { JobRunner } from './runner/jobRunner.ts';
import { MaterialsService } from './services/materials.ts';
import { OfficeService } from './services/office.ts';
import { OperationsService } from './services/operations.ts';
import { ResearchProgram } from './services/research.ts';
import { projectRoot } from './config.ts';
import { openDatabase } from './store/db.ts';
import { Repo } from './store/repo.ts';

export interface App {
  server: FastifyInstance;
  office: OfficeService;
  ops: OperationsService;
  materials: MaterialsService;
  research: ResearchProgram;
  runner: JobRunner;
  repo: Repo;
  close: () => Promise<void>;
}

export async function createApp(config: AppConfig, opts: { logger?: boolean } = {}): Promise<App> {
  const db = openDatabase(config.dataDir);
  const repo = new Repo(db);
  repo.seedIfEmpty();

  const bus = new ChangeBus();
  const adapters: Record<AdapterId, ExecutionAdapter> = {
    demo: new DemoAdapter(config.demoStepMs),
    claude: new ClaudeCodeAdapter(config.claudeBin),
  };
  await Promise.all(Object.values(adapters).map((a) => a.refreshAvailability()));

  const runner = new JobRunner(repo, adapters, config, bus);
  runner.recoverOnStartup();
  const office = new OfficeService(repo, runner, adapters, config.dataDir, bus);
  const materials = new MaterialsService(repo, config.dataDir, bus);
  const appVersion = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')).version as string;
  const ops = new OperationsService(repo, runner, office, materials, { dataDir: config.dataDir, backupDir: config.backupDir }, bus, appVersion);
  office.inboxCount = () => ops.inbox().length;
  const research = new ResearchProgram(repo, office, bus);

  // forceCloseConnections: 画面の変更通知（SSE）は接続し続けるため、終了時に強制的に閉じないと停止できない。
  const server = Fastify({ logger: opts.logger ? { level: 'info' } : false, bodyLimit: 256 * 1024, forceCloseConnections: true });
  registerSecurity(server, config.port);
  registerRoutes(server, { office, materials, ops, research }, bus, Object.values(adapters));

  if (fs.existsSync(path.join(config.clientDir, 'index.html'))) {
    await server.register(fastifyStatic, { root: config.clientDir, prefix: '/' });
    server.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: '見つかりません' });
      return reply.sendFile('index.html');
    });
  } else {
    server.get('/', async (_req, reply) =>
      reply.type('text/plain; charset=utf-8').send('画面がビルドされていません。`npm run build` を実行するか、`npm run dev` で開発サーバーを使ってください。'),
    );
  }

  runner.kick();
  // 定期研究の判定（1分ごと）。無効なら何もしない。サーバーが動いている間だけ判定する
  const researchTimer = setInterval(() => {
    try {
      research.tick();
    } catch (e) {
      server.log.error(e);
    }
  }, 60_000);
  researchTimer.unref();

  return {
    server,
    office,
    ops,
    materials,
    research,
    runner,
    repo,
    close: async () => {
      clearInterval(researchTimer);
      await runner.shutdown();
      await server.close();
      db.close();
    },
  };
}
