// CEO の日常運用の画面向け: 受信箱・待ち行列・会社の記憶・業務状況・利用状況・バックアップ。
// 集計は記録（DB）からプログラムで行い、AI は使わない。社員の発言・売上・進捗率などは作らない。
import fs from 'node:fs';
import path from 'node:path';
import { STAGE_LABEL, stagesOf } from '../domain/jobState.ts';
import type { HoldKind, Job, MemoryKind, StageKind } from '../domain/types.ts';
import type { ChangeBus } from '../events.ts';
import { createBackup, listBackups } from '../ops/backup.ts';
import { periodRange, type JobRunner } from '../runner/jobRunner.ts';
import { snapshotPathFor } from '../runner/workspace.ts';
import { now, type Repo } from '../store/repo.ts';
import { UserError } from './errors.ts';
import type { MaterialsService } from './materials.ts';
import { appendFeedback, parseStageInstructions, text, type OfficeService } from './office.ts';

export const HOLD_LABEL: Record<HoldKind, string> = {
  plan_review: '作業計画の確認待ち',
  question: '社員からの質問',
  blocked: '保留（必要な接続・条件がない）',
  unknown_cost: '費用が未取得',
  limit: '上限に到達',
  manual: 'CEOが停止',
  interrupted: 'アプリの停止で中断',
  failed: '失敗・タイムアウト',
};

const MEMORY_KIND_LABEL: Record<MemoryKind, string> = { policy: '確定した会社方針', hypothesis: '検証中の仮説', undecided: '未決事項' };

export type InboxKind = 'plan_review' | 'question' | 'approval' | 'failure' | 'hold';

export class OperationsService {
  constructor(
    private readonly repo: Repo,
    private readonly runner: JobRunner,
    private readonly office: OfficeService,
    private readonly materials: MaterialsService,
    private readonly paths: { dataDir: string; backupDir: string },
    private readonly bus: ChangeBus,
    private readonly appVersion: string,
  ) {}

  private nameOf(id: string | null | undefined) {
    return id ? (this.repo.getEmployee(id)?.name ?? id) : '';
  }

  private jobMaterials(job: Job) {
    const atts = this.repo.listAttachments(job.id).filter((a) => !a.removedAt);
    return atts.map((a) => ({
      type: 'attachment' as const,
      id: a.id,
      title: a.kind === 'upload' ? a.name : `${a.name}（案件#${a.sourceJobId} 第${a.sourceRevision}版）`,
    }));
  }

  /** 計画工程の最新の保存版（作業計画の確認に表示する）。 */
  private latestPlan(job: Job): { deliverableId: number; content: string } | null {
    const d = this.repo.listDeliverables(job.id).filter((x) => x.relPath === 'outputs/plan.md' && x.attempt === job.attempt).at(-1);
    if (!d) return null;
    const p = snapshotPathFor(this.paths.dataDir, d);
    return fs.existsSync(p) ? { deliverableId: d.id, content: fs.readFileSync(p, 'utf8').slice(0, 60000) } : null;
  }

  // ---- 受信箱 ----

