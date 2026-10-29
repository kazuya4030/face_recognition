// 業務管理層。CEOの操作（依頼・開始・停止・承認など）と、画面向けの集計を担当する。
// AI実行の詳細は JobRunner / アダプターに任せ、ここでは状態遷移の正しさだけを保証する。
import fs from 'node:fs';
import { availableActions, boardColumnOf, resumeStageIndex, stagesOf, type ActionState } from '../domain/jobState.ts';
import {
  NOT_CALLED_NOTE,
  SETTINGS_LIMITS,
  type AdapterId,
  type Approval,
  type CompanyProfile,
  type DemoScenario,
  type Employee,
  type EmployeeStatus,
  type Job,
  type JobAction,
  type RefKey,
  type ReviewItem,
  type Settings,
  type StageKind,
} from '../domain/types.ts';
import type { ChangeBus } from '../events.ts';
import type { ExecutionAdapter } from '../runner/adapter.ts';
import type { JobRunner } from '../runner/jobRunner.ts';
import { isTextMime, snapshotPathFor, stageLabel } from '../runner/workspace.ts';
import { now, type Repo } from '../store/repo.ts';
import { deriveOfficeEvents } from './officeEvents.ts';

import { UserError } from './errors.ts';

export { UserError };

const LIMITS = {
  title: 120,
  purpose: 2000,
  details: 8000,
  acceptanceCriteria: 4000,
  comment: 4000,
  employeeName: 40,
  roleTitle: 40,
  description: 400,
  instructions: 4000,
  outputFormat: 2000,
  escalation: 2000,
  feedback: 12000,
  companyItem: 300,
  companyItems: 30,
};

const REF_KEYS: RefKey[] = ['brief', 'company', 'plan', 'research', 'deliverables', 'review', 'feedback'];

function lines(v: unknown, field: string): string[] {
  const raw = Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split('\n') : [];
  const out = raw.map((x) => x.trim()).filter(Boolean);
  if (out.length > LIMITS.companyItems) throw new UserError(`${field}は${LIMITS.companyItems}項目以内にしてください`);
  for (const x of out) if (x.length > LIMITS.companyItem) throw new UserError(`${field}の各項目は${LIMITS.companyItem}文字以内で入力してください`);
  return out;
}

const ALLOWED_TOOLS = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebSearch', 'WebFetch'];

export function text(v: unknown, field: string, max: number, required = false): string {
  if (v == null) v = '';
  if (typeof v !== 'string') throw new UserError(`${field}は文字列で入力してください`);
  const s = v.trim();
  if (required && !s) throw new UserError(`${field}を入力してください`);
  if (s.length > max) throw new UserError(`${field}は${max}文字以内で入力してください`);
  return s;
}

export interface EmployeeView extends Employee {
  status: EmployeeStatus;
  statusDetail: string;
  currentJob: { id: number; title: string; stage: string } | null;
  queuedJobs: { id: number; title: string }[];
  pendingApprovals: { id: number; jobId: number; title: string; itemCount: number; items: ReviewItem[] }[];
  recentDeliverables: { id: number; jobId: number; title: string; isDemo: boolean; createdAt: string }[];
  /** この社員の直近の記録（実行の開始・終了、成果物、確認依頼）の時刻。記録がなければ null。 */
  lastActivityAt: string | null;
}

export class OfficeService {
  constructor(
    private readonly repo: Repo,
    private readonly runner: JobRunner,
    private readonly adapters: Record<AdapterId, ExecutionAdapter>,
    private readonly dataDir: string,
    private readonly bus: ChangeBus,
  ) {}

  // ---- 参照 ----

  adapterInfo() {
    return Object.values(this.adapters).map((a) => ({
      id: a.id,
      label: a.label,
      isDemo: a.isDemo,
      supportsStepPause: a.supportsStepPause,
      ...a.availability(),
    }));
  }

  actionsFor(job: Job, adapterId: AdapterId = job.adapter): ActionState[] {
    const adapter = this.adapters[adapterId];
    const avail = adapter.availability();
    const settings = this.repo.getSettings();
    return availableActions(job, {
      adapterAvailable: avail.ok,
      adapterUnavailableReason: `「${adapter.label}」は現在利用できません（${avail.detail}）`,
      adapterSupportsStepPause: adapter.supportsStepPause,
      stageCount: stagesOf(job, this.repo.listEmployees()).length,
      maxAttemptsPerJob: settings.maxAttemptsPerJob,
    });
  }

