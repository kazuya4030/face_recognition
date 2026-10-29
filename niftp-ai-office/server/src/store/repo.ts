// 永続化層。SQL はこのファイルに閉じ込め、業務処理側はドメイン型だけを扱う。
import type { DatabaseSync } from 'node:sqlite';
import { EMPLOYEE_DEFAULTS_VERSION, LEGACY_DEFAULT_NAMES, SEED_COMPANY, SEED_EMPLOYEES } from '../domain/seed.ts';
import {
  DEFAULT_SETTINGS,
  NOT_CALLED_NOTE,
  type Activity,
  type AdapterId,
  type Approval,
  type CompanyProfile,
  type Deliverable,
  type Employee,
  type Job,
  type JobStatus,
  type RefKey,
  type ReviewItem,
  type ReviewVerdict,
  type Run,
  type RunStatus,
  type RunUsage,
  type Settings,
  type StageKind,
} from '../domain/types.ts';

type Row = Record<string, unknown>;

export const now = () => new Date().toISOString();

const str = (v: unknown) => (v == null ? '' : String(v));
const num = (v: unknown) => Number(v);
const nullableStr = (v: unknown) => (v == null ? null : String(v));
const json = <T>(v: unknown, fallback: T): T => {
  if (v == null || v === '') return fallback;
  try {
    return JSON.parse(String(v)) as T;
  } catch {
    return fallback;
  }
};

