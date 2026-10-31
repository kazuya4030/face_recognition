// 研究員（5人目の AI 社員）と定期研究を検証する。
import { afterEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app.ts';
import { stagesOf } from '../src/domain/jobState.ts';
import { api, makeApp, tempDataDir } from './helpers.ts';

let app: App | null = null;
afterEach(async () => {
  await app?.close();
  app = null;
});

const H = 3600_000;

describe('研究員', () => {
  it('既存のデータにも研究員が追加され、既存の4名は変わらない。研究の案件は ハル→ミナ→カイ→リツ の順に進む', async () => {
    const dataDir = tempDataDir();
    app = await makeApp(dataDir);
    // 研究員がいない以前の DB を再現し、利用者が編集した社員がいる状態にする
    app.repo.db.prepare(`DELETE FROM employees WHERE id = 'scientist'`).run();
    app.repo.db.prepare(`UPDATE employees SET name = '編集済み', updated_at = '2099-01-01T00:00:00.000Z' WHERE id = 'builder'`).run();
    await app.close();
    app = await makeApp(dataDir);
    const employees = app.repo.listEmployees();
    expect(employees.map((e) => e.id)).toEqual(['manager', 'researcher', 'builder', 'qa', 'scientist']);
    const kai = employees.find((e) => e.id === 'scientist')!;
    expect(kai).toMatchObject({ name: 'カイ', roleKey: 'scientist', roleTitle: '研究員AI' });
    expect(kai.tools).not.toContain('Bash');
    expect(kai.instructions).toContain('兵器');
    expect(kai.instructions).toContain('反証可能');
    expect(employees.find((e) => e.id === 'builder')!.name).toBe('編集済み');

    const stages = stagesOf({ assigneeId: 'scientist', usePlanner: true, useResearch: true, useReviewer: true }, employees);
    expect(stages.map((s) => `${s.kind}:${s.employeeId}`)).toEqual(['plan:manager', 'research:researcher', 'execute:scientist', 'review:qa']);
    const t = app.repo.listTemplates().find((x) => x.id === 'science-research')!;
    expect(t).toMatchObject({ assigneeRole: 'scientist', researchWeb: true });
  });
});

describe('定期研究', () => {
  it('無効のときは作らない。有効にすると間隔・1日の上限・確認待ちの上限を守ってテーマを順に研究する', async () => {
    app = await makeApp(tempDataDir());
    const research = app.research;
    expect(research.tick().reason).toBe('定期研究は無効です');
    await api(app, 'PUT', '/api/settings', { recurringEnabled: true, recurringIntervalHours: 24, recurringMaxPerDay: 1, recurringMaxPending: 2 });
    expect(research.tick().reason).toBe('有効な研究テーマがありません');
    const t1 = (await api(app, 'POST', '/api/research/topics', { text: '量子誤り訂正の最近の進展' })).body;
    const t2 = (await api(app, 'POST', '/api/research/topics', { text: '全固体電池の界面劣化' })).body;
    expect((await api(app, 'POST', '/api/research/topics', { text: '' })).status).toBe(400);

    const t0 = new Date();
    const first = research.tick(t0);
    expect(first.jobId).not.toBeNull();
    const job1 = app.repo.getJob(first.jobId!)!;
    expect(job1).toMatchObject({ recurringTopicId: t1.id, assigneeId: 'scientist', templateId: 'science-research' });
    expect(['queued', 'running']).toContain(job1.status);
    expect(job1.title).toContain('量子誤り訂正');
    // 前回が終わるまでは次を作らない
    expect(research.tick(t0).reason).toContain('前回の定期研究がまだ終わっていません');
    await app.runner.waitForIdle();
    expect(app.repo.getJob(job1.id)!.status).toBe('awaiting_review');
    // 間隔と1日の上限
    expect(research.tick(new Date(t0.getTime() + H)).reason).toMatch(/本日の定期研究の上限|次の定期研究の時刻/);
    const second = research.tick(new Date(t0.getTime() + 25 * H));
    expect(app.repo.getJob(second.jobId!)!.recurringTopicId).toBe(t2.id);
    await app.runner.waitForIdle();
    // 確認待ちが上限（2件）に達したら止める
    expect(research.tick(new Date(t0.getTime() + 50 * H)).reason).toContain('確認待ちの定期研究が2件');
    // 待ち行列の停止中は作らない
    await api(app, 'PUT', '/api/settings', { recurringMaxPending: 5 });
    await api(app, 'POST', '/api/queue/stop', {});
    expect(research.tick(new Date(t0.getTime() + 50 * H)).reason).toBe('待ち行列が停止中です');
    await api(app, 'POST', '/api/queue/start', {});
    // テーマを無効にすると対象外
    await api(app, 'PUT', `/api/research/topics/${t1.id}`, { active: false });
    const third = research.tick(new Date(t0.getTime() + 50 * H));
    expect(app.repo.getJob(third.jobId!)!.recurringTopicId).toBe(t2.id);
    await app.runner.waitForIdle();

    const view = (await api(app, 'GET', '/api/research')).body;
    expect(view.topics.find((t: any) => t.id === t2.id).jobCount).toBe(2);
    expect(view.recent).toHaveLength(3);
    // 定期研究の案件は CEO の操作ではなく自動作成として記録する
    const acts = app.repo.listActivities(job1.id);
    expect(acts[0]).toMatchObject({ actor: 'system' });
    expect(acts[0].message).toContain('定期研究として自動で');
  });

  it('「今すぐ1件」は間隔と有効・無効に関係なく始め、他の上限は守る', async () => {
    app = await makeApp(tempDataDir());
    expect((await api(app, 'POST', '/api/research/run-now', {})).status).toBe(409);
    await api(app, 'POST', '/api/research/topics', { text: '光合成の人工的な再現' });
    const r = await api(app, 'POST', '/api/research/run-now', {});
    expect(r.status).toBe(200);
    expect(r.body.jobId).toBeGreaterThan(0);
    // 前回が終わっていないので2件目は始めない（重複しない）
    expect((await api(app, 'POST', '/api/research/run-now', {})).status).toBe(409);
    await app.runner.waitForIdle();
    expect(app.repo.getSettings().recurringEnabled).toBe(false);
  });
});
