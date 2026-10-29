// 実案件の流れ（作業計画→調査→成果物作成→レビュー→CEO確認）を偽CLIで検証する。
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

const FULL = { ...JOB_INPUT, assigneeId: 'builder', usePlanner: true, useResearch: true, useReviewer: true, adapter: 'claude' };
const ws = (dataDir: string, id: number) => path.join(dataDir, 'workspaces', `job-${id}`);
const probes = (dataDir: string, id: number): any[] => JSON.parse(fs.readFileSync(path.join(ws(dataDir, id), '.fake-probe.json'), 'utf8'));
const detailOf = async (a: App, id: number) => (await api(a, 'GET', `/api/jobs/${id}`)).body;
const stagesRun = (d: any) => d.runs.map((r: any) => `${r.stageKind}${r.stageKind === 'execute' || r.stageKind === 'review' ? r.revision : ''}:${r.status}`);

async function startJob(a: App, input: Record<string, unknown>) {
  const id = (await api(a, 'POST', '/api/jobs', { ...input, startNow: true })).body.job.id as number;
  await a.runner.waitForIdle();
  return id;
}

describe('工程間の引き継ぎとレビュー', () => {
  it('同じ案件の資料と成果物を次の工程の入力として渡し、版と確認対象を記録する', async () => {
    const dataDir = tempDataDir();
    app = await makeApp(dataDir);
    const id = await startJob(app, { ...FULL, details: '国内3社の料金を比較 [fake:samemodel]' });
    const d = await detailOf(app, id);
    expect(d.job.status).toBe('awaiting_review');
    expect(stagesRun(d)).toEqual(['plan:succeeded', 'research:succeeded', 'execute1:succeeded', 'review1:succeeded']);

    const [plan, research, execute, review] = d.runs;
    expect(plan.employeeId).toBe('manager');
    expect(research.employeeId).toBe('researcher');
    expect(execute.employeeId).toBe('builder');
    expect(review.employeeId).toBe('qa');
    // プログラムが入力ファイルを決めて渡す（前の工程の出力が次の工程の入力になる）
    expect(plan.inputs).toEqual(['brief.md', 'reference/company.md']);
    expect(research.inputs).toEqual(expect.arrayContaining(['brief.md', 'outputs/plan.md']));
    expect(execute.inputs).toEqual(expect.arrayContaining(['outputs/plan.md', 'outputs/research.md']));
    // レビューには元の依頼・原資料・成果物を渡す
    expect(review.inputs).toEqual(expect.arrayContaining(['brief.md', 'outputs/research.md', 'outputs/deliverables/result.md', 'outputs/report.md']));
    const reviewPrompt = probes(dataDir, id)[3].stdin as string;
    expect(reviewPrompt).toContain('【入力ファイル】');
    expect(reviewPrompt).toContain('- outputs/deliverables/result.md');
    expect(reviewPrompt).toContain('- outputs/review.md');
    expect(review.verdict).toBe('pass');
    expect(plan.outputs).toEqual(['outputs/plan.md']);
    expect(execute.outputs.sort()).toEqual(['outputs/deliverables/result.md', 'outputs/report.md']);
    expect(execute.usage.inputTokens).toBe(120);

    // 会社情報は確定事項・仮説・未確認を分けて渡し、未入力の実績は補わない
    const company = fs.readFileSync(path.join(ws(dataDir, id), 'reference/company.md'), 'utf8');
    expect(company).toContain('## 未決定・未確認');
    expect(company).toContain('- 実際の売上');
    expect(company).toContain('## 仮説（検証が必要。事実として扱わない）\n- （登録なし）');

    const approval = d.approvals[0];
    expect(approval).toMatchObject({ status: 'pending', revision: 1, reviewVerdict: 'pass' });
    expect(approval.files.map((f: any) => f.title).sort()).toEqual(['deliverables/result.md', 'plan.md', 'report.md', 'research.md', 'review.md']);
    const texts = approval.items.map((i: any) => i.text).join('\n');
    // 同じモデルの別実行を独立した検証とは扱わない
    expect(texts).toContain('同じモデル（fake-model）の別実行');
    // ページ本文を取得できなかった調査は「検索結果のみ」と明示する
    expect(texts).toContain('本文は取得できていません');
  });

  it('レビュー不合格は1回だけ自動で修正し、前の版の成果物とレビューを残す', async () => {
    const dataDir = tempDataDir();
    app = await makeApp(dataDir);
    const id = await startJob(app, { ...FULL, details: '比較表を作る [fake:reviewfail-once]' });
    const d = await detailOf(app, id);
    expect(stagesRun(d)).toEqual(['plan:succeeded', 'research:succeeded', 'execute1:succeeded', 'review1:succeeded', 'execute2:succeeded', 'review2:succeeded']);
    expect(d.runs[3].verdict).toBe('fail');
    expect(d.runs[5].verdict).toBe('pass');
    // 指摘ファイルはプログラムが作り（AIは呼ばない）、修正の工程に入力として渡す
    expect(fs.existsSync(path.join(ws(dataDir, id), 'inputs/review_feedback_r1.md'))).toBe(true);
    expect(d.runs[4].inputs).toEqual(expect.arrayContaining(['inputs/review_feedback_r1.md', 'outputs/review.md', 'outputs/deliverables/result.md']));
    expect(probes(dataDir, id)).toHaveLength(6);

    // 第1版・第2版の成果物とレビューがそれぞれ保存版として残る
    const reviews = d.deliverables.filter((x: any) => x.title === 'review.md');
    expect(reviews.map((x: any) => x.revision)).toEqual([1, 2]);
    expect(reviews.every((x: any) => x.exists)).toBe(true);
    const v1 = (await api(app, 'GET', `/api/deliverables/${reviews[0].id}/content`)).body.content;
    expect(v1).toContain('第1版');

    const approval = d.approvals[0];
    expect(approval).toMatchObject({ revision: 2, reviewVerdict: 'pass' });
    // 確認対象は第2版のファイル（第1版のレビューは含めない）
    expect(approval.deliverableIds).toContain(reviews[1].id);
    expect(approval.deliverableIds).not.toContain(reviews[0].id);
  });

  it('自動修正の上限後も不合格なら、不合格のままCEO確認待ちにする', async () => {
    app = await makeApp(tempDataDir());
    const id = await startJob(app, { ...FULL, details: '比較表を作る [fake:reviewfail]' });
    const d = await detailOf(app, id);
    expect(stagesRun(d)).toEqual(['plan:succeeded', 'research:succeeded', 'execute1:succeeded', 'review1:succeeded', 'execute2:succeeded', 'review2:succeeded']);
    expect(d.job.status).toBe('awaiting_review');
    expect(d.approvals[0]).toMatchObject({ revision: 2, reviewVerdict: 'fail' });
    expect(d.approvals[0].items[0].text).toContain('不合格');
  });

  it('差し戻しコメントを反映した新しい版を作り、承認した版を特定できる（過去の承認を流用しない）', async () => {
    const dataDir = tempDataDir();
    app = await makeApp(dataDir);
    const id = await startJob(app, FULL);
    let d = await detailOf(app, id);
    const first = d.approvals[0];
    await api(app, 'POST', `/api/approvals/${first.id}/decision`, { decision: 'reject', comment: '価格の前提を明記してください' });
    d = await detailOf(app, id);
    expect(d.job.status).toBe('draft');
    expect(d.job.resumePoint).toMatchObject({ stageKind: 'execute', label: '成果物作成' });

    await api(app, 'POST', `/api/jobs/${id}/actions/start`, { from: 'continue' });
    await app.runner.waitForIdle();
    d = await detailOf(app, id);
    // 作業計画・調査はやり直さず、成果物作成から
    expect(stagesRun(d).slice(4)).toEqual(['execute2:succeeded', 'review2:succeeded']);
    const executePrompt = probes(dataDir, id)[4].stdin as string;
    expect(executePrompt).toContain('inputs/ceo_feedback.md');
    expect(fs.readFileSync(path.join(ws(dataDir, id), 'inputs/ceo_feedback.md'), 'utf8')).toContain('【第1版への差し戻し】\n価格の前提を明記してください');

    const [old, next] = d.approvals;
    expect(old).toMatchObject({ status: 'rejected', revision: 1 });
    expect(next).toMatchObject({ status: 'pending', revision: 2 });
    expect(next.deliverableIds).not.toEqual(old.deliverableIds);
    expect((await api(app, 'POST', `/api/approvals/${old.id}/decision`, { decision: 'approve' })).status).toBe(409);
    await api(app, 'POST', `/api/approvals/${next.id}/decision`, { decision: 'approve', comment: 'OK' });
    d = await detailOf(app, id);
    expect(d.job.status).toBe('completed');
    expect(d.job.statusNote).toBe('第2版を承認済み');
    const approved = d.approvals.find((a: any) => a.status === 'approved');
    expect(approved.revision).toBe(2);
    expect(approved.files.find((f: any) => f.title === 'deliverables/result.md').revision).toBe(2);
  });
});

