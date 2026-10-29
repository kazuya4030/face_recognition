import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app.ts';
import { buildChildEnv } from '../src/runner/claudeAdapter.ts';
import { redact } from '../src/runner/redact.ts';
import { api, JOB_INPUT, makeApp, tempDataDir, waitFor } from './helpers.ts';

let app: App | null = null;
afterEach(async () => {
  await app?.close();
  app = null;
});

/** 偽CLIが記録した起動内容（工程ごとに1件、起動順）。 */
const probes = (dataDir: string, jobId: number): any[] =>
  JSON.parse(fs.readFileSync(path.join(dataDir, 'workspaces', `job-${jobId}`, '.fake-probe.json'), 'utf8'));
const probe = (dataDir: string, jobId: number) => probes(dataDir, jobId).at(-1);

describe('Claude Code アダプター（偽CLIで検証）', () => {
  it('安全な引数で起動し、操作・根拠・確認事項・費用・成果物を記録する', async () => {
    const dataDir = tempDataDir();
    app = await makeApp(dataDir);
    const id = (await api(app, 'POST', '/api/jobs', { ...JOB_INPUT, adapter: 'claude', usePlanner: false, useReviewer: false, startNow: true })).body.job.id;
    await app.runner.waitForIdle();
    const detail = (await api(app, 'GET', `/api/jobs/${id}`)).body;
    expect(detail.job.status).toBe('awaiting_review');

    const p = probe(dataDir, id);
    expect(p.args).toContain('-p');
    expect(p.args.join(' ')).not.toMatch(/dangerously|bypassPermissions/);
    expect(p.args[p.args.indexOf('--permission-mode') + 1]).toBe('acceptEdits');
    expect(p.args[p.args.indexOf('--permission-prompts') + 1]).toBe('none');
    expect(p.args[p.args.indexOf('--tools') + 1]).not.toContain('Bash');
    expect(p.args).toContain('--max-turns');
    expect(p.args).toContain('--max-budget-usd');
    // 依頼内容はコマンドライン引数ではなく、標準入力と brief.md で渡す
    expect(p.args.join(' ')).not.toContain(JOB_INPUT.details);
    expect(p.stdin).toContain('brief.md');
    expect(fs.realpathSync(p.cwd)).toBe(fs.realpathSync(path.join(dataDir, 'workspaces', `job-${id}`)));

    const run = detail.runs[0];
    expect(run.status).toBe('succeeded');
    expect(run.costUsd).toBeCloseTo(0.0123);
    expect(run.numTurns).toBe(2);
    expect(detail.job.cost).toEqual({ kind: 'known', usd: 0.0123 });

    const messages = detail.activities.map((a: any) => `${a.kind}:${a.message}`);
    expect(messages).toContain('action:ファイルを書く: outputs/deliverables/result.md');
    expect(messages).toContain('evidence:https://example.com/source');
    expect(messages).toContain('question:価格の前提を確認してください');
    expect(messages.some((m: string) => m.startsWith('denied:'))).toBe(true);
    // 内部思考は記録しない
    expect(JSON.stringify(detail.activities)).not.toContain('SECRET THOUGHT');

    expect(detail.deliverables.map((d: any) => [d.title, d.isDemo, d.revision, d.stageKind])).toEqual([
      ['deliverables/result.md', false, 1, 'execute'],
      ['report.md', false, 1, 'execute'],
    ]);
    expect(run.usage).toMatchObject({ inputTokens: 120, outputTokens: 45, cacheReadTokens: 300 });
    expect(run.model).toBe('fake-model-a');
    expect(run.inputs).toContain('brief.md');
    expect(run.inputs).toContain('reference/company.md');
    const approval = detail.approvals[0];
    expect(approval.items.map((i: any) => i.text)).toContain('価格の前提を確認してください');
  });

  it('費用が報告されない場合は null（画面では未取得）として扱う', async () => {
    app = await makeApp(tempDataDir());
    const id = (await api(app, 'POST', '/api/jobs', { ...JOB_INPUT, details: '[fake:nocost]', adapter: 'claude', usePlanner: false, useReviewer: false, startNow: true })).body.job.id;
    await app.runner.waitForIdle();
    const detail = (await api(app, 'GET', `/api/jobs/${id}`)).body;
    expect(detail.runs[0].costUsd).toBeNull();
    expect(detail.job.cost.kind).toBe('partial');
  });

  it('エラー結果・結果なし終了を失敗として記録する', async () => {
    app = await makeApp(tempDataDir());
    const e1 = (await api(app, 'POST', '/api/jobs', { ...JOB_INPUT, details: '[fake:error]', adapter: 'claude', usePlanner: false, useReviewer: false, startNow: true })).body.job.id;
    const e2 = (await api(app, 'POST', '/api/jobs', { ...JOB_INPUT, details: '[fake:nojson]', adapter: 'claude', usePlanner: false, useReviewer: false, startNow: true })).body.job.id;
    await app.runner.waitForIdle();
    const d1 = (await api(app, 'GET', `/api/jobs/${e1}`)).body;
    expect(d1.job.status).toBe('error');
    expect(d1.job.errorMessage).toContain('ターン数の上限');
    const d2 = (await api(app, 'GET', `/api/jobs/${e2}`)).body;
    expect(d2.job.status).toBe('error');
    expect(d2.job.errorMessage).toContain('結果を返さずに終了');
    expect(d2.approvals).toHaveLength(0);
  });

  it('実行中のキャンセルでプロセスを停止し、キャンセルとして記録する', async () => {
    app = await makeApp(tempDataDir());
    const id = (await api(app, 'POST', '/api/jobs', { ...JOB_INPUT, details: '[fake:hang]', adapter: 'claude', usePlanner: false, useReviewer: false, startNow: true })).body.job.id;
    await waitFor(() => app!.repo.listActivities(id).some((a) => a.message.startsWith('Claude Code を起動')));
    // 最終工程の Claude Code 実行は途中で一時停止できないため、一時停止ボタンは無効
    const detail0 = (await api(app, 'GET', `/api/jobs/${id}`)).body;
    expect(detail0.job.actions.find((a: any) => a.action === 'pause').enabled).toBe(false);
    await api(app, 'POST', `/api/jobs/${id}/actions/cancel`, {});
    await app.runner.waitForIdle();
    const detail = (await api(app, 'GET', `/api/jobs/${id}`)).body;
    expect(detail.job.status).toBe('cancelled');
    expect(detail.runs[0].status).toBe('cancelled');
  });

  it('CLI が見つからない場合は Claude Code での開始ボタンを無効にする', async () => {
    app = await makeApp(tempDataDir(), { claudeBin: '/nonexistent/claude' });
    const created = (await api(app, 'POST', '/api/jobs', { ...JOB_INPUT, adapter: 'claude' })).body;
    const start = created.job.actions.find((a: any) => a.action === 'start');
    expect(start.enabled).toBe(false);
    expect(start.reason).toContain('利用できません');
  });
});