  jobSummary(job: Job, employees: Employee[]) {
    const stages = stagesOf(job, employees);
    const stage = stages[job.currentStageIndex];
    const runs = this.repo.listRuns(job.id);
    const costs = runs.map((r) => r.costUsd);
    // AIを呼ばずに保留した工程は費用の集計に含めない
    const realRuns = runs.filter((r) => r.adapter !== 'demo' && r.costNote !== NOT_CALLED_NOTE);
    return {
      ...job,
      column: boardColumnOf(job.status),
      stages: stages.map((s) => ({ ...s, label: stageLabel(s.kind), employeeName: employees.find((e) => e.id === s.employeeId)?.name ?? s.employeeId })),
      currentStageLabel: stage ? stageLabel(stage.kind) : '',
      // 「続きから開始」できる工程（差し戻し後は成果物作成、失敗・中断後は失敗した工程）
      resumePoint: (() => {
        const ri = resumeStageIndex(job, stages);
        return ri == null ? null : { stageKind: stages[ri].kind, label: stageLabel(stages[ri].kind) };
      })(),
      deliverableCount: this.repo.listDeliverables(job.id).length,
      pendingApprovalId: this.repo.listApprovals(job.id).find((a) => a.status === 'pending')?.id ?? null,
      // 費用: 実接続の実行で1件でも未取得があれば合計は出さない（推測値を実績として見せない）。
      cost:
        realRuns.length === 0
          ? { kind: 'none' as const }
          : realRuns.some((r) => r.costUsd == null)
            ? { kind: 'partial' as const, knownUsd: costs.reduce<number>((s, c) => s + (c ?? 0), 0) }
            : { kind: 'known' as const, usd: realRuns.reduce((s, r) => s + (r.costUsd ?? 0), 0) },
      actions: this.actionsFor(job),
      // 実行方式を切り替えて開始する場合の可否（未着手・エラーの案件のみ切り替え可能）。
      startOptions: Object.values(this.adapters).map((a) => ({
        adapter: a.id,
        ...this.actionsFor(job, a.id).find((x) => x.action === 'start')!,
      })),
    };
  }