describe('Web調査の可否', () => {
  it('Web検索が使えなければ調査済みと扱わず、調査工程を保留する', async () => {
    app = await makeApp(tempDataDir());
    const id = await startJob(app, { ...FULL, details: '比較 [fake:noweb]' });
    const d = await detailOf(app, id);
    expect(stagesRun(d)).toEqual(['plan:succeeded', 'research:blocked']);
    expect(d.job.status).toBe('paused');
    expect(d.job.statusNote).toContain('Web調査ができませんでした');
    expect(d.approvals).toHaveLength(0);
  });

  it('調査担当に Web 検索が許可されていなければ、AIを呼ばずに保留する', async () => {
    const dataDir = tempDataDir();
    app = await makeApp(dataDir);
    const r = app.repo.getEmployee('researcher')!;
    await api(app, 'PUT', '/api/employees/researcher', { ...r, tools: ['Read', 'Write'] });
    const id = await startJob(app, FULL);
    const d = await detailOf(app, id);
    expect(stagesRun(d)).toEqual(['plan:succeeded', 'research:blocked']);
    expect(probes(dataDir, id)).toHaveLength(1); // 作業計画の1回だけ
    expect(d.runs[1].costNote).toBe('AIを呼び出していません');
    expect(d.job.cost).toEqual({ kind: 'known', usd: 0.0123 });
  });
});

