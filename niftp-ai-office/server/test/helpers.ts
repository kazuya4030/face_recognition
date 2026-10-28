import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp, type App } from '../src/app.ts';
import type { AppConfig } from '../src/config.ts';

export const FAKE_CLAUDE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/fake-claude.mjs');

export function tempDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'niftp-office-test-'));
}

export async function makeApp(dataDir: string, overrides: Partial<AppConfig> = {}): Promise<App> {
  return createApp({
    host: '127.0.0.1',
    port: 4317,
    dataDir,
    clientDir: path.join(dataDir, 'no-client'),
    claudeBin: FAKE_CLAUDE,
    demoStepMs: 20,
    maxConcurrentRuns: 1,
    ...overrides,
  });
}

export const HEADERS = { host: '127.0.0.1:4317', 'x-niftp-office': '1', 'content-type': 'application/json' };

export async function api<T = any>(app: App, method: 'GET' | 'POST' | 'PUT', url: string, body?: unknown): Promise<{ status: number; body: T }> {
  const res = await app.server.inject({ method, url, headers: method === 'GET' ? { host: HEADERS.host } : HEADERS, payload: body == null ? undefined : JSON.stringify(body) });
  return { status: res.statusCode, body: res.json() as T };
}

export const JOB_INPUT = {
  title: '競合調査レポート',
  purpose: '新サービスの価格設定の参考にする',
  details: '国内の主要3社の料金体系を比較する',
  acceptanceCriteria: '3社の料金表がある\n出典が明記されている',
  assigneeId: 'researcher',
};

export async function waitFor<T>(fn: () => T | undefined | false, timeoutMs = 10000): Promise<T> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > until) throw new Error('waitFor timeout');
    await new Promise((r) => setTimeout(r, 15));
  }
}