  employeeViews(): EmployeeView[] {
    const employees = this.repo.listEmployees();
    const jobs = this.repo.listJobs();
    const runs = this.repo.listRuns();
    const approvals = this.repo.listApprovals().filter((a) => a.status === 'pending');
    const deliverables = this.repo.listDeliverables();
    const jobById = new Map(jobs.map((j) => [j.id, j]));

    return employees.map((e): EmployeeView => {
      const myRuns = runs.filter((r) => r.employeeId === e.id);
      const runningRun = myRuns.find((r) => r.status === 'running');
      const awaitingJob = jobs.find(
        (j) => j.status === 'awaiting_review' && (j.assigneeId === e.id || myRuns.some((r) => r.jobId === j.id && r.attempt === j.attempt)),
      );
      const lastRun = myRuns[myRuns.length - 1];
      const lastRunJob = lastRun ? jobById.get(lastRun.jobId) : undefined;

      let status: EmployeeStatus = 'idle';
      let statusDetail = '依頼を待っています';
      let currentJob: EmployeeView['currentJob'] = null;
      if (runningRun) {
        const j = jobById.get(runningRun.jobId)!;
        status = 'working';
        statusDetail = `「${stageLabel(runningRun.stageKind)}」を実行中（${runningRun.adapter === 'demo' ? 'デモ実行' : 'Claude Code'}）`;
        currentJob = { id: j.id, title: j.title, stage: stageLabel(runningRun.stageKind) };
      } else if (awaitingJob) {
        status = 'waiting_review';
        statusDetail = 'CEOの確認を待っています';
        currentJob = { id: awaitingJob.id, title: awaitingJob.title, stage: '確認待ち' };
      } else if (lastRun && lastRunJob && lastRunJob.status === 'error' && lastRun.attempt === lastRunJob.attempt && lastRun.status !== 'succeeded') {
        status = 'error';
        statusDetail = lastRunJob.errorMessage || 'エラーで停止しました';
        currentJob = { id: lastRunJob.id, title: lastRunJob.title, stage: stageLabel(lastRun.stageKind) };
      } else if (lastRun && lastRunJob && lastRunJob.status === 'completed') {
        status = 'done';
        statusDetail = '直近の案件は承認済みです';
        currentJob = { id: lastRunJob.id, title: lastRunJob.title, stage: '完了' };
      }

      const queuedJobs = jobs
        .filter((j) => (j.status === 'queued' || j.status === 'paused') && stagesOf(j, employees).some((s) => s.employeeId === e.id))
        .map((j) => ({ id: j.id, title: j.title }));
      const pendingApprovals = approvals
        .filter((a) => a.requestedBy === e.id || runs.some((r) => r.jobId === a.jobId && r.attempt === a.attempt && r.employeeId === e.id))
        .map((a) => ({ id: a.id, jobId: a.jobId, title: a.title, itemCount: a.items.length, items: a.items }));
      const mine = deliverables.filter((d) => d.employeeId === e.id);
      const recentDeliverables = mine.slice(0, 5).map((d) => ({ id: d.id, jobId: d.jobId, title: d.title, isDemo: d.isDemo, createdAt: d.createdAt }));
      const times = [
        ...myRuns.flatMap((r) => [r.startedAt, r.finishedAt]),
        ...mine.map((d) => d.createdAt),
        ...pendingApprovals.map((a) => approvals.find((x) => x.id === a.id)?.createdAt ?? null),
      ].filter((t): t is string => t != null);
      const lastActivityAt = times.length > 0 ? times.reduce((m, t) => (t > m ? t : m)) : null;
      return { ...e, status, statusDetail, currentJob, queuedJobs, pendingApprovals, recentDeliverables, lastActivityAt };
    });
  }

  snapshot() {
    const employees = this.repo.listEmployees();
    const jobs = this.repo.listJobs().map((j) => this.jobSummary(j, employees));
    const approvals = this.repo.listApprovals();
    return {
      version: this.bus.currentVersion(),
      company: (() => {
        const c = this.repo.getCompany();
        return { ...c, note: c.status };
      })(),
      employees: this.employeeViews(),
      jobs,
      approvals: approvals.map((a) => ({ ...this.approvalView(a), jobTitle: jobs.find((j) => j.id === a.jobId)?.title ?? '', jobAdapter: jobs.find((j) => j.id === a.jobId)?.adapter ?? 'demo' })),
      settings: this.repo.getSettings(),
      queueRunning: this.repo.queueRunning(),
      adapters: this.adapterInfo(),
      runner: { active: this.runner.activeCount(), maxConcurrent: 1 },
    };
  }

  /** オフィス画面の演出用イベント（直近のみ）。実行履歴・成果物・承認の記録から導出する。 */
  officeEvents(limit = 40) {
    return deriveOfficeEvents(this.repo.listJobs(), this.repo.listRuns(), this.repo.listDeliverables(), this.repo.listApprovals(), limit);
  }

  jobDetail(id: number) {
    const job = this.repo.getJob(id);
    if (!job) throw new UserError('案件が見つかりません', 404);
    const employees = this.repo.listEmployees();
    return {
      job: this.jobSummary(job, employees),
      runs: this.repo.listRuns(id),
      activities: this.repo.listActivities(id),
      deliverables: this.deliverablesWithExistence(id),
      approvals: this.repo.listApprovals(id).map((a) => this.approvalView(a)),
      attachments: this.repo.listAttachments(id),
      questions: this.repo.listQuestions(id),
      notes: this.repo.listNotes(id),
      // 開始時に固定した会社の記憶（ID・版・その版の内容）
      memoryUsed: job.memoryRefs.map((r) => ({ ...r, ...(this.repo.memoryVersion(r) ?? { kind: 'policy' as const, text: '（記録なし）' }) })),
    };
  }

  templates() {
    return this.repo.listTemplates();
  }