describe('人間に戻す条件と上限', () => {
  it('blocker の確認事項が出たら次の工程へ進まず、回答を添えて再開できる', async () => {
    const dataDir = tempDataDir();
    app = await makeApp(dataDir);
    const id = await startJob(app, { ...FULL, details: '比較 [fake:blocker]' });
    let d = await detailOf(app, id);
    expect(stagesRun(d)).toEqual(['plan:succeeded']);
    expect(d.job.status).toBe('paused');
    expect(d.job.statusNote).toContain('予算が未確定');
    await api(app, 'POST', `/api/jobs/${id}/actions/resume`, { comment: '予算は仮説として扱ってください' });
    await waitFor(() => app!.repo.getJob(id)!.status !== 'queued' && app!.repo.getJob(id)!.status !== 'running');
    d = await detailOf(app, id);
    expect(stagesRun(d)).toEqual(['plan:succeeded', 'research:succeeded', 'execute1:succeeded', 'review1:succeeded']);
    expect(probes(dataDir, id)[1].stdin).toContain('inputs/ceo_feedback.md');
    expect(fs.readFileSync(path.join(ws(dataDir, id), 'inputs/ceo_feedback.md'), 'utf8')).toContain('予算は仮説として扱ってください');
  });

  it('工程ごとの費用上限は案件の残り予算を超えない。案件の上限に達したら開始しない', async () => {
    const dataDir = tempDataDir();
    app = await makeApp(dataDir);
    await api(app, 'PUT', '/api/settings', { maxBudgetUsd: 1, maxJobBudgetUsd: 0.5 });
    const id = await startJob(app, { ...FULL, usePlanner: false, useResearch: false, useReviewer: false });
    const args = probes(dataDir, id)[0].args as string[];
    expect(args[args.indexOf('--max-budget-usd') + 1]).toBe('0.5');

    // 既に上限近くまで使った案件
    const job2 = (await api(app, 'POST', '/api/jobs', { ...FULL, usePlanner: false, useResearch: false, useReviewer: false })).body.job.id;
    const run = app.repo.createRun({ jobId: job2, attempt: 0, revision: 0, stageIndex: 0, stageKind: 'execute', employeeId: 'builder', adapter: 'claude', inputs: [] });
    app.repo.finishRun(run.id, { status: 'succeeded', costUsd: 0.48, costNote: '', numTurns: 1, summary: '', error: '' });
    await api(app, 'POST', `/api/jobs/${job2}/actions/start`, {});
    await app.runner.waitForIdle();
    const d = await detailOf(app, job2);
    expect(d.job.status).toBe('error');
    expect(d.job.errorMessage).toContain('案件の費用上限');
    expect(d.runs).toHaveLength(1);
  });

  it('1回の実行の工程数上限で止め、失敗した工程から続きを実行できる', async () => {
    app = await makeApp(tempDataDir());
    await api(app, 'PUT', '/api/settings', { maxStageRunsPerAttempt: 3 });
    const id = await startJob(app, FULL);
    let d = await detailOf(app, id);
    expect(d.job.status).toBe('error');
    expect(d.job.errorMessage).toContain('工程数の上限（3）');
    expect(d.job.resumePoint).toMatchObject({ stageKind: 'review' });
    await api(app, 'POST', `/api/jobs/${id}/actions/start`, { from: 'continue' });
    await app.runner.waitForIdle();
    d = await detailOf(app, id);
    expect(stagesRun(d)).toEqual(['plan:succeeded', 'research:succeeded', 'execute1:succeeded', 'review1:succeeded']);
    expect(d.job.status).toBe('awaiting_review');
  });

  it('必須の出力ファイルを作らなかった工程は成功扱いにしない', async () => {
    app = await makeApp(tempDataDir());
    const id = await startJob(app, { ...FULL, details: '[fake:nooutput]' });
    const d = await detailOf(app, id);
    expect(stagesRun(d)).toEqual(['plan:failed']);
    expect(d.job.errorMessage).toContain('必須の出力が作成・更新されませんでした: outputs/plan.md');
  });
});

