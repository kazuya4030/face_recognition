import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app.ts';
import { api, JOB_INPUT, makeApp, tempDataDir, waitFor } from './helpers.ts';

let app: App | null = null;
afterEach(async () => {
  await app?.close();
  app = null;
});

const employee = (a: App, id: string) => a.office.employeeViews().find((e) => e.id === id)!;
const actions = (detail: any) => Object.fromEntries(detail.job.actions.map((a: any) => [a.action, a.enabled]));

describe('デモ実行での一連の流れ', () => {
  it('登録→開始→社員の状態変化→履歴と成果物→承認→完了', async () => {
    app = await makeApp(tempDataDir(), { demoStepMs: 60 });
    const created = await api(app, 'POST', '/api/jobs', { ...JOB_INPUT, adapter: 'demo' });
    expect(created.status).toBe(201);
    const id = created.body.job.id;
    expect(created.body.job.status).toBe('draft');
    expect(actions(created.body)).toEqual({ start: true, pause: false, resume: false, cancel: true });
    expect(employee(app, 'researcher').status).toBe('idle');

    await api(app, 'POST', `/api/jobs/${id}/actions/start`, {});
    // 作業分解は業務責任者AIが担当する
    await waitFor(() => employee(app!, 'manager').status === 'working');
    await waitFor(() => employee(app!, 'researcher').status === 'working');
    await app.runner.waitForIdle();

    const detail = (await api(app, 'GET', `/api/jobs/${id}`)).body;
    expect(detail.job.status).toBe('awaiting_review');
    expect(detail.runs.map((r: any) => [r.stageKind, r.status])).toEqual([
      ['plan', 'succeeded'],
      ['execute', 'succeeded'],
      ['review', 'succeeded'],
    ]);
    expect(detail.deliverables.map((d: any) => d.title).sort()).toEqual(['deliverable.md', 'plan.md', 'review.md']);
    expect(detail.deliverables.every((d: any) => d.exists && d.isDemo)).toBe(true);
    expect(detail.activities.some((a: any) => a.kind === 'action' && a.message.includes('［デモ］'))).toBe(true);
    expect(employee(app, 'researcher').status).toBe('waiting_review');
    expect(employee(app, 'qa').status).toBe('waiting_review');

    const content = (await api(app, 'GET', `/api/deliverables/${detail.deliverables[0].id}/content`)).body;
    expect(content.content).toContain('【デモ出力】');

    const approval = detail.approvals.find((a: any) => a.status === 'pending');
    expect(approval.items.length).toBeGreaterThan(0);
    const decided = await api(app, 'POST', `/api/approvals/${approval.id}/decision`, { decision: 'approve', comment: '確認しました' });
    expect(decided.body.status).toBe('approved');

    const after = (await api(app, 'GET', `/api/jobs/${id}`)).body;
    expect(after.job.status).toBe('completed');
    expect(after.approvals[0].ceoComment).toBe('確認しました');
    expect(after.job.cost.kind).toBe('none');
    expect(employee(app, 'researcher').status).toBe('done');
    // 二重承認はできない
    expect((await api(app, 'POST', `/api/approvals/${approval.id}/decision`, { decision: 'approve' })).status).toBe(409);
  });

  it('差し戻しはコメント必須で、再実行時に依頼書へ反映される', async () => {
    const dataDir = tempDataDir();
    app = await makeApp(dataDir);
    const id = (await api(app, 'POST', '/api/jobs', { ...JOB_INPUT, adapter: 'demo', startNow: true })).body.job.id;
    await app.runner.waitForIdle();
    const approvalId = (await api(app, 'GET', `/api/jobs/${id}`)).body.job.pendingApprovalId;
    expect((await api(app, 'POST', `/api/approvals/${approvalId}/decision`, { decision: 'reject', comment: '' })).status).toBe(400);
    await api(app, 'POST', `/api/approvals/${approvalId}/decision`, { decision: 'reject', comment: '出典のURLを追加してください' });

    let detail = (await api(app, 'GET', `/api/jobs/${id}`)).body;
    expect(detail.job.status).toBe('draft');
    expect(detail.approvals[0].status).toBe('rejected');

    await api(app, 'POST', `/api/jobs/${id}/actions/start`, {});
    await app.runner.waitForIdle();
    detail = (await api(app, 'GET', `/api/jobs/${id}`)).body;
    expect(detail.job.attempt).toBe(2);
    expect(detail.job.status).toBe('awaiting_review');
    expect(detail.approvals.map((a: any) => a.status)).toEqual(['rejected', 'pending']);
    const brief = fs.readFileSync(path.join(dataDir, 'workspaces', `job-${id}`, 'brief.md'), 'utf8');
    expect(brief).toContain('出典のURLを追加してください');
  });

  it('エラーを記録し、完了扱いにしない', async () => {
    app = await makeApp(tempDataDir());
    const id = (await api(app, 'POST', '/api/jobs', { ...JOB_INPUT, adapter: 'demo', demoScenario: 'error', startNow: true })).body.job.id;
    await app.runner.waitForIdle();
    const detail = (await api(app, 'GET', `/api/jobs/${id}`)).body;
    expect(detail.job.status).toBe('error');
    expect(detail.job.column).toBe('error');
    expect(detail.job.errorMessage).toContain('エラー再現');
    expect(detail.runs.at(-1).status).toBe('failed');
    expect(detail.approvals).toHaveLength(0);
    expect(employee(app, 'researcher').status).toBe('error');
    // エラー後は再実行（開始）が可能
    expect(actions(detail).start).toBe(true);
  });

  it('タイムアウトを記録する', async () => {
    app = await makeApp(tempDataDir());
    await api(app, 'PUT', '/api/settings', { demoTimeoutSec: 5 });
    const id = (await api(app, 'POST', '/api/jobs', { ...JOB_INPUT, adapter: 'demo', demoScenario: 'timeout', usePlanner: false, startNow: true })).body.job.id;
    await app.runner.waitForIdle(15000);
    const detail = (await api(app, 'GET', `/api/jobs/${id}`)).body;
    expect(detail.job.status).toBe('error');
    expect(detail.job.errorMessage).toContain('タイムアウト');
    expect(detail.runs.at(-1).status).toBe('timeout');
  }, 20000);

  it('実行中のキャンセルを記録する', async () => {
    app = await makeApp(tempDataDir(), { demoStepMs: 300 });
    const id = (await api(app, 'POST', '/api/jobs', { ...JOB_INPUT, adapter: 'demo', startNow: true })).body.job.id;
    await waitFor(() => app!.repo.getJob(id)!.status === 'running');
    const res = await api(app, 'POST', `/api/jobs/${id}/actions/cancel`, {});
    expect(res.status).toBe(200);
    await app.runner.waitForIdle();
    const detail = (await api(app, 'GET', `/api/jobs/${id}`)).body;
    expect(detail.job.status).toBe('cancelled');
    expect(detail.runs.at(-1).status).toBe('cancelled');
    expect(actions(detail)).toEqual({ start: false, pause: false, resume: false, cancel: false });
    expect((await api(app, 'POST', `/api/jobs/${id}/actions/start`, {})).status).toBe(409);
  });

  it('一時停止と再開（デモは手順の区切りで停止し、続きから再開する）', async () => {
    app = await makeApp(tempDataDir(), { demoStepMs: 150 });
    const id = (await api(app, 'POST', '/api/jobs', { ...JOB_INPUT, adapter: 'demo', usePlanner: false, useReviewer: false, startNow: true })).body.job.id;
    await waitFor(() => app!.repo.getJob(id)!.status === 'running');
    await api(app, 'POST', `/api/jobs/${id}/actions/pause`, {});
    await app.runner.waitForIdle();
    let detail = (await api(app, 'GET', `/api/jobs/${id}`)).body;
    expect(detail.job.status).toBe('paused');
    expect(detail.runs.at(-1).status).toBe('paused');
    expect(actions(detail).resume).toBe(true);
    const pausedStep = detail.job.currentStepIndex;
    expect(pausedStep).toBeGreaterThan(0);

    await api(app, 'POST', `/api/jobs/${id}/actions/resume`, {});
    await app.runner.waitForIdle();
    detail = (await api(app, 'GET', `/api/jobs/${id}`)).body;
    expect(detail.job.status).toBe('awaiting_review');
    expect(detail.activities.some((a: any) => a.message.includes(`手順${pausedStep + 1}から再開`))).toBe(true);
  });

  it('同時実行数は1で、後の案件は実行待ちになる', async () => {
    app = await makeApp(tempDataDir(), { demoStepMs: 100 });
    const a = (await api(app, 'POST', '/api/jobs', { ...JOB_INPUT, adapter: 'demo', startNow: true })).body.job.id;
    const b = (await api(app, 'POST', '/api/jobs', { ...JOB_INPUT, title: '2件目', adapter: 'demo', startNow: true })).body.job.id;
    await waitFor(() => app!.repo.getJob(a)!.status === 'running');
    expect(app.repo.getJob(b)!.status).toBe('queued');
    expect(app.runner.activeCount()).toBe(1);
    await app.runner.waitForIdle();
    expect(app.repo.getJob(b)!.status).toBe('awaiting_review');
  });

  it('入力の検証: 必須項目・存在しない担当', async () => {
    app = await makeApp(tempDataDir());
    expect((await api(app, 'POST', '/api/jobs', { ...JOB_INPUT, title: '' })).status).toBe(400);
    expect((await api(app, 'POST', '/api/jobs', { ...JOB_INPUT, assigneeId: 'nobody' })).status).toBe(400);
    expect((await api(app, 'PUT', '/api/settings', { maxTurns: 100000 })).status).toBe(400);
  });

  it('実行回数の上限を超えて開始できない', async () => {
    app = await makeApp(tempDataDir());
    await api(app, 'PUT', '/api/settings', { maxAttemptsPerJob: 1 });
    const id = (await api(app, 'POST', '/api/jobs', { ...JOB_INPUT, adapter: 'demo', demoScenario: 'error', startNow: true })).body.job.id;
    await app.runner.waitForIdle();
    const detail = (await api(app, 'GET', `/api/jobs/${id}`)).body;
    expect(detail.job.actions.find((a: any) => a.action === 'start')).toMatchObject({ enabled: false });
    expect((await api(app, 'POST', `/api/jobs/${id}/actions/start`, {})).status).toBe(409);
  });
});