describe('秘密情報の扱い', () => {
  it('子プロセスへは許可リストの環境変数だけを渡す', () => {
    const env = buildChildEnv({ PATH: '/bin', HOME: '/home/x', GH_TOKEN: 'ghp_x', AWS_SECRET_ACCESS_KEY: 's', ANTHROPIC_API_KEY: 'k', CLAUDECODE: '1' });
    expect(Object.keys(env).sort()).toEqual(['ANTHROPIC_API_KEY', 'HOME', 'PATH']);
  });

  it('Bedrock 利用時のみ AWS 資格情報を渡す', () => {
    const env = buildChildEnv({ PATH: '/bin', CLAUDE_CODE_USE_BEDROCK: '1', AWS_REGION: 'us-east-1', AWS_SECRET_ACCESS_KEY: 's' });
    expect(env.AWS_SECRET_ACCESS_KEY).toBe('s');
  });

  it('トークンらしき文字列を伏せる', () => {
    expect(redact('key sk-ant-api03-abcdefghijk and ghp_abcdefghijklmnopqrstuvwxyz123')).toBe('key [秘匿] and [秘匿]');
  });
});

describe('ローカル専用の防御', () => {
  it('Host ヘッダーが外部のものは拒否', async () => {
    app = await makeApp(tempDataDir());
    const res = await app.server.inject({ method: 'GET', url: '/api/state', headers: { host: 'evil.example.com' } });
    expect(res.statusCode).toBe(421);
  });

  it('変更系は独自ヘッダーと許可された Origin が必要', async () => {
    app = await makeApp(tempDataDir());
    const noHeader = await app.server.inject({ method: 'POST', url: '/api/jobs', headers: { host: '127.0.0.1:4317', 'content-type': 'application/json' }, payload: JSON.stringify(JOB_INPUT) });
    expect(noHeader.statusCode).toBe(403);
    const badOrigin = await app.server.inject({
      method: 'POST',
      url: '/api/jobs',
      headers: { host: '127.0.0.1:4317', 'content-type': 'application/json', 'x-niftp-office': '1', origin: 'https://evil.example.com' },
      payload: JSON.stringify(JOB_INPUT),
    });
    expect(badOrigin.statusCode).toBe(403);
  });

  it('設定APIはブラウザへ秘密情報を返さない', async () => {
    app = await makeApp(tempDataDir());
    const state = JSON.stringify((await api(app, 'GET', '/api/state')).body);
    for (const [k, v] of Object.entries(process.env)) {
      if (/(KEY|TOKEN|SECRET)/.test(k) && v && v.length > 12) expect(state).not.toContain(v);
    }
  });
});

describe('終了処理', () => {
  it('変更通知（SSE）の接続が開いたままでも停止できる', async () => {
    const a = await makeApp(tempDataDir());
    await a.server.listen({ host: '127.0.0.1', port: 0 });
    const port = (a.server.server.address() as { port: number }).port;
    const http = await import('node:http');
    await new Promise<void>((resolve) => {
      http.get({ host: '127.0.0.1', port, path: '/api/events', headers: { host: '127.0.0.1:4317' } }, (res) => {
        res.once('data', () => resolve());
        res.on('error', () => {});
      }).on('error', () => {});
    });
    const started = Date.now();
    await a.close();
    expect(Date.now() - started).toBeLessThan(5000);
  });
});