function toEmployee(r: Row): Employee {
  return {
    id: str(r.id),
    sortOrder: num(r.sort_order),
    name: str(r.name),
    roleKey: str(r.role_key) as Employee['roleKey'],
    roleTitle: str(r.role_title),
    description: str(r.description),
    instructions: str(r.instructions),
    color: str(r.color),
    tools: JSON.parse(str(r.tools)) as string[],
    outputFormat: str(r.output_format),
    escalation: str(r.escalation),
    refs: json<RefKey[]>(r.refs, []),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

function toJob(r: Row): Job {
  return {
    id: num(r.id),
    title: str(r.title),
    purpose: str(r.purpose),
    details: str(r.details),
    acceptanceCriteria: str(r.acceptance_criteria),
    assigneeId: str(r.assignee_id),
    usePlanner: Boolean(r.use_planner),
    useResearch: Boolean(r.use_research),
    useReviewer: Boolean(r.use_reviewer),
    adapter: str(r.adapter) as AdapterId,
    demoScenario: str(r.demo_scenario) as Job['demoScenario'],
    status: str(r.status) as JobStatus,
    statusNote: str(r.status_note),
    feedback: str(r.feedback),
    attempt: num(r.attempt),
    revision: num(r.revision ?? 0),
    reviewRounds: num(r.review_rounds ?? 0),
    resumeStageKind: (nullableStr(r.resume_stage_kind) as StageKind | null) || null,
    currentStageIndex: num(r.current_stage_index),
    currentStepIndex: num(r.current_step_index),
    pauseRequested: Boolean(r.pause_requested),
    errorMessage: str(r.error_message),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
    startedAt: nullableStr(r.started_at),
    finishedAt: nullableStr(r.finished_at),
  };
}

function toRun(r: Row): Run {
  return {
    id: num(r.id),
    jobId: num(r.job_id),
    attempt: num(r.attempt),
    revision: num(r.revision ?? 0),
    stageIndex: num(r.stage_index),
    stageKind: str(r.stage_kind) as StageKind,
    employeeId: str(r.employee_id),
    adapter: str(r.adapter) as AdapterId,
    status: str(r.status) as RunStatus,
    startedAt: str(r.started_at),
    finishedAt: nullableStr(r.finished_at),
    costUsd: r.cost_usd == null ? null : num(r.cost_usd),
    costNote: str(r.cost_note),
    numTurns: r.num_turns == null ? null : num(r.num_turns),
    model: str(r.model),
    usage: json<RunUsage | null>(r.usage, null),
    inputs: json<string[]>(r.inputs, []),
    outputs: json<string[]>(r.outputs, []),
    verdict: (str(r.verdict) || 'none') as ReviewVerdict,
    summary: str(r.summary),
    error: str(r.error),
  };
}

function toActivity(r: Row): Activity {
  return {
    id: num(r.id),
    jobId: num(r.job_id),
    runId: r.run_id == null ? null : num(r.run_id),
    employeeId: nullableStr(r.employee_id),
    actor: str(r.actor) as Activity['actor'],
    kind: str(r.kind) as Activity['kind'],
    message: str(r.message),
    detail: str(r.detail),
    createdAt: str(r.created_at),
  };
}

function toDeliverable(r: Row): Deliverable {
  return {
    id: num(r.id),
    jobId: num(r.job_id),
    runId: num(r.run_id),
    employeeId: str(r.employee_id),
    attempt: num(r.attempt),
    revision: num(r.revision ?? 0),
    stageKind: str(r.stage_kind) as StageKind,
    title: str(r.title),
    relPath: str(r.rel_path),
    mime: str(r.mime),
    size: num(r.size),
    sha256: str(r.sha256),
    isDemo: Boolean(r.is_demo),
    createdAt: str(r.created_at),
  };
}

function toApproval(r: Row): Approval {
  return {
    id: num(r.id),
    jobId: num(r.job_id),
    attempt: num(r.attempt),
    revision: num(r.revision ?? 0),
    deliverableIds: json<number[]>(r.deliverable_ids, []),
    reviewVerdict: (str(r.review_verdict) || 'none') as ReviewVerdict,
    requestedBy: str(r.requested_by),
    title: str(r.title),
    summary: str(r.summary),
    items: JSON.parse(str(r.items)) as ReviewItem[],
    status: str(r.status) as Approval['status'],
    ceoComment: str(r.ceo_comment),
    decidedAt: nullableStr(r.decided_at),
    createdAt: str(r.created_at),
  };
}

export type JobPatch = Partial<
  Pick<
    Job,
    | 'status'
    | 'statusNote'
    | 'feedback'
    | 'attempt'
    | 'revision'
    | 'reviewRounds'
    | 'resumeStageKind'
    | 'currentStageIndex'
    | 'currentStepIndex'
    | 'pauseRequested'
    | 'errorMessage'
    | 'startedAt'
    | 'finishedAt'
  >
>;

const JOB_COLUMNS: Record<keyof JobPatch, string> = {
  status: 'status',
  statusNote: 'status_note',
  feedback: 'feedback',
  attempt: 'attempt',
  revision: 'revision',
  reviewRounds: 'review_rounds',
  resumeStageKind: 'resume_stage_kind',
  currentStageIndex: 'current_stage_index',
  currentStepIndex: 'current_step_index',
  pauseRequested: 'pause_requested',
  errorMessage: 'error_message',
  startedAt: 'started_at',
  finishedAt: 'finished_at',
};

export class Repo {
  constructor(readonly db: DatabaseSync) {}

  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  seedIfEmpty(): void {
    if (!this.db.prepare('SELECT id FROM company_profile WHERE id = 1').get()) {
      this.db.prepare('INSERT INTO company_profile (id, data, updated_at) VALUES (1, ?, ?)').run(JSON.stringify(SEED_COMPANY), now());
    }
    const count = num((this.db.prepare('SELECT COUNT(*) AS c FROM employees').get() as Row).c);
    if (count > 0) {
      this.renameUntouchedDefaults();
      this.applyUntouchedDuties();
      return;
    }
    const t = now();
    const stmt = this.db.prepare(
      `INSERT INTO employees (id, sort_order, name, role_key, role_title, description, instructions, color, tools, output_format, escalation, refs, defaults_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const e of SEED_EMPLOYEES) {
      stmt.run(
        e.id, e.sortOrder, e.name, e.roleKey, e.roleTitle, e.description, e.instructions, e.color, JSON.stringify(e.tools),
        e.outputFormat, e.escalation, JSON.stringify(e.refs), EMPLOYEE_DEFAULTS_VERSION, t, t,
      );
    }
  }

  /**
   * 利用者が編集していない社員（created_at = updated_at）だけ、新しい版の担当指示・提出形式・
   * 人間に戻す条件・参照情報・ツールに更新する。名前と見た目は変えない。
   */
  private applyUntouchedDuties(): void {
    const stmt = this.db.prepare(
      `UPDATE employees SET description = ?, instructions = ?, tools = ?, output_format = ?, escalation = ?, refs = ?, defaults_version = ?
       WHERE id = ? AND created_at = updated_at AND defaults_version < ?`,
    );
    for (const e of SEED_EMPLOYEES) {
      stmt.run(e.description, e.instructions, JSON.stringify(e.tools), e.outputFormat, e.escalation, JSON.stringify(e.refs), EMPLOYEE_DEFAULTS_VERSION, e.id, EMPLOYEE_DEFAULTS_VERSION);
    }
  }

  /** 初期名のまま変更されていない社員だけを、現在の仮の名前・役割表記へ更新する。 */
  private renameUntouchedDefaults(): void {
    const stmt = this.db.prepare('UPDATE employees SET name = ?, role_title = ? WHERE id = ? AND name = ? AND created_at = updated_at');
    for (const e of SEED_EMPLOYEES) {
      const legacy = LEGACY_DEFAULT_NAMES[e.id];
      if (legacy) stmt.run(e.name, e.roleTitle, e.id, legacy);
    }
  }

  // ---- 社員 ----
  listEmployees(): Employee[] {
    return (this.db.prepare('SELECT * FROM employees ORDER BY sort_order, id').all() as Row[]).map(toEmployee);
  }

  getEmployee(id: string): Employee | undefined {
    const r = this.db.prepare('SELECT * FROM employees WHERE id = ?').get(id) as Row | undefined;
    return r ? toEmployee(r) : undefined;
  }

  updateEmployee(
    id: string,
    patch: Pick<Employee, 'name' | 'roleTitle' | 'description' | 'instructions' | 'color' | 'tools' | 'outputFormat' | 'escalation' | 'refs'>,
  ): void {
    this.db
      .prepare(
        `UPDATE employees SET name = ?, role_title = ?, description = ?, instructions = ?, color = ?, tools = ?, output_format = ?, escalation = ?, refs = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        patch.name, patch.roleTitle, patch.description, patch.instructions, patch.color, JSON.stringify(patch.tools),
        patch.outputFormat, patch.escalation, JSON.stringify(patch.refs), now(), id,
      );
  }

  // ---- 会社情報 ----
  getCompany(): CompanyProfile {
    const r = this.db.prepare('SELECT data, updated_at FROM company_profile WHERE id = 1').get() as Row | undefined;
    const data = r ? json<Partial<CompanyProfile>>(r.data, {}) : {};
    return { ...SEED_COMPANY, ...data, updatedAt: r ? str(r.updated_at) : '' };
  }

  saveCompany(c: Omit<CompanyProfile, 'updatedAt'>): void {
    this.db
      .prepare('INSERT INTO company_profile (id, data, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
      .run(JSON.stringify(c), now());
  }

  // ---- 案件 ----
  createJob(input: Pick<
    Job,
    'title' | 'purpose' | 'details' | 'acceptanceCriteria' | 'assigneeId' | 'usePlanner' | 'useResearch' | 'useReviewer' | 'adapter' | 'demoScenario'
  >): Job {
    const t = now();
    const info = this.db
      .prepare(
        `INSERT INTO jobs (title, purpose, details, acceptance_criteria, assignee_id, use_planner, use_research, use_reviewer, adapter, demo_scenario, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
      )
      .run(
        input.title,
        input.purpose,
        input.details,
        input.acceptanceCriteria,
        input.assigneeId,
        input.usePlanner ? 1 : 0,
        input.useResearch ? 1 : 0,
        input.useReviewer ? 1 : 0,
        input.adapter,
        input.demoScenario,
        t,
        t,
      );
    return this.getJob(Number(info.lastInsertRowid))!;
  }

  getJob(id: number): Job | undefined {
    const r = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as Row | undefined;
    return r ? toJob(r) : undefined;
  }

  listJobs(): Job[] {
    return (this.db.prepare('SELECT * FROM jobs ORDER BY id DESC').all() as Row[]).map(toJob);
  }

  listJobsByStatus(status: JobStatus): Job[] {
    return (this.db.prepare('SELECT * FROM jobs WHERE status = ? ORDER BY updated_at, id').all(status) as Row[]).map(toJob);
  }

  updateJob(id: number, patch: JobPatch): Job {
    const keys = Object.keys(patch) as (keyof JobPatch)[];
    if (keys.length > 0) {
      const sets = keys.map((k) => `${JOB_COLUMNS[k]} = ?`).join(', ');
      const values = keys.map((k) => {
        const v = patch[k];
        return typeof v === 'boolean' ? (v ? 1 : 0) : (v ?? null);
      });
      this.db.prepare(`UPDATE jobs SET ${sets}, updated_at = ? WHERE id = ?`).run(...values, now(), id);
    }
    return this.getJob(id)!;
  }

  setJobAdapter(id: number, adapter: AdapterId): void {
    this.db.prepare('UPDATE jobs SET adapter = ?, demo_scenario = CASE WHEN ? = \'demo\' THEN demo_scenario ELSE \'normal\' END, updated_at = ? WHERE id = ?').run(adapter, adapter, now(), id);
  }

  // ---- 実行履歴 ----
  createRun(input: {
    jobId: number;
    attempt: number;
    revision: number;
    stageIndex: number;
    stageKind: StageKind;
    employeeId: string;
    adapter: AdapterId;
    inputs: string[];
  }): Run {
    const info = this.db
      .prepare(
        `INSERT INTO runs (job_id, attempt, revision, stage_index, stage_kind, employee_id, adapter, status, inputs, started_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?, ?)`,
      )
      .run(input.jobId, input.attempt, input.revision, input.stageIndex, input.stageKind, input.employeeId, input.adapter, JSON.stringify(input.inputs), now());
    return this.getRun(Number(info.lastInsertRowid))!;
  }

  getRun(id: number): Run | undefined {
    const r = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as Row | undefined;
    return r ? toRun(r) : undefined;
  }

  listRuns(jobId?: number): Run[] {
    const rows = jobId == null
      ? this.db.prepare('SELECT * FROM runs ORDER BY id').all()
      : this.db.prepare('SELECT * FROM runs WHERE job_id = ? ORDER BY id').all(jobId);
    return (rows as Row[]).map(toRun);
  }

  listRunningRuns(): Run[] {
    return (this.db.prepare(`SELECT * FROM runs WHERE status = 'running'`).all() as Row[]).map(toRun);
  }

  finishRun(
    id: number,
    r: {
      status: RunStatus;
      costUsd: number | null;
      costNote: string;
      numTurns: number | null;
      summary: string;
      error: string;
      model?: string;
      usage?: RunUsage | null;
      outputs?: string[];
      verdict?: ReviewVerdict;
    },
  ): void {
    this.db
      .prepare(
        `UPDATE runs SET status = ?, finished_at = ?, cost_usd = ?, cost_note = ?, num_turns = ?, summary = ?, error = ?, model = ?, usage = ?, outputs = ?, verdict = ? WHERE id = ?`,
      )
      .run(
        r.status, now(), r.costUsd, r.costNote, r.numTurns, r.summary, r.error,
        r.model ?? '', r.usage ? JSON.stringify(r.usage) : null, JSON.stringify(r.outputs ?? []), r.verdict ?? 'none', id,
      );
  }

  /** この案件の実接続の実行で、報告された費用の合計と、費用を取得できなかった実行の数。 */
  jobRealCost(jobId: number): { knownUsd: number; unknownRuns: number } {
    const r = this.db
      .prepare(`SELECT COALESCE(SUM(cost_usd), 0) AS s, SUM(CASE WHEN cost_usd IS NULL AND cost_note != ? THEN 1 ELSE 0 END) AS u FROM runs WHERE job_id = ? AND adapter != 'demo'`)
      .get(NOT_CALLED_NOTE, jobId) as Row;
    return { knownUsd: num(r.s), unknownRuns: num(r.u ?? 0) };
  }

  countRunsInAttempt(jobId: number, attempt: number): number {
    return num((this.db.prepare(`SELECT COUNT(*) AS c FROM runs WHERE job_id = ? AND attempt = ?`).get(jobId, attempt) as Row).c);
  }

  /** 当日（ローカル日付ではなくUTC日付）に開始した実接続の実行数。上限判定に使う。 */
  countRunsStartedToday(adapter: AdapterId): number {
    const day = new Date().toISOString().slice(0, 10);
    const r = this.db.prepare(`SELECT COUNT(*) AS c FROM runs WHERE adapter = ? AND substr(started_at, 1, 10) = ?`).get(adapter, day) as Row;
    return num(r.c);
  }

  // ---- 作業履歴 ----
  addActivity(a: Omit<Activity, 'id' | 'createdAt'>): Activity {
    const info = this.db
      .prepare(`INSERT INTO activities (job_id, run_id, employee_id, actor, kind, message, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(a.jobId, a.runId, a.employeeId, a.actor, a.kind, a.message, a.detail, now());
    return toActivity(this.db.prepare('SELECT * FROM activities WHERE id = ?').get(Number(info.lastInsertRowid)) as Row);
  }

  listActivities(jobId: number): Activity[] {
    return (this.db.prepare('SELECT * FROM activities WHERE job_id = ? ORDER BY id').all(jobId) as Row[]).map(toActivity);
  }

  // ---- 成果物 ----
  addDeliverable(d: Omit<Deliverable, 'id' | 'createdAt'>): Deliverable {
    const info = this.db
      .prepare(
        `INSERT INTO deliverables (job_id, run_id, employee_id, attempt, revision, stage_kind, title, rel_path, mime, size, sha256, is_demo, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(d.jobId, d.runId, d.employeeId, d.attempt, d.revision, d.stageKind, d.title, d.relPath, d.mime, d.size, d.sha256, d.isDemo ? 1 : 0, now());
    return this.getDeliverable(Number(info.lastInsertRowid))!;
  }

  getDeliverable(id: number): Deliverable | undefined {
    const r = this.db.prepare('SELECT * FROM deliverables WHERE id = ?').get(id) as Row | undefined;
    return r ? toDeliverable(r) : undefined;
  }

  listDeliverables(jobId?: number): Deliverable[] {
    const rows = jobId == null
      ? this.db.prepare('SELECT * FROM deliverables ORDER BY id DESC').all()
      : this.db.prepare('SELECT * FROM deliverables WHERE job_id = ? ORDER BY id').all(jobId);
    return (rows as Row[]).map(toDeliverable);
  }

  // ---- 承認 ----
  createApproval(
    a: Pick<Approval, 'jobId' | 'attempt' | 'revision' | 'deliverableIds' | 'reviewVerdict' | 'requestedBy' | 'title' | 'summary' | 'items'>,
  ): Approval {
    const info = this.db
      .prepare(
        `INSERT INTO approvals (job_id, attempt, revision, deliverable_ids, review_verdict, requested_by, title, summary, items, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      )
      .run(a.jobId, a.attempt, a.revision, JSON.stringify(a.deliverableIds), a.reviewVerdict, a.requestedBy, a.title, a.summary, JSON.stringify(a.items), now());
    return this.getApproval(Number(info.lastInsertRowid))!;
  }

  getApproval(id: number): Approval | undefined {
    const r = this.db.prepare('SELECT * FROM approvals WHERE id = ?').get(id) as Row | undefined;
    return r ? toApproval(r) : undefined;
  }

  listApprovals(jobId?: number): Approval[] {
    const rows = jobId == null
      ? this.db.prepare('SELECT * FROM approvals ORDER BY id DESC').all()
      : this.db.prepare('SELECT * FROM approvals WHERE job_id = ? ORDER BY id').all(jobId);
    return (rows as Row[]).map(toApproval);
  }

  decideApproval(id: number, status: 'approved' | 'rejected' | 'superseded', comment: string): void {
    this.db.prepare(`UPDATE approvals SET status = ?, ceo_comment = ?, decided_at = ? WHERE id = ?`).run(status, comment, now(), id);
  }

  // ---- 設定 ----
  getSettings(): Settings {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as Row[];
    const stored = Object.fromEntries(rows.map((r) => [str(r.key), JSON.parse(str(r.value))]));
    return { ...DEFAULT_SETTINGS, ...stored } as Settings;
  }

  saveSettings(s: Settings): void {
    const stmt = this.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    this.transaction(() => {
      for (const [k, v] of Object.entries(s)) stmt.run(k, JSON.stringify(v));
    });
  }
}
