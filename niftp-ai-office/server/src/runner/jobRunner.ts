// 実行キュー。実行待ちの案件を取り出し、工程ごとにアダプターへ渡して結果を記録する。
// 同時実行数は config.maxConcurrentRuns（初期版は1）。並列化する場合もこのクラスの外側は変えずに済む。
import { stagesOf } from '../domain/jobState.ts';
import type { AdapterId, Job, ReviewItem, RunStatus } from '../domain/types.ts';
import type { AppConfig } from '../config.ts';
import type { ChangeBus } from '../events.ts';
import { now, type Repo } from '../store/repo.ts';
import { emptyResult, type ExecutionAdapter, type StageResult } from './adapter.ts';
import { redact } from './redact.ts';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { prepareWorkspace, saveSnapshot, scanOutputs, stageLabel, workspaceDirFor } from './workspace.ts';

type ShutdownReason = 'shutdown';

export class JobRunner {
  private readonly active = new Map<number, AbortController>();
  private stopped = false;

  constructor(
    private readonly repo: Repo,
    private readonly adapters: Record<AdapterId, ExecutionAdapter>,
    private readonly config: Pick<AppConfig, 'dataDir' | 'maxConcurrentRuns'>,
    private readonly bus: ChangeBus,
  ) {}

  /**
   * 起動時の復旧。前回の停止で「実行中」のまま残った記録を中断扱いにし、自動では再実行しない。
   * 実行待ちだった案件も、意図しない実行を避けるため一時停止にしてCEOの再開を待つ。
   */
  recoverOnStartup(): void {
    for (const run of this.repo.listRunningRuns()) {
      this.repo.finishRun(run.id, {
        status: 'interrupted',
        costUsd: null,
        costNote: '',
        numTurns: null,
        summary: '',
        error: 'アプリの停止・再起動により中断されました',
      });
    }
    for (const job of this.repo.listJobsByStatus('running')) {
      this.repo.updateJob(job.id, {
        status: 'error',
        pauseRequested: false,
        errorMessage: 'アプリの停止・再起動により中断されました。自動では再実行しません。内容を確認して「開始」でやり直してください。',
      });
      this.repo.addActivity({ jobId: job.id, runId: null, employeeId: null, actor: 'system', kind: 'error', message: '再起動により中断（自動再実行はしません）', detail: '' });
    }
    for (const job of this.repo.listJobsByStatus('queued')) {
      this.repo.updateJob(job.id, { status: 'paused', statusNote: '再起動のため保留中。「再開」で実行待ちに戻ります。' });
      this.repo.addActivity({ jobId: job.id, runId: null, employeeId: null, actor: 'system', kind: 'status', message: '再起動のため実行待ちを保留に変更', detail: '' });
    }
  }

  isActive(jobId: number): boolean {
    return this.active.has(jobId);
  }

  activeCount(): number {
    return this.active.size;
  }

  /** 実行中の案件を中止する。結果の記録は process() 側で行う。 */
  cancel(jobId: number): boolean {
    const c = this.active.get(jobId);
    if (!c) return false;
    c.abort('cancel');
    return true;
  }

  kick(): void {
    if (this.stopped) return;
    while (this.active.size < this.config.maxConcurrentRuns) {
      const next = this.repo.listJobsByStatus('queued').find((j) => !this.active.has(j.id));
      if (!next) return;
      const controller = new AbortController();
      this.active.set(next.id, controller);
      void this.process(next.id, controller)
        .catch((e: unknown) => {
          this.repo.updateJob(next.id, { status: 'error', errorMessage: redact(`内部エラー: ${e instanceof Error ? e.message : String(e)}`) });
          this.log(next.id, null, null, 'system', 'error', '内部エラーにより停止');
        })
        .finally(() => {
          this.active.delete(next.id);
          this.bus.changed(next.id);
          setImmediate(() => this.kick());
        });
    }
  }