  /** 確認依頼と、その対象の保存版（どの版のどのファイルを承認・差し戻ししたか）。 */
  approvalView(a: Approval) {
    const byId = new Map(this.repo.listDeliverables(a.jobId).map((d) => [d.id, d]));
    return {
      ...a,
      files: a.deliverableIds
        .map((id) => byId.get(id))
        .filter((d) => d != null)
        .map((d) => ({ id: d.id, title: d.title, revision: d.revision, stageKind: d.stageKind, sha256: d.sha256, size: d.size, isDemo: d.isDemo })),
    };
  }

  /** 保存済みの実ファイルがある成果物だけに閲覧・ダウンロードを許す。 */
  deliverablesWithExistence(jobId?: number) {
    return this.repo.listDeliverables(jobId).map((d) => ({
      ...d,
      exists: fs.existsSync(snapshotPathFor(this.dataDir, d)),
      previewable: isTextMime(d.mime),
    }));
  }

  private findDeliverable(id: number) {
    const d = this.repo.getDeliverable(id);
    if (!d) throw new UserError('成果物が見つかりません', 404);
    return { ...d, exists: fs.existsSync(snapshotPathFor(this.dataDir, d)), previewable: isTextMime(d.mime) };
  }

  deliverableContent(id: number) {
    const d = this.findDeliverable(id);
    if (!d.exists || !d.previewable) return { deliverable: d, content: null as string | null, truncated: false };
    const buf = fs.readFileSync(snapshotPathFor(this.dataDir, d));
    const max = 300 * 1024;
    return { deliverable: d, content: buf.subarray(0, max).toString('utf8') as string | null, truncated: buf.length > max };
  }

  deliverableFile(id: number): { path: string; name: string; mime: string } {
    const d = this.findDeliverable(id);
    if (!d.exists) throw new UserError('成果物のファイルが存在しません', 404);
    return { path: snapshotPathFor(this.dataDir, d), name: d.title.split('/').pop() ?? 'file', mime: d.mime };
  }

  // ---- 操作 ----

  createJob(body: Record<string, unknown>): Job {
    const employees = this.repo.listEmployees();
    const assigneeId = text(body.assigneeId, '担当社員', 64, true);
    if (!employees.some((e) => e.id === assigneeId)) throw new UserError('担当社員が存在しません');
    const adapter = (body.adapter ?? this.repo.getSettings().defaultAdapter) as AdapterId;
    if (!(adapter in this.adapters)) throw new UserError('実行方式が不正です');
    const scenario = (body.demoScenario ?? 'normal') as DemoScenario;
    if (!['normal', 'error', 'timeout', 'rework'].includes(scenario)) throw new UserError('デモシナリオが不正です');
    const stageInstructions = parseStageInstructions(body.stageInstructions);
    const templateId = body.templateId == null || body.templateId === '' ? null : text(body.templateId, 'テンプレート', 64);
    if (templateId && !this.repo.listTemplates().some((t) => t.id === templateId)) throw new UserError('テンプレートが存在しません');
    const job = this.repo.createJob({
      title: text(body.title, 'タイトル', LIMITS.title, true),
      purpose: text(body.purpose, '目的', LIMITS.purpose, true),
      details: text(body.details, '依頼内容', LIMITS.details, true),
      acceptanceCriteria: text(body.acceptanceCriteria, '完了条件', LIMITS.acceptanceCriteria, true),
      assigneeId,
      usePlanner: body.usePlanner !== false,
      useResearch: body.useResearch === true,
      useReviewer: body.useReviewer !== false,
      adapter,
      demoScenario: adapter === 'demo' ? scenario : 'normal',
      reviewPlan: body.reviewPlan === true,
      researchWeb: body.researchWeb !== false,
      templateId,
      stageInstructions,
    });
    this.ceoLog(job.id, `案件を登録（担当: ${employees.find((e) => e.id === assigneeId)?.name}、実行方式: ${this.adapters[adapter].label}）`);
    if (body.startNow === true) this.applyAction(job.id, 'start', {});
    this.bus.changed(job.id);
    return this.repo.getJob(job.id)!;
  }