describe('再起動', () => {
  it('記録が残り、中断した仕事は自動で再実行しない', async () => {
    const dataDir = tempDataDir();
    app = await makeApp(dataDir);
    const done = (await api(app, 'POST', '/api/jobs', { ...JOB_INPUT, adapter: 'demo', startNow: true })).body.job.id;
    await app.runner.waitForIdle();
    const approvalId = app.repo.listApprovals(done)[0].id;
    await api(app, 'POST', `/api/approvals/${approvalId}/decision`, { decision: 'approve', comment: 'OK' });

    // 異常終了を再現: 実行中のまま残った案件と、実行待ちの案件
    const crashed = app.repo.createJob({ ...JOB_INPUT, usePlanner: false, useReviewer: false, adapter: 'demo', demoScenario: 'normal' });
    app.repo.updateJob(crashed.id, { status: 'running', attempt: 1 });
    app.repo.createRun({ jobId: crashed.id, attempt: 1, stageIndex: 0, stageKind: 'execute', employeeId: 'researcher', adapter: 'demo' });
    const queued = app.repo.createJob({ ...JOB_INPUT, usePlanner: false, useReviewer: false, adapter: 'demo', demoScenario: 'normal' });
    app.repo.updateJob(queued.id, { status: 'queued' });
    app.repo.db.close(); // サーバーの終了処理を経由せずに閉じる（クラッシュ相当）
    app = null;

    app = await makeApp(dataDir);
    await new Promise((r) => setTimeout(r, 200));

    const doneDetail = (await api(app, 'GET', `/api/jobs/${done}`)).body;
    expect(doneDetail.job.status).toBe('completed');
    expect(doneDetail.approvals[0]).toMatchObject({ status: 'approved', ceoComment: 'OK' });
    expect(doneDetail.deliverables.length).toBe(3);
    expect(doneDetail.deliverables.every((d: any) => d.exists)).toBe(true);
    expect(doneDetail.activities.length).toBeGreaterThan(5);

    const crashedDetail = (await api(app, 'GET', `/api/jobs/${crashed.id}`)).body;
    expect(crashedDetail.job.status).toBe('error');
    expect(crashedDetail.job.errorMessage).toContain('自動では再実行しません');
    expect(crashedDetail.runs).toHaveLength(1);
    expect(crashedDetail.runs[0].status).toBe('interrupted');

    const queuedDetail = (await api(app, 'GET', `/api/jobs/${queued.id}`)).body;
    expect(queuedDetail.job.status).toBe('paused');
    expect(queuedDetail.runs).toHaveLength(0);
  });

  it('終了時に実行中の工程は中断として記録される', async () => {
    const dataDir = tempDataDir();
    app = await makeApp(dataDir, { demoStepMs: 500 });
    const id = (await api(app, 'POST', '/api/jobs', { ...JOB_INPUT, adapter: 'demo', startNow: true })).body.job.id;
    await waitFor(() => app!.repo.getJob(id)!.status === 'running');
    await app.close();
    app = await makeApp(dataDir);
    const detail = (await api(app, 'GET', `/api/jobs/${id}`)).body;
    expect(detail.job.status).toBe('error');
    expect(detail.runs.at(-1).status).toBe('interrupted');
  });
});