  /** CEO が対応すべき事項。案件・担当・確認理由・必要な判断・発生時刻・関連資料を付ける。 */
  inbox() {
    const employees = this.repo.listEmployees();
    const items: {
      key: string; kind: InboxKind; jobId: number; jobTitle: string; adapter: string; employeeId: string; employeeName: string;
      reason: string; decision: string; at: string; materials: { type: 'attachment' | 'deliverable'; id: number; title: string }[];
      questions?: ReturnType<Repo['listQuestions']>; plan?: { deliverableId: number; content: string } | null;
      stageInstructions?: Partial<Record<StageKind, string>>; approvalId?: number; job: ReturnType<OfficeService['jobSummary']>;
    }[] = [];
    for (const job of this.repo.listJobs()) {
      const summary = this.office.jobSummary(job, employees);
      const stages = stagesOf(job, employees);
      const stage = stages[job.currentStageIndex];
      const base = {
        jobId: job.id, jobTitle: job.title, adapter: job.adapter, materials: this.jobMaterials(job), job: summary,
        at: job.holdSince ?? job.updatedAt,
      };
      if (job.status === 'paused' && job.holdKind === 'question') {
        const qs = this.repo.listQuestions(job.id).filter((q) => q.answer == null);
        const by = qs[0]?.employeeId ?? stage?.employeeId ?? job.assigneeId;
        items.push({
          ...base, key: `question:${job.id}:${qs.map((q) => q.id).join(',')}`, kind: 'question', employeeId: by, employeeName: this.nameOf(by),
          reason: `「${STAGE_LABEL[qs[0]?.stageKind ?? stage?.kind ?? 'plan']}」で、人間に戻す条件に該当する確認事項が出ました`,
          decision: '質問に回答してください。回答は案件に記録され、その工程を回答つきでやり直します。', questions: qs,
        });
      } else if (job.status === 'paused' && job.holdKind === 'plan_review') {
        const planner = stages.find((s) => s.kind === 'plan')?.employeeId ?? job.assigneeId;
        items.push({
          ...base, key: `plan:${job.id}:${job.attempt}`, kind: 'plan_review', employeeId: planner, employeeName: this.nameOf(planner),
          reason: '作業計画ができました。次の工程に進む前に CEO の確認が必要です',
          decision: '計画と工程ごとの指示を確認・修正して承認するか、修正点を書いて作り直しを依頼してください。承認しても外部送信・公開・契約・支払いの権限は増えません。',
          plan: this.latestPlan(job), stageInstructions: job.stageInstructions,
        });
      } else if (job.status === 'paused' && job.holdKind && job.holdKind !== 'manual') {
        const by = stage?.employeeId ?? job.assigneeId;
        items.push({
          ...base, key: `hold:${job.id}:${job.holdKind}:${job.holdSince}`, kind: 'hold', employeeId: by, employeeName: this.nameOf(by),
          reason: `${HOLD_LABEL[job.holdKind]}: ${job.statusNote}`,
          decision: job.holdKind === 'blocked' ? '原因（接続・設定）を直してから再開するか、キャンセルしてください。' : '内容を確認し、再開するかキャンセルしてください。',
        });
      } else if (job.status === 'error') {
        const by = stage?.employeeId ?? job.assigneeId;
        items.push({
          ...base, key: `failure:${job.id}:${job.attempt}:${job.holdSince ?? job.updatedAt}`, kind: 'failure', employeeId: by, employeeName: this.nameOf(by),
          reason: `${job.holdKind ? HOLD_LABEL[job.holdKind] : '失敗'}: ${job.errorMessage}`,
          decision: summary.resumePoint
            ? `「${summary.resumePoint.label}」から続けるか、最初からやり直すか、キャンセルしてください。`
            : '最初からやり直すか、キャンセルしてください。',
        });
      }
    }
    for (const a of this.repo.listApprovals().filter((x) => x.status === 'pending')) {
      const job = this.repo.getJob(a.jobId)!;
      items.push({
        key: `approval:${a.id}`, kind: 'approval', jobId: job.id, jobTitle: job.title, adapter: job.adapter, employeeId: a.requestedBy,
        employeeName: this.nameOf(a.requestedBy), reason: `第${a.revision}版の成果物ができました（レビュー判定: ${a.reviewVerdict}）`,
        decision: '成果物と根拠・未確認事項を確認し、この版を承認するか、コメント付きで差し戻してください。', at: a.createdAt, approvalId: a.id,
        materials: [
          ...this.jobMaterials(job),
          ...a.deliverableIds.map((id) => ({ type: 'deliverable' as const, id, title: this.repo.getDeliverable(id)?.title ?? `成果物#${id}` })),
        ],
        job: this.office.jobSummary(job, employees),
      });
    }
    return items.sort((x, y) => (x.at < y.at ? -1 : 1));
  }