  applyAction(id: number, action: JobAction, body: Record<string, unknown>): Job {
    let job = this.repo.getJob(id);
    if (!job) throw new UserError('案件が見つかりません', 404);

    if (action === 'start' && body.adapter != null) {
      const adapter = body.adapter as AdapterId;
      if (!(adapter in this.adapters)) throw new UserError('実行方式が不正です');
      if ((job.status === 'draft' || job.status === 'error') && adapter !== job.adapter) {
        this.repo.setJobAdapter(id, adapter);
        job = this.repo.getJob(id)!;
      }
    }

    const state = this.actionsFor(job).find((a) => a.action === action);
    if (!state?.enabled) throw new UserError(state?.reason || 'この操作は現在できません', 409);

    switch (action) {
      case 'start': {
        // from: 'continue' は差し戻し後・失敗後に、前の工程の出力（作業計画・調査結果）を引き継いで途中の工程から始める
        const from = body.from === 'continue' ? 'continue' : 'beginning';
        const resumeAt = from === 'continue' ? resumeStageIndex(job, stagesOf(job, this.repo.listEmployees())) : 0;
        if (resumeAt == null) throw new UserError('続きから開始できる工程がありません。最初から開始してください。', 409);
        // 実行に使う資料と会社の記憶の版を、開始時点で固定する
        const attachmentIds = this.repo.listAttachments(id).filter((a) => !a.removedAt).map((a) => a.id);
        const memoryRefs = this.repo.listMemory().map((m) => ({ id: m.id, version: m.version }));
        job = this.repo.updateJob(id, {
          status: 'queued',
          attempt: job.attempt + 1,
          reviewRounds: 0,
          attachmentIds,
          memoryRefs,
          holdKind: null,
          holdSince: null,
          queueOrder: this.nextQueueOrder(),
          currentStageIndex: resumeAt,
          currentStepIndex: 0,
          pauseRequested: false,
          errorMessage: '',
          statusNote: '',
          startedAt: null,
          finishedAt: null,
        });
        const stagesNow = stagesOf(job, this.repo.listEmployees());
        this.ceoLog(
          id,
          `開始を指示（${job.attempt}回目、${this.adapters[job.adapter].label}、${resumeAt > 0 ? `「${stageLabel(stagesNow[resumeAt].kind)}」から` : '最初の工程から'}、資料${attachmentIds.length}件・会社の記憶${memoryRefs.length}件を固定）${this.repo.queueRunning() ? '' : '。待ち行列が停止中のため、待ち行列を開始すると実行されます'}`,
        );
        break;
      }
      case 'pause':
        if (job.status === 'queued') {
          job = this.repo.updateJob(id, { status: 'paused', statusNote: 'CEOの指示で保留中' });
          this.ceoLog(id, '実行待ちを保留に変更');
        } else {
          job = this.repo.updateJob(id, { pauseRequested: true });
          this.ceoLog(id, '一時停止を要求（区切りで停止します）');
        }
        break;
      case 'resume': {
        // 停止中の確認事項への回答があれば、以降の工程の入力（CEOからのコメント）に加える
        const answer = text(body.comment, '回答', LIMITS.comment);
        const feedback = answer ? appendFeedback(job.feedback, `【再開時の回答（${job.statusNote ? truncateNote(job.statusNote) : '一時停止中'}）】\n${answer}`) : job.feedback;
        if (answer) this.repo.addNote({ jobId: id, kind: 'resume', revision: job.revision, text: answer });
        job = this.repo.updateJob(id, { status: 'queued', pauseRequested: false, statusNote: '', feedback, holdKind: null, holdSince: null });
        this.ceoLog(id, `再開を指示${answer ? `（回答: ${answer}）` : ''}`);
        break;
      }
      case 'halt':
        this.runner.halt(id);
        this.ceoLog(id, '実行中の工程を止めるよう指示（案件は保留になり、再開するとその工程をやり直します）');
        break;
      case 'cancel':
        if (this.runner.isActive(id)) {
          this.runner.cancel(id);
          this.ceoLog(id, 'キャンセルを指示（実行中の処理を停止します）');
        } else {
          job = this.repo.updateJob(id, { status: 'cancelled', finishedAt: now(), pauseRequested: false, statusNote: '', holdKind: null, holdSince: null });
          for (const a of this.repo.listApprovals(id)) if (a.status === 'pending') this.repo.decideApproval(a.id, 'superseded', '');
          this.ceoLog(id, 'キャンセル');
        }
        break;
    }
    this.bus.changed(id);
    this.runner.kick();
    return this.repo.getJob(id)!;
  }