describe('オフィスの出来事（演出用イベント）', () => {
  it('実行・引き継ぎ・成果物・承認の記録から導出する', async () => {
    app = await makeApp(tempDataDir());
    const id = (await api(app, 'POST', '/api/jobs', { ...JOB_INPUT, adapter: 'demo', startNow: true })).body.job.id;
    await app.runner.waitForIdle();
    const approvalId = app.repo.listApprovals(id)[0].id;
    await api(app, 'POST', `/api/approvals/${approvalId}/decision`, { decision: 'approve', comment: '' });

    const events = (await api(app, 'GET', '/api/office/events')).body as any[];
    const types = events.map((e) => e.type);
    expect(types.filter((t) => t === 'work_started')).toHaveLength(3);
    const handoffs = events.filter((e) => e.type === 'handoff');
    expect(handoffs.map((h) => [h.employeeId, h.toEmployeeId, h.label])).toEqual([
      ['manager', 'researcher', '引き継ぎ'],
      ['researcher', 'qa', 'レビュー依頼'],
    ]);
    expect(events.filter((e) => e.type === 'deliverable_saved').every((e) => e.deliverableId && e.toEmployeeId === 'shelf')).toBe(true);
    expect(events.find((e) => e.type === 'approval_requested')).toMatchObject({ toEmployeeId: 'ceo', approvalId });
    expect(events.at(-1)).toMatchObject({ type: 'approved', jobId: id });
    // 同じ出来事は同じキーを返す（画面の既読管理に使う）
    const again = (await api(app, 'GET', '/api/office/events')).body as any[];
    expect(again.map((e) => e.key)).toEqual(events.map((e) => e.key));
  });

  it('エラーとキャンセルも出来事になる', async () => {
    app = await makeApp(tempDataDir());
    await api(app, 'POST', '/api/jobs', { ...JOB_INPUT, adapter: 'demo', demoScenario: 'error', usePlanner: false, startNow: true });
    await app.runner.waitForIdle();
    const events = (await api(app, 'GET', '/api/office/events')).body as any[];
    expect(events.at(-1)).toMatchObject({ type: 'error', employeeId: 'researcher' });
  });
});

describe('社員の仮の名前', () => {
  it('初期名のまま変更されていない社員だけを新しい仮の名前にする', async () => {
    const dataDir = tempDataDir();
    app = await makeApp(dataDir);
    // 以前の初期名を再現（researcher は利用者が編集済み）
    app.repo.db.prepare(`UPDATE employees SET name = '業務責任者AI', role_title = '業務責任者' WHERE id = 'manager'`).run();
    app.repo.db.prepare(`UPDATE employees SET name = '調査・企画AI', updated_at = '2099-01-01T00:00:00.000Z' WHERE id = 'researcher'`).run();
    await app.close();
    app = await makeApp(dataDir);
    expect(app.repo.getEmployee('manager')).toMatchObject({ name: 'ハル', roleTitle: '業務責任者AI' });
    expect(app.repo.getEmployee('researcher')!.name).toBe('調査・企画AI');
  });
});