  /** 質問への回答。回答を案件に記録し、質問を出した工程を回答つきでやり直す。二重送信は 409。 */
  answerQuestions(jobId: number, body: Record<string, unknown>) {
    const job = this.repo.getJob(jobId);
    if (!job) throw new UserError('案件が見つかりません', 404);
    if (job.status !== 'paused' || job.holdKind !== 'question') throw new UserError('この案件は回答待ちではありません（既に回答済みの可能性があります）', 409);
    const open = this.repo.listQuestions(jobId).filter((q) => q.answer == null);
    const answers = (body.answers ?? {}) as Record<string, unknown>;
    const common = text(body.common, '回答', 4000);
    const resolved = open.map((q) => ({ q, a: text(answers[String(q.id)], `質問#${q.id}への回答`, 4000) || common }));
    const missing = resolved.filter((r) => !r.a);
    if (missing.length > 0) throw new UserError(`未回答の質問があります（${missing.map((m) => `#${m.q.id}`).join('、')}）`);
    this.repo.transaction(() => {
      let feedback = job.feedback;
      for (const { q, a } of resolved) {
        this.repo.answerQuestion(q.id, a);
        this.repo.addNote({ jobId, kind: 'answer', revision: job.revision, text: `質問「${q.text}」への回答: ${a}` });
        feedback = appendFeedback(feedback, `【質問への回答（${STAGE_LABEL[q.stageKind]}・質問#${q.id}）】\n質問: ${q.text}\n回答: ${a}`);
      }
      this.repo.updateJob(jobId, { status: 'queued', feedback, holdKind: null, holdSince: null, statusNote: '' });
      this.repo.addActivity({ jobId, runId: null, employeeId: null, actor: 'ceo', kind: 'ceo', message: `質問に回答（${resolved.length}件）。回答つきで工程をやり直します`, detail: '' });
    });
    this.bus.changed(jobId);
    this.runner.kick();
    return this.office.jobDetail(jobId);
  }

  /** 作業計画の承認。CEO が修正した工程ごとの指示を保存して次の工程へ進める。二重送信は 409。 */
  approvePlan(jobId: number, body: Record<string, unknown>) {
    const job = this.repo.getJob(jobId);
    if (!job) throw new UserError('案件が見つかりません', 404);
    if (job.status !== 'paused' || job.holdKind !== 'plan_review') throw new UserError('この案件は作業計画の確認待ちではありません（既に処理済みの可能性があります）', 409);
    const stageInstructions = body.stageInstructions == null ? job.stageInstructions : parseStageInstructions(body.stageInstructions);
    const note = text(body.comment, 'コメント', 4000);
    this.repo.transaction(() => {
      const changed = JSON.stringify(stageInstructions) !== JSON.stringify(job.stageInstructions);
      this.repo.addNote({ jobId, kind: 'plan', revision: job.revision, text: `作業計画を承認${changed ? '（工程ごとの指示を修正）' : ''}${note ? `: ${note}` : ''}` });
      this.repo.updateJob(jobId, {
        status: 'queued', stageInstructions, holdKind: null, holdSince: null, statusNote: '',
        feedback: note ? appendFeedback(job.feedback, `【作業計画の承認時のコメント】\n${note}`) : job.feedback,
      });
      this.repo.addActivity({ jobId, runId: null, employeeId: null, actor: 'ceo', kind: 'ceo', message: `作業計画を承認${changed ? '（工程ごとの指示を修正）' : ''}${note ? `: ${note}` : ''}`, detail: '' });
    });
    this.bus.changed(jobId);
    this.runner.kick();
    return this.office.jobDetail(jobId);
  }

  /** 作業計画の作り直し（コメント必須）。計画工程をコメントつきでやり直す。 */
  revisePlan(jobId: number, body: Record<string, unknown>) {
    const job = this.repo.getJob(jobId);
    if (!job) throw new UserError('案件が見つかりません', 404);
    if (job.status !== 'paused' || job.holdKind !== 'plan_review') throw new UserError('この案件は作業計画の確認待ちではありません（既に処理済みの可能性があります）', 409);
    const comment = text(body.comment, '修正点', 4000, true);
    const planIndex = stagesOf(job, this.repo.listEmployees()).findIndex((s) => s.kind === 'plan');
    this.repo.transaction(() => {
      this.repo.addNote({ jobId, kind: 'plan', revision: job.revision, text: `作業計画の作り直しを依頼: ${comment}` });
      this.repo.updateJob(jobId, {
        status: 'queued', currentStageIndex: Math.max(0, planIndex), currentStepIndex: 0, holdKind: null, holdSince: null, statusNote: '',
        feedback: appendFeedback(job.feedback, `【作業計画への修正依頼】\n${comment}`),
      });
      this.repo.addActivity({ jobId, runId: null, employeeId: null, actor: 'ceo', kind: 'ceo', message: `作業計画の作り直しを依頼: ${comment}`, detail: '' });
    });
    this.bus.changed(jobId);
    this.runner.kick();
    return this.office.jobDetail(jobId);
  }

  // ---- 待ち行列 ----

  queue() {
    const employees = this.repo.listEmployees();
    const active = this.runner.activeJobIds();
    const sum = (j: Job) => {
      const s = this.office.jobSummary(j, employees);
      return { id: j.id, title: j.title, adapter: j.adapter, status: j.status, statusNote: j.statusNote, currentStageLabel: s.currentStageLabel, stages: s.stages, holdKind: j.holdKind, actions: s.actions };
    };
    const jobs = this.repo.listJobs();
    return {
      running: this.repo.queueRunning(),
      maxConcurrent: 1,
      active: jobs.filter((j) => active.includes(j.id) || j.status === 'running').map(sum),
      waiting: this.repo.listJobsByStatus('queued').filter((j) => !active.includes(j.id)).map(sum),
      held: jobs.filter((j) => j.status === 'paused').map((j) => ({ ...sum(j), holdLabel: j.holdKind ? HOLD_LABEL[j.holdKind] : '一時停止' })),
    };
  }

  setQueueRunning(running: boolean) {
    this.repo.setQueueRunning(running);
    this.bus.changed();
    if (running) this.runner.kick();
    return this.queue();
  }

  /** 待機中の案件の順番を変える（up / down / top）。 */
  move(jobId: number, direction: string) {
    const waiting = this.repo.listJobsByStatus('queued').filter((j) => !this.runner.isActive(j.id));
    const i = waiting.findIndex((j) => j.id === jobId);
    if (i < 0) throw new UserError('待機中の案件ではありません', 409);
    const order = [...waiting];
    const [job] = order.splice(i, 1);
    const to = direction === 'top' ? 0 : direction === 'up' ? Math.max(0, i - 1) : direction === 'down' ? Math.min(order.length, i + 1) : -1;
    if (to < 0) throw new UserError('移動の指定が不正です');
    order.splice(to, 0, job);
    const base = Math.min(...waiting.map((j) => j.queueOrder));
    this.repo.transaction(() => order.forEach((j, k) => this.repo.updateJob(j.id, { queueOrder: base + k })));
    this.bus.changed();
    return this.queue();
  }

  // ---- 会社の記憶 ----

  memory() {
    const jobs = new Map(this.repo.listJobs().map((j) => [j.id, j]));
    const company = this.repo.getCompany();
    return {
      company: { name: company.name, ceo: company.ceo, status: company.status },
      kinds: MEMORY_KIND_LABEL,
      items: this.repo.listMemory(true),
      notes: this.repo.listNotes().map((n) => ({ ...n, jobTitle: jobs.get(n.jobId)?.title ?? '', jobAdapter: jobs.get(n.jobId)?.adapter ?? 'demo' })),
      approved: this.materials.approvedDeliverables(),
    };
  }

  addMemory(body: Record<string, unknown>) {
    const kind = parseKind(body.kind);
    const t = text(body.text, '内容', 1000, true);
    const item = this.repo.addMemory(kind, t);
    this.bus.changed();
    return item;
  }

  updateMemory(id: number, body: Record<string, unknown>) {
    const cur = this.repo.getMemory(id);
    if (!cur) throw new UserError('項目が見つかりません', 404);
    const item = this.repo.updateMemory(id, {
      kind: body.kind == null ? undefined : parseKind(body.kind),
      text: body.text == null ? undefined : text(body.text, '内容', 1000, true),
      archived: body.archived == null ? undefined : body.archived === true,
    });
    this.bus.changed();
    return item;
  }

  /** CEO の指摘を、明示操作で会社共通の方針（または仮説・未決事項）に登録する。自動では行わない。 */
  promoteNote(noteId: number, body: Record<string, unknown>) {
    const note = this.repo.listNotes().find((n) => n.id === noteId);
    if (!note) throw new UserError('指摘が見つかりません', 404);
    if (note.promotedItemId != null) throw new UserError('この指摘は既に会社の記憶に登録されています', 409);
    const kind = parseKind(body.kind ?? 'policy');
    const t = text(body.text ?? note.text, '内容', 1000, true);
    const item = this.repo.transaction(() => {
      const created = this.repo.addMemory(kind, t, note.id);
      this.repo.markNotePromoted(note.id, created.id);
      return created;
    });
    this.repo.addActivity({ jobId: note.jobId, runId: null, employeeId: null, actor: 'ceo', kind: 'ceo', message: `案件の指摘#${note.id}を会社の記憶（${MEMORY_KIND_LABEL[kind]}）に登録: 記憶#${item.id}`, detail: '' });
    this.bus.changed();
    return item;
  }

  // ---- 利用状況・業務状況 ----

  usage() {
    const s = this.repo.getSettings();
    const day = this.repo.realCostBetween(...periodRange('day'));
    const month = this.repo.realCostBetween(...periodRange('month'));
    const backups = listBackups(this.paths.backupDir);
    return {
      today: { ...day, limitUsd: s.maxDailyBudgetUsd, runsToday: this.repo.countRunsStartedToday('claude'), maxRunsPerDay: s.maxRunsPerDay },
      month: { ...month, limitUsd: s.maxMonthlyBudgetUsd },
      limits: s,
      costNote: '費用は Claude Code が報告する推定値の合計です。サブスクリプション（アカウントのログイン）で使う場合は実際の請求額とは一致しません。費用を取得できなかった実行は 0 円とみなさず「未取得」として数えます。',
      lastBackup: backups[0] ?? null,
    };
  }

  summary() {
    const employees = this.repo.listEmployees();
    const jobs = this.repo.listJobs();
    const inbox = this.inbox();
    const sum = (j: Job) => this.office.jobSummary(j, employees);
    const byKind = (k: InboxKind) => inbox.filter((x) => x.kind === k).length;
    return {
      generatedAt: now(),
      queueRunning: this.repo.queueRunning(),
      inProgress: jobs.filter((j) => j.status === 'running' || j.status === 'queued').map((j) => ({ ...pick(sum(j)), position: j.status === 'queued' ? this.repo.listJobsByStatus('queued').findIndex((x) => x.id === j.id) + 1 : 0 })),
      completed: jobs
        .filter((j) => j.status === 'completed')
        .slice(0, 20)
        .map((j) => ({ ...pick(sum(j)), approvedRevision: this.repo.listApprovals(j.id).find((a) => a.status === 'approved')?.revision ?? null })),
      stopped: jobs
        .filter((j) => j.status === 'paused' || j.status === 'error')
        .map((j) => ({ ...pick(sum(j)), reason: j.status === 'error' ? j.errorMessage : j.statusNote, holdLabel: j.holdKind ? HOLD_LABEL[j.holdKind] : j.status === 'error' ? '失敗' : '一時停止' })),
      decisions: { total: inbox.length, approval: byKind('approval'), question: byKind('question'), plan_review: byKind('plan_review'), failure: byKind('failure') + byKind('hold'), top: inbox.slice(0, 5).map((x) => ({ key: x.key, kind: x.kind, jobId: x.jobId, jobTitle: x.jobTitle, reason: x.reason, at: x.at })) },
      usage: this.usage(),
    };
  }

  // ---- バックアップ ----

  async createBackup() {
    const info = await createBackup(this.paths.dataDir, this.paths.backupDir, { db: this.repo.db, appVersion: this.appVersion });
    this.bus.changed();
    return info;
  }

  backups() {
    return { dir: this.paths.backupDir, list: listBackups(this.paths.backupDir).map(({ path: _p, ...rest }) => rest) };
  }

  backupFile(name: string): string {
    if (!/^niftp-backup-[0-9TZ]+\.tar\.gz$/.test(name)) throw new UserError('ファイル名が不正です');
    const p = path.join(this.paths.backupDir, name);
    if (!fs.existsSync(p)) throw new UserError('バックアップが見つかりません', 404);
    return p;
  }
}

function parseKind(v: unknown): MemoryKind {
  if (v === 'policy' || v === 'hypothesis' || v === 'undecided') return v;
  throw new UserError('種類は policy / hypothesis / undecided のいずれかです');
}

function pick(s: { id: number; title: string; status: string; adapter: string; currentStageLabel: string; statusNote: string; updatedAt: string; assigneeId: string; revision: number }) {
  return { id: s.id, title: s.title, status: s.status, adapter: s.adapter, currentStageLabel: s.currentStageLabel, statusNote: s.statusNote, updatedAt: s.updatedAt, assigneeId: s.assigneeId, revision: s.revision };
}