  decideApproval(id: number, decision: 'approve' | 'reject', commentRaw: unknown): Approval {
    const approval = this.repo.getApproval(id);
    if (!approval) throw new UserError('確認事項が見つかりません', 404);
    if (approval.status !== 'pending') throw new UserError('この確認事項は既に処理済みです', 409);
    const job = this.repo.getJob(approval.jobId)!;
    if (job.status !== 'awaiting_review') throw new UserError('案件が確認待ちの状態ではありません', 409);
    const comment = text(commentRaw, 'コメント', LIMITS.comment, decision === 'reject');

    this.repo.transaction(() => {
      if (decision === 'approve') {
        this.repo.decideApproval(id, 'approved', comment);
        this.repo.updateJob(job.id, { status: 'completed', finishedAt: now(), statusNote: `第${approval.revision}版を承認済み` });
        this.ceoLog(job.id, `第${approval.revision}版を承認（ファイル${approval.deliverableIds.length}件）${comment ? `: ${comment}` : ''}`);
      } else {
        this.repo.decideApproval(id, 'rejected', comment);
        this.repo.addNote({ jobId: job.id, kind: 'rejection', revision: approval.revision, text: comment });
        this.repo.updateJob(job.id, {
          status: 'draft',
          feedback: appendFeedback(job.feedback, `【第${approval.revision}版への差し戻し】\n${comment}`),
          resumeStageKind: 'execute',
          statusNote:
            stagesOf(job, this.repo.listEmployees()).findIndex((st) => st.kind === 'execute') > 0
              ? `第${approval.revision}版を差し戻し済み。「続きから開始」で成果物作成から修正します（作業計画・調査結果は引き継ぎ）。`
              : `第${approval.revision}版を差し戻し済み。「開始」で成果物作成から修正します。`,
        });
        this.ceoLog(job.id, `第${approval.revision}版を差し戻し: ${comment}`);
      }
    });
    this.bus.changed(job.id);
    return this.repo.getApproval(id)!;
  }

  updateEmployee(id: string, body: Record<string, unknown>): Employee {
    if (!this.repo.getEmployee(id)) throw new UserError('社員が見つかりません', 404);
    const color = text(body.color, '色', 7, true);
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new UserError('色は #RRGGBB 形式で指定してください');
    const tools = Array.isArray(body.tools) ? body.tools.map(String) : [];
    const invalid = tools.filter((t) => !ALLOWED_TOOLS.includes(t));
    if (invalid.length) throw new UserError(`許可できないツールです: ${invalid.join(', ')}`);
    const current = this.repo.getEmployee(id)!;
    const refs = body.refs == null ? current.refs : Array.isArray(body.refs) ? body.refs.map(String) : [];
    const badRefs = refs.filter((r) => !REF_KEYS.includes(r as RefKey));
    if (badRefs.length) throw new UserError(`参照できる情報の指定が不正です: ${badRefs.join(', ')}`);
    this.repo.updateEmployee(id, {
      name: text(body.name, '名前', LIMITS.employeeName, true),
      roleTitle: text(body.roleTitle, '役割', LIMITS.roleTitle, true),
      description: text(body.description, '説明', LIMITS.description),
      instructions: text(body.instructions, '担当指示', LIMITS.instructions, true),
      outputFormat: body.outputFormat == null ? current.outputFormat : text(body.outputFormat, '提出形式', LIMITS.outputFormat),
      escalation: body.escalation == null ? current.escalation : text(body.escalation, '人間に戻す条件', LIMITS.escalation),
      refs: refs as RefKey[],
      color,
      tools,
    });
    this.bus.changed();
    return this.repo.getEmployee(id)!;
  }