describe('再起動とブラウザ', () => {
  it('実行中に異常終了しても記録が残り、勝手に再実行しない。中断した工程から続けられる', async () => {
    const dataDir = tempDataDir();
    app = await makeApp(dataDir);
    const id = (await api(app, 'POST', '/api/jobs', { ...FULL, details: '[fake:hang]', startNow: true })).body.job.id;
    await waitFor(() => app!.repo.listActivities(id).some((a) => a.message.startsWith('Claude Code を起動')));
    app.repo.db.close(); // 終了処理を経由しない（クラッシュ相当）。偽CLIはテスト終了時に停止する
    app = null;

    app = await makeApp(dataDir);
    await new Promise((r) => setTimeout(r, 300));
    const d = await detailOf(app, id);
    expect(d.job.status).toBe('error');
    expect(d.runs).toHaveLength(1);
    expect(d.runs[0].status).toBe('interrupted');
    expect(d.job.resumePoint).toBeNull(); // 最初の工程（作業計画）なので「最初から」のみ
    expect(app.runner.activeCount()).toBe(0);
  });
});

describe('会社情報と社員の担当', () => {
  it('会社情報は確定事項・仮説・未確認を分けて編集でき、作業ディレクトリに渡される', async () => {
    const dataDir = tempDataDir();
    app = await makeApp(dataDir);
    const state = (await api(app, 'GET', '/api/state')).body;
    expect(state.company.status).toContain('法人設立状況は未確認');
    expect(state.company.unknowns).toEqual(['法人設立状況', '実際の売上', '顧客', '利用予算']);
    expect(state.company.hypotheses).toEqual([]);

    const res = await api(app, 'PUT', '/api/company', { ...state.company, hypotheses: '中小企業の事務作業に需要がある\n', facts: state.company.facts });
    expect(res.status).toBe(200);
    expect(res.body.hypotheses).toEqual(['中小企業の事務作業に需要がある']);
    expect((await api(app, 'PUT', '/api/company', { ...state.company, name: '' })).status).toBe(400);

    const id = await startJob(app, { ...FULL, usePlanner: false, useResearch: false, useReviewer: false });
    expect(fs.readFileSync(path.join(ws(dataDir, id), 'reference/company.md'), 'utf8')).toContain('- 中小企業の事務作業に需要がある');
  });

  it('担当指示・提出形式・人間に戻す条件・参照情報を編集でき、実行時の指示に入る', async () => {
    const dataDir = tempDataDir();
    app = await makeApp(dataDir);
    const b = app.repo.getEmployee('builder')!;
    expect(b.outputFormat).toContain('outputs/deliverables/');
    expect(b.refs).toEqual(expect.arrayContaining(['research', 'review']));
    const res = await api(app, 'PUT', '/api/employees/builder', { ...b, outputFormat: '表形式で書く', escalation: '契約が必要なら止める', refs: ['brief'] });
    expect(res.status).toBe(200);
    expect((await api(app, 'PUT', '/api/employees/builder', { ...b, refs: ['secrets'] })).status).toBe(400);

    const id = await startJob(app, { ...FULL, usePlanner: false, useResearch: false, useReviewer: false });
    const args = probes(dataDir, id)[0].args as string[];
    const system = args[args.indexOf('--append-system-prompt') + 1];
    expect(system).toContain('提出形式:\n表形式で書く');
    expect(system).toContain('人間に戻す条件:\n契約が必要なら止める');
    expect(system).toContain('法人設立状況は未確認');
    expect((await detailOf(app, id)).runs[0].inputs).toEqual(['brief.md']);
  });

  it('編集していない社員だけ新しい担当指示へ更新する', async () => {
    const dataDir = tempDataDir();
    app = await makeApp(dataDir);
    const db = app.repo.db;
    db.prepare(`UPDATE employees SET instructions = '旧指示', defaults_version = 1 WHERE id IN ('manager', 'qa')`).run();
    db.prepare(`UPDATE employees SET updated_at = '2099-01-01T00:00:00.000Z' WHERE id = 'qa'`).run(); // 利用者が編集した社員
    await app.close();
    app = await makeApp(dataDir);
    expect(app.repo.getEmployee('manager')!.instructions).toContain('業務責任者');
    expect(app.repo.getEmployee('qa')!.instructions).toBe('旧指示');
  });
});