  /** テスト・終了処理用: 実行中と実行待ちがなくなるまで待つ。 */
  async waitForIdle(timeoutMs = 60000): Promise<void> {
    const until = Date.now() + timeoutMs;
    while (this.active.size > 0 || this.repo.listJobsByStatus('queued').length > 0) {
      if (Date.now() > until) throw new Error('waitForIdle timeout');
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  /** アプリ終了時: 新規の実行を止め、実行中の処理を中断として記録する。 */
  async shutdown(): Promise<void> {
    this.stopped = true;
    for (const c of this.active.values()) c.abort('shutdown' satisfies ShutdownReason);
    const until = Date.now() + 20000;
    while (this.active.size > 0 && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
  }

  private log(jobId: number, runId: number | null, employeeId: string | null, actor: 'ai' | 'system', kind: Parameters<Repo['addActivity']>[0]['kind'], message: string, detail = '') {
    this.repo.addActivity({ jobId, runId, employeeId, actor, kind, message: redact(message), detail: redact(detail) });
    this.bus.changed(jobId);
  }

  private async process(jobId: number, controller: AbortController): Promise<void> {
    let job = this.repo.getJob(jobId);
    if (!job || job.status !== 'queued') return;
    const employees = this.repo.listEmployees();
    const stages = stagesOf(job, employees);
    const adapter = this.adapters[job.adapter];
    const settings = this.repo.getSettings();

    if (!adapter.availability().ok) {
      this.fail(job, `実行方式「${adapter.label}」が利用できません: ${adapter.availability().detail}`);
      return;
    }

    const workspaceDir = workspaceDirFor(this.config.dataDir, job.id);
    prepareWorkspace(workspaceDir, job, stages, employees);
    job = this.repo.updateJob(job.id, { status: 'running', statusNote: '', startedAt: job.startedAt ?? now() });
    this.log(job.id, null, null, 'system', 'status', `作業を開始（${adapter.label}、${job.attempt}回目）`);

    for (let i = job.currentStageIndex; i < stages.length; i++) {
      const stage = stages[i];
      const employee = this.repo.getEmployee(stage.employeeId);
      if (!employee) {
        this.fail(job, `工程「${stageLabel(stage.kind)}」の担当社員（${stage.employeeId}）が見つかりません`);
        return;
      }
      if (!adapter.isDemo && this.repo.countRunsStartedToday(adapter.id) >= settings.maxRunsPerDay) {
        this.fail(job, `本日の実接続の実行回数上限（${settings.maxRunsPerDay}工程）に達したため、「${stageLabel(stage.kind)}」を開始しませんでした`);
        return;
      }
      const resumeStep = i === job.currentStageIndex ? job.currentStepIndex : 0;
      job = this.repo.updateJob(job.id, { currentStageIndex: i, currentStepIndex: resumeStep });
      const run = this.repo.createRun({ jobId: job.id, attempt: job.attempt, stageIndex: i, stageKind: stage.kind, employeeId: employee.id, adapter: adapter.id });
      this.log(job.id, run.id, employee.id, 'system', 'status', `${employee.name}が「${stageLabel(stage.kind)}」を開始${resumeStep > 0 ? `（手順${resumeStep + 1}から再開）` : ''}`);

      const stageController = new AbortController();
      const forward = () => stageController.abort(controller.signal.reason);
      if (controller.signal.aborted) forward();
      else controller.signal.addEventListener('abort', forward, { once: true });
      const timeoutSec = adapter.isDemo ? settings.demoTimeoutSec : settings.timeoutSec;
      const timer = setTimeout(() => stageController.abort('timeout'), timeoutSec * 1000);

      let result: StageResult;
      try {
        result = await adapter.runStage({
          job,
          stage,
          stages,
          employee,
          attempt: job.attempt,
          workspaceDir,
          resumeStep,
          settings,
          signal: stageController.signal,
          emit: (ev) => this.log(job!.id, run.id, employee.id, 'ai', ev.kind, ev.message, ev.detail ?? ''),
          pauseRequested: () => this.repo.getJob(jobId)?.pauseRequested ?? false,
          saveStep: (step) => this.repo.updateJob(jobId, { currentStepIndex: step }),
        });
      } catch (e) {
        result = emptyResult('failed', { error: `実行部分で予期しないエラー: ${e instanceof Error ? e.message : String(e)}` });
      } finally {
        clearTimeout(timer);
        controller.signal.removeEventListener('abort', forward);
      }

      const shutdown = controller.signal.reason === 'shutdown';
      const runStatus: RunStatus = result.status === 'cancelled' && shutdown ? 'interrupted' : result.status;
      this.registerDeliverables(job, run.id, employee.id, workspaceDir, adapter.isDemo);
      this.repo.finishRun(run.id, {
        status: runStatus,
        costUsd: result.costUsd,
        costNote: result.costNote,
        numTurns: result.numTurns,
        summary: redact(result.summary),
        error: redact(result.error),
      });
      if (result.summary) this.log(job.id, run.id, employee.id, 'ai', 'result', result.summary);
      for (const ev of result.evidence) this.log(job.id, run.id, employee.id, 'ai', 'evidence', ev);
      for (const item of result.items) this.log(job.id, run.id, employee.id, 'ai', 'question', item.text, item.severity);

      job = this.repo.getJob(job.id)!;
      if (result.status === 'succeeded') {
        this.log(job.id, run.id, employee.id, 'system', 'status', `${employee.name}が「${stageLabel(stage.kind)}」を完了`);
        const hasNext = i < stages.length - 1;
        if (hasNext && job.pauseRequested) {
          this.repo.updateJob(job.id, { status: 'paused', pauseRequested: false, currentStageIndex: i + 1, currentStepIndex: 0, statusNote: `「${stageLabel(stages[i + 1].kind)}」の前で一時停止中` });
          this.log(job.id, null, null, 'system', 'status', '一時停止しました（工程の区切り）');
          return;
        }
        continue;
      }
      if (result.status === 'paused') {
        this.repo.updateJob(job.id, { status: 'paused', pauseRequested: false, statusNote: `「${stageLabel(stage.kind)}」の途中で一時停止中` });
        this.log(job.id, run.id, employee.id, 'system', 'status', '一時停止しました（手順の区切り）');
        return;
      }
      if (result.status === 'cancelled' && !shutdown) {
        this.repo.updateJob(job.id, { status: 'cancelled', pauseRequested: false, finishedAt: now(), statusNote: '' });
        this.supersedePendingApprovals(job.id);
        this.log(job.id, run.id, employee.id, 'system', 'status', '実行中の作業をキャンセルしました');
        return;
      }
      const label = result.status === 'timeout' ? 'タイムアウト' : shutdown ? '中断' : 'エラー';
      const message = shutdown ? 'アプリの停止により中断されました。自動では再実行しません。' : result.error || '原因不明のエラー';
      this.repo.updateJob(job.id, { status: 'error', pauseRequested: false, errorMessage: `［${label}］${redact(message)}` });
      this.log(job.id, run.id, employee.id, 'system', 'error', `「${stageLabel(stage.kind)}」が${label}で終了: ${message}`);
      return;
    }

    this.requestApproval(job, stages[stages.length - 1].employeeId);
  }

  private fail(job: Job, message: string) {
    this.repo.updateJob(job.id, { status: 'error', errorMessage: message, pauseRequested: false });
    this.log(job.id, null, null, 'system', 'error', message);
  }

  private registerDeliverables(job: Job, runId: number, employeeId: string, workspaceDir: string, isDemo: boolean) {
    const existing = this.repo.listDeliverables(job.id);
    const { files, skipped } = scanOutputs(workspaceDir);
    for (const f of files) {
      // 走査後に読み直した内容でハッシュを取り直し、保存する内容と記録を一致させる。
      const content = fs.readFileSync(path.join(workspaceDir, f.relPath));
      const sha256 = crypto.createHash('sha256').update(content).digest('hex');
      if (existing.some((d) => d.relPath === f.relPath && d.sha256 === sha256)) continue;
      this.repo.transaction(() => {
        const d = this.repo.addDeliverable({
          jobId: job.id,
          runId,
          employeeId,
          attempt: job.attempt,
          title: f.relPath.replace(/^outputs\//, ''),
          relPath: f.relPath,
          mime: f.mime,
          size: content.length,
          sha256,
          isDemo,
        });
        saveSnapshot(this.config.dataDir, d, content);
        this.log(job.id, runId, employeeId, 'system', 'result', `成果物を記録: ${d.title}（${d.size} bytes）`);
      });
    }
    for (const s of skipped) this.log(job.id, runId, employeeId, 'system', 'system', `成果物の記録対象外: ${s}`);
  }

  private supersedePendingApprovals(jobId: number) {
    for (const a of this.repo.listApprovals(jobId)) {
      if (a.status === 'pending') this.repo.decideApproval(a.id, 'superseded', '');
    }
  }

  private requestApproval(job: Job, lastEmployeeId: string) {
    const runs = this.repo.listRuns(job.id).filter((r) => r.attempt === job.attempt && r.status === 'succeeded');
    const runIds = new Set(runs.map((r) => r.id));
    const items: ReviewItem[] = this.repo
      .listActivities(job.id)
      .filter((a) => a.kind === 'question' && a.runId != null && runIds.has(a.runId))
      .map((a) => ({ text: a.message, severity: (['info', 'warning', 'blocker'].includes(a.detail) ? a.detail : 'info') as ReviewItem['severity'] }));
    const summary = runs.map((r) => `【${stageLabel(r.stageKind)}】${r.summary || '（要約なし）'}`).join('\n');
    const deliverableCount = this.repo.listDeliverables(job.id).filter((d) => d.attempt === job.attempt).length;
    if (deliverableCount === 0) {
      items.push({ text: '今回の実行では outputs/ に成果物ファイルが作成されませんでした', severity: 'warning' });
    }
    this.supersedePendingApprovals(job.id);
    this.repo.createApproval({
      jobId: job.id,
      attempt: job.attempt,
      requestedBy: job.assigneeId || lastEmployeeId,
      title: `「${job.title}」の成果物確認（${job.attempt}回目）`,
      summary,
      items,
    });
    this.repo.updateJob(job.id, { status: 'awaiting_review', statusNote: '', pauseRequested: false });
    this.log(job.id, null, job.assigneeId, 'system', 'status', `全工程が完了し、CEOの確認待ちになりました（成果物${deliverableCount}件、確認事項${items.length}件）`);
  }
}