  updateSettings(body: Record<string, unknown>): Settings {
    const current = this.repo.getSettings();
    const next: Settings = { ...current };
    if (body.defaultAdapter != null) {
      if (!(String(body.defaultAdapter) in this.adapters)) throw new UserError('実行方式が不正です');
      next.defaultAdapter = body.defaultAdapter as AdapterId;
    }
    if (body.claudeModel != null) {
      const m = text(body.claudeModel, 'モデル', 64);
      if (m && !/^[A-Za-z0-9._\-[\]]+$/.test(m)) throw new UserError('モデル名に使えない文字が含まれています');
      next.claudeModel = m;
    }
    for (const [key, [min, max]] of Object.entries(SETTINGS_LIMITS) as [keyof typeof SETTINGS_LIMITS, [number, number]][]) {
      if (body[key] == null) continue;
      const v = Number(body[key]);
      if (!Number.isFinite(v) || v < min || v > max) throw new UserError(`${key} は ${min}〜${max} の範囲で指定してください`);
      next[key] = key === 'maxBudgetUsd' || key === 'maxJobBudgetUsd' ? v : Math.round(v);
    }
    this.repo.saveSettings(next);
    this.bus.changed();
    return next;
  }

  /** 会社情報の更新。確定事項・仮説・未決定（未確認）を分けて保存する。 */
  updateCompany(body: Record<string, unknown>): CompanyProfile {
    const current = this.repo.getCompany();
    const next = {
      name: text(body.name, '会社名', 60, true),
      ceo: text(body.ceo, 'CEO', 60, true),
      status: text(body.status, '法人の状態', 200, true),
    };
    // 一覧で渡された場合は会社の記憶と同期する（増えた行は追加、消えた行はアーカイブ。版は記憶側で管理）
    const lists: [keyof Pick<CompanyProfile, 'facts' | 'hypotheses' | 'unknowns'>, 'policy' | 'hypothesis' | 'undecided', string][] = [
      ['facts', 'policy', '確定事項'],
      ['hypotheses', 'hypothesis', '仮説'],
      ['unknowns', 'undecided', '未決定・未確認'],
    ];
    const wanted = lists.map(([key, kind, label]) => [kind, body[key] == null ? null : lines(body[key], label)] as const);
    this.repo.transaction(() => {
      this.repo.saveCompany({ ...next, facts: current.facts, hypotheses: current.hypotheses, unknowns: current.unknowns });
      for (const [kind, texts] of wanted) {
        if (!texts) continue;
        const items = this.repo.listMemory().filter((m) => m.kind === kind);
        for (const m of items) if (!texts.includes(m.text)) this.repo.updateMemory(m.id, { archived: true });
        for (const t of texts) if (!items.some((m) => m.text === t)) this.repo.addMemory(kind, t);
      }
    });
    this.bus.changed();
    return this.repo.getCompany();
  }

  private nextQueueOrder(): number {
    const jobs = this.repo.listJobs();
    return jobs.reduce((m, j) => Math.max(m, j.queueOrder), 0) + 1;
  }

  private ceoLog(jobId: number, message: string) {
    this.repo.addActivity({ jobId, runId: null, employeeId: null, actor: 'ceo', kind: 'ceo', message, detail: '' });
  }
}

/** CEOのコメントは版ごとに積み重ねる（古いものから切り詰める）。 */
export function appendFeedback(current: string, add: string): string {
  const joined = current ? `${current}\n\n${add}` : add;
  return joined.length > LIMITS.feedback ? joined.slice(joined.length - LIMITS.feedback) : joined;
}

const truncateNote = (s: string) => (s.length > 60 ? `${s.slice(0, 60)}…` : s);

const STAGE_KEYS: StageKind[] = ['plan', 'research', 'execute', 'review'];

/** 工程ごとの案件固有の指示（テンプレート・作業計画の確認で編集）。 */
export function parseStageInstructions(v: unknown): Partial<Record<StageKind, string>> {
  if (v == null) return {};
  if (typeof v !== 'object' || Array.isArray(v)) throw new UserError('工程ごとの指示の形式が不正です');
  const out: Partial<Record<StageKind, string>> = {};
  for (const k of STAGE_KEYS) {
    const t = text((v as Record<string, unknown>)[k], `${k} の指示`, LIMITS.instructions);
    if (t) out[k] = t;
  }
  return out;
}
