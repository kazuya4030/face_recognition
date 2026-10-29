// 実行キュー。実行待ちの案件を取り出し、工程ごとにアダプターへ渡して結果を記録する。
// 同時実行数は config.maxConcurrentRuns（初期版は1）。並列化する場合もこのクラスの外側は変えずに済む。
import { stagesOf } from '../domain/jobState.ts';
import { NOT_CALLED_NOTE, type AdapterId, type Job, type ReviewItem, type ReviewVerdict, type RunStatus, type Settings, type Stage, type StageKind } from '../domain/types.ts';
import type { AppConfig } from '../config.ts';
import type { ChangeBus } from '../events.ts';
import { now, type Repo } from '../store/repo.ts';
import { emptyResult, type ExecutionAdapter, type StageContext, type StageResult } from './adapter.ts';
import { redact, truncate } from './redact.ts';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  changedOutputs,
  outputMtimes,
  prepareWorkspace,
  saveSnapshot,
  scanOutputs,
  stageIO,
  stageLabel,
  workspaceDirFor,
  writeReviewFeedback,
} from './workspace.ts';

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
      const lastRun = this.repo.listRuns(job.id).filter((r) => r.attempt === job.attempt).at(-1);
      this.repo.updateJob(job.id, {
        status: 'error',
        pauseRequested: false,
        resumeStageKind: lastRun?.stageKind ?? null,
        errorMessage: 'アプリの停止・再起動により中断されました。自動では再実行しません。内容を確認して「開始」でやり直してください（中断した工程から続けることもできます）。',
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
    const company = this.repo.getCompany();

    if (!adapter.availability().ok) {
      this.fail(job, `実行方式「${adapter.label}」が利用できません: ${adapter.availability().detail}`);
      return;
    }

    const workspaceDir = workspaceDirFor(this.config.dataDir, job.id);
    prepareWorkspace(workspaceDir, job, stages, employees, company);
    job = this.repo.updateJob(job.id, { status: 'running', statusNote: '', startedAt: job.startedAt ?? now() });
    this.log(job.id, null, null, 'system', 'status', `作業を開始（${adapter.label}、${job.attempt}回目）`);
    const executeIndex = stages.findIndex((s) => s.kind === 'execute');

    let i = job.currentStageIndex;
    while (i < stages.length) {
      const stage = stages[i];
      const employee = this.repo.getEmployee(stage.employeeId);
      if (!employee) {
        this.fail(job, `工程「${stageLabel(stage.kind)}」の担当社員（${stage.employeeId}）が見つかりません`, stage.kind);
        return;
      }
      // ---- 上限の確認（AIを呼ぶ前にプログラムで判定する） ----
      if (!adapter.isDemo && this.repo.countRunsStartedToday(adapter.id) >= settings.maxRunsPerDay) {
        this.fail(job, `本日の実接続の実行回数上限（${settings.maxRunsPerDay}工程）に達したため、「${stageLabel(stage.kind)}」を開始しませんでした`, stage.kind);
        return;
      }
      if (this.repo.countRunsInAttempt(job.id, job.attempt) >= settings.maxStageRunsPerAttempt) {
        this.fail(job, `1回の実行で起動できる工程数の上限（${settings.maxStageRunsPerAttempt}）に達したため、「${stageLabel(stage.kind)}」を開始しませんでした`, stage.kind);
        return;
      }
      let budgetUsd = settings.maxBudgetUsd;
      if (!adapter.isDemo) {
        const spent = this.repo.jobRealCost(job.id);
        const remaining = Math.floor((settings.maxJobBudgetUsd - spent.knownUsd) * 100) / 100;
        if (remaining < 0.05) {
          this.fail(job, `案件の費用上限（${settings.maxJobBudgetUsd} USD、報告済みの合計 ${spent.knownUsd.toFixed(4)} USD）に達したため、「${stageLabel(stage.kind)}」を開始しませんでした`, stage.kind);
          return;
        }
        budgetUsd = Math.min(budgetUsd, remaining);
      }

      const resumeStep = i === job.currentStageIndex ? job.currentStepIndex : 0;
      // 成果物作成を最初から始めるたびに新しい版にする（過去の版の承認は引き継がない）
      if (stage.kind === 'execute' && resumeStep === 0) {
        job = this.repo.updateJob(job.id, { revision: job.revision + 1 });
      }
      job = this.repo.updateJob(job.id, { currentStageIndex: i, currentStepIndex: resumeStep });
      const reviewFeedback =
        stage.kind === 'execute' && job.reviewRounds > 0 && fs.existsSync(path.join(workspaceDir, `inputs/review_feedback_r${job.revision - 1}.md`))
          ? `inputs/review_feedback_r${job.revision - 1}.md`
          : null;
      const io = stageIO(workspaceDir, stage.kind, employee.refs, { reviewFeedback });
      const run = this.repo.createRun({
        jobId: job.id,
        attempt: job.attempt,
        revision: job.revision,
        stageIndex: i,
        stageKind: stage.kind,
        employeeId: employee.id,
        adapter: adapter.id,
        inputs: io.inputs.map((f) => f.path),
      });
      const versionNote = stage.kind === 'execute' || stage.kind === 'review' ? `（第${job.revision}版）` : '';
      this.log(job.id, run.id, employee.id, 'system', 'status', `${employee.name}が「${stageLabel(stage.kind)}」${versionNote}を開始${resumeStep > 0 ? `（手順${resumeStep + 1}から再開）` : ''}`, `入力: ${io.inputs.map((f) => f.path).join(', ') || 'なし'}`);

      const before = outputMtimes(workspaceDir);
      let result: StageResult;
      const needsWeb = stage.kind === 'research' && !adapter.isDemo;
      if (needsWeb && !employee.tools.includes('WebSearch')) {
        // 接続がないことが分かっている場合はAIを呼ばずに保留する（調べたふりをさせない）
        result = emptyResult('blocked', {
          error: `${employee.name}に Web 検索（WebSearch）が許可されていないため、調査工程を保留しました。設定画面で WebSearch を許可してから「再開」してください。`,
          costNote: NOT_CALLED_NOTE,
        });
      } else {
        result = await this.runAdapterStage(adapter, controller, settings, {
          job, stage, stages, employee, attempt: job.attempt, revision: job.revision, io, today: now().slice(0, 10), company, budgetUsd,
          workspaceDir, resumeStep, settings,
          emit: (ev) => this.log(job!.id, run.id, employee.id, 'ai', ev.kind, ev.message, ev.detail ?? ''),
          pauseRequested: () => this.repo.getJob(jobId)?.pauseRequested ?? false,
          saveStep: (step) => this.repo.updateJob(jobId, { currentStepIndex: step }),
        });
      }

      // ---- 出力の確認（プログラムで判定し、AIの自己申告だけで成功扱いにしない） ----
      const changed = changedOutputs(before, outputMtimes(workspaceDir));
      if (result.status === 'succeeded') {
        const missing = io.required.filter((r) => !changed.some((c) => (r.dir ? c.startsWith(r.path) : c === r.path)));
        if (missing.length > 0) {
          result = { ...result, status: 'failed', error: `必須の出力が作成・更新されませんでした: ${missing.map((m) => m.path).join(', ')}` };
        }
        const outside = changed.filter((c) => !io.allowed.some((a) => (a.endsWith('/') ? c.startsWith(a) : c === a)));
        if (outside.length > 0) {
          result.items.push({ text: `「${stageLabel(stage.kind)}」の担当が、担当外のファイルを変更しました: ${outside.join(', ')}`, severity: 'warning' });
        }
      }
      if (result.status === 'succeeded' && needsWeb) result = this.checkWeb(result);

      const shutdown = controller.signal.reason === 'shutdown';
      const runStatus: RunStatus = result.status === 'cancelled' && shutdown ? 'interrupted' : result.status;
      const registered = this.registerDeliverables(job, run.id, employee.id, stage.kind, workspaceDir, adapter.isDemo);
      this.repo.finishRun(run.id, {
        status: runStatus,
        costUsd: result.costUsd,
        costNote: result.costNote,
        numTurns: result.numTurns,
        summary: redact(result.summary),
        error: redact(result.error),
        model: result.model,
        usage: result.usage,
        outputs: registered,
        verdict: stage.kind === 'review' ? result.verdict : 'none',
      });
      if (result.summary) this.log(job.id, run.id, employee.id, 'ai', 'result', result.summary);
      for (const ev of result.evidence) this.log(job.id, run.id, employee.id, 'ai', 'evidence', ev);
      for (const item of result.items) this.log(job.id, run.id, employee.id, 'ai', 'question', item.text, item.severity);

      job = this.repo.getJob(job.id)!;
      const hasNext = i < stages.length - 1;
      if (result.status === 'succeeded') {
        const verdictNote = stage.kind === 'review' ? `（判定: ${VERDICT_LABEL[result.verdict]}）` : '';
        this.log(job.id, run.id, employee.id, 'system', 'status', `${employee.name}が「${stageLabel(stage.kind)}」${versionNote}を完了${verdictNote}`);

        // レビュー不合格: 上限回数までは指摘ファイルを作って成果物作成からやり直す（AIは呼ばずにプログラムで受け渡す）
        if (stage.kind === 'review' && result.verdict === 'fail' && executeIndex >= 0 && job.reviewRounds < settings.maxAutoRework) {
          const rel = writeReviewFeedback(workspaceDir, job.revision, reviewFeedbackMarkdown(job.revision, result));
          job = this.repo.updateJob(job.id, { reviewRounds: job.reviewRounds + 1 });
          this.log(job.id, run.id, employee.id, 'system', 'status', `レビュー不合格のため、第${job.revision + 1}版として修正します（自動修正 ${job.reviewRounds}/${settings.maxAutoRework}回目）`, `指摘: ${rel}、レビュー結果: outputs/review.md（第${job.revision}版の保存版あり）`);
          if (job.pauseRequested) {
            this.pauseAt(job, executeIndex, stages, '一時停止しました（自動修正の前）');
            return;
          }
          i = executeIndex;
          continue;
        }
        // 人間に戻す条件（blocker）に該当: 次の工程へ進まずCEOの判断を待つ
        const blockers = result.items.filter((it) => it.severity === 'blocker');
        if (stage.kind !== 'review' && hasNext && blockers.length > 0) {
          this.repo.updateJob(job.id, {
            status: 'paused',
            pauseRequested: false,
            currentStageIndex: i + 1,
            currentStepIndex: 0,
            statusNote: `CEOの判断が必要なため「${stageLabel(stages[i + 1].kind)}」の前で停止中: ${truncate(blockers.map((b) => b.text).join(' / '), 300)}`,
          });
          this.log(job.id, run.id, employee.id, 'system', 'status', `人間に戻す条件に該当したため停止しました（${blockers.length}件）。回答を添えて「再開」できます。`);
          return;
        }
        if (hasNext && job.pauseRequested) {
          this.pauseAt(job, i + 1, stages, '一時停止しました（工程の区切り）');
          return;
        }
        i++;
        continue;
      }
      if (result.status === 'blocked') {
        this.repo.updateJob(job.id, {
          status: 'paused',
          pauseRequested: false,
          currentStageIndex: i,
          currentStepIndex: 0,
          statusNote: `「${stageLabel(stage.kind)}」を保留中: ${truncate(redact(result.error), 400)}`,
        });
        this.log(job.id, run.id, employee.id, 'system', 'error', `「${stageLabel(stage.kind)}」を保留しました（完了扱いにしていません）: ${result.error}`);
        return;
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
      this.repo.updateJob(job.id, { status: 'error', pauseRequested: false, errorMessage: `［${label}］${redact(message)}`, resumeStageKind: stage.kind });
      this.log(job.id, run.id, employee.id, 'system', 'error', `「${stageLabel(stage.kind)}」が${label}で終了: ${message}`);
      return;
    }

    this.requestApproval(job, stages, workspaceDir);
  }

  private async runAdapterStage(
    adapter: ExecutionAdapter,
    controller: AbortController,
    settings: Settings,
    ctx: Omit<StageContext, 'signal'>,
  ): Promise<StageResult> {
    const stageController = new AbortController();
    const forward = () => stageController.abort(controller.signal.reason);
    if (controller.signal.aborted) forward();
    else controller.signal.addEventListener('abort', forward, { once: true });
    const timeoutSec = adapter.isDemo ? settings.demoTimeoutSec : settings.timeoutSec;
    const timer = setTimeout(() => stageController.abort('timeout'), timeoutSec * 1000);
    try {
      return await adapter.runStage({ ...ctx, signal: stageController.signal });
    } catch (e) {
      return emptyResult('failed', { error: `実行部分で予期しないエラー: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', forward);
    }
  }

  /**
   * 調査工程の Web 利用の確認。検索が1件も成功していない、またはAIが利用不可と申告した場合は保留にする。
   * 検索はできたがページ本文を取得できていない場合は、出典が「検索結果のみ」であることを確認事項に残す。
   */
  private checkWeb(result: StageResult): StageResult {
    const w = result.web;
    if (!w) return result;
    const searchOk = w.searches - w.searchErrors;
    if (searchOk <= 0 || w.reported === 'unavailable') {
      return {
        ...result,
        status: 'blocked',
        error:
          `Web調査ができませんでした（検索 ${w.searches}回・うち失敗 ${w.searchErrors}回、AIの申告: ${w.reported || 'なし'}）。` +
          '調査済みとして扱わず保留しています。Web検索を利用できる接続にしてから「再開」してください。',
      };
    }
    if (w.fetches === 0 || w.fetchErrors >= w.fetches) {
      result.items.push({
        text: `参照ページの本文は取得できていません（ページ取得 ${w.fetches}回・うち失敗 ${w.fetchErrors}回）。出典は検索結果の題名・抜粋による確認です。重要な根拠は本文を確認してください。`,
        severity: 'warning',
      });
    }
    return result;
  }

  private pauseAt(job: Job, stageIndex: number, stages: Stage[], message: string) {
    this.repo.updateJob(job.id, {
      status: 'paused',
      pauseRequested: false,
      currentStageIndex: stageIndex,
      currentStepIndex: 0,
      statusNote: `「${stageLabel(stages[stageIndex].kind)}」の前で一時停止中`,
    });
    this.log(job.id, null, null, 'system', 'status', message);
  }

  private fail(job: Job, message: string, stageKind?: StageKind) {
    this.repo.updateJob(job.id, { status: 'error', errorMessage: message, pauseRequested: false, ...(stageKind ? { resumeStageKind: stageKind } : {}) });
    this.log(job.id, null, null, 'system', 'error', message);
  }

  /** outputs/ の新規・変更ファイルを成果物として記録し、保存版を作る。記録したファイルの一覧を返す。 */
  private registerDeliverables(job: Job, runId: number, employeeId: string, stageKind: StageKind, workspaceDir: string, isDemo: boolean): string[] {
    const existing = this.repo.listDeliverables(job.id);
    const { files, skipped } = scanOutputs(workspaceDir);
    const registered: string[] = [];
    for (const f of files) {
      // 走査後に読み直した内容でハッシュを取り直し、保存する内容と記録を一致させる。
      const content = fs.readFileSync(path.join(workspaceDir, f.relPath));
      const sha256 = crypto.createHash('sha256').update(content).digest('hex');
      const latest = existing.filter((d) => d.relPath === f.relPath).at(-1);
      if (latest && latest.sha256 === sha256) continue;
      this.repo.transaction(() => {
        const d = this.repo.addDeliverable({
          jobId: job.id,
          runId,
          employeeId,
          attempt: job.attempt,
          revision: job.revision,
          stageKind,
          title: f.relPath.replace(/^outputs\//, ''),
          relPath: f.relPath,
          mime: f.mime,
          size: content.length,
          sha256,
          isDemo,
        });
        saveSnapshot(this.config.dataDir, d, content);
        registered.push(d.relPath);
        this.log(job.id, runId, employeeId, 'system', 'result', `成果物を記録: ${d.title}（${d.size} bytes）`);
      });
    }
    for (const s of skipped) this.log(job.id, runId, employeeId, 'system', 'system', `成果物の記録対象外: ${s}`);
    return registered;
  }

  private supersedePendingApprovals(jobId: number) {
    for (const a of this.repo.listApprovals(jobId)) {
      if (a.status === 'pending') this.repo.decideApproval(a.id, 'superseded', '');
    }
  }

  /**
   * CEOの確認依頼を作る。確認対象は「この版の時点で outputs/ にあるファイル」の保存版で、ID を承認に記録する。
   * 承認はこの版にだけ有効で、新しい版が作られたら未処理の確認依頼は無効（superseded）になる。
   */
  private requestApproval(job: Job, stages: Stage[], workspaceDir: string) {
    const runs = this.repo.listRuns(job.id).filter((r) => r.attempt === job.attempt && r.status === 'succeeded');
    const current = runs.filter((r) => r.stageKind === 'plan' || r.stageKind === 'research' || r.revision === job.revision);
    const currentIds = new Set(current.map((r) => r.id));
    const items: ReviewItem[] = this.repo
      .listActivities(job.id)
      .filter((a) => a.kind === 'question' && a.runId != null && currentIds.has(a.runId))
      .map((a) => ({ text: a.message, severity: (['info', 'warning', 'blocker'].includes(a.detail) ? a.detail : 'info') as ReviewItem['severity'] }));

    // 確認対象の版: 現在のファイルと内容（sha256）が一致する保存版
    const all = this.repo.listDeliverables(job.id);
    const manifest: number[] = [];
    for (const f of scanOutputs(workspaceDir).files) {
      const d = all.filter((x) => x.relPath === f.relPath && x.sha256 === f.sha256).at(-1);
      if (d) manifest.push(d.id);
      else items.push({ text: `${f.relPath} は保存版がないため確認対象に含めていません`, severity: 'warning' });
    }
    if (!all.some((d) => manifest.includes(d.id) && d.stageKind === 'execute')) {
      items.push({ text: '提出物（outputs/deliverables/）がありません', severity: 'warning' });
    }

    const hasReviewStage = stages.some((s) => s.kind === 'review');
    const reviewRun = current.filter((r) => r.stageKind === 'review').at(-1);
    const executeRun = current.filter((r) => r.stageKind === 'execute').at(-1);
    const reviewVerdict: ReviewVerdict = !hasReviewStage ? 'none' : (reviewRun?.verdict ?? 'unknown');
    if (reviewVerdict === 'fail') {
      items.unshift({ text: `レビューの判定は「不合格」です（自動修正 ${job.reviewRounds}回の後）。問題点は review.md を確認してください。`, severity: 'warning' });
    } else if (reviewVerdict === 'unknown') {
      items.unshift({ text: 'レビューの判定（合格／不合格）を取得できませんでした。review.md を確認してください。', severity: 'warning' });
    }
    if (reviewRun && executeRun && reviewRun.adapter !== 'demo') {
      const same = reviewRun.model && reviewRun.model === executeRun.model;
      items.push({
        text: same
          ? `レビューは成果物作成と同じモデル（${reviewRun.model}）の別実行です。独立した検証とは限らないため、重要な根拠と計算はCEOも確認してください。`
          : `レビューは成果物作成とは別の実行です（モデル: 作成 ${executeRun.model || '不明'}／レビュー ${reviewRun.model || '不明'}）。人による確認の代わりにはなりません。`,
        severity: 'info',
      });
    }

    const summary = current.map((r) => `【${stageLabel(r.stageKind)}${r.stageKind === 'review' ? `・${VERDICT_LABEL[r.verdict]}` : ''}】${r.summary || '（要約なし）'}`).join('\n');
    this.supersedePendingApprovals(job.id);
    this.repo.createApproval({
      jobId: job.id,
      attempt: job.attempt,
      revision: job.revision,
      deliverableIds: manifest,
      reviewVerdict,
      requestedBy: job.assigneeId,
      title: `「${job.title}」第${job.revision}版の確認`,
      summary,
      items,
    });
    this.repo.updateJob(job.id, { status: 'awaiting_review', statusNote: '', pauseRequested: false });
    this.log(job.id, null, job.assigneeId, 'system', 'status', `全工程が完了し、CEOの確認待ちになりました（第${job.revision}版、ファイル${manifest.length}件、レビュー: ${VERDICT_LABEL[reviewVerdict]}、確認事項${items.length}件）`);
  }
}

export const VERDICT_LABEL: Record<ReviewVerdict, string> = { pass: '合格', fail: '不合格', unknown: '判定不明', none: 'レビューなし' };

/** 自動修正用の指摘ファイル。レビュー工程の報告（構造化データ）からプログラムが組み立てる。 */
function reviewFeedbackMarkdown(revision: number, r: StageResult): string {
  return [
    `# 第${revision}版へのレビュー指摘（不合格）`,
    '',
    'この指摘に対応した第' + (revision + 1) + '版を作成してください。詳細は outputs/review.md を参照。',
    '',
    '## レビューの要約',
    r.summary || '（要約なし）',
    '',
    '## 指摘事項',
    ...(r.items.length > 0 ? r.items.map((i) => `- [${i.severity}] ${i.text}`) : ['- （個別の指摘なし。review.md を参照）']),
    '',
  ].join('\n');
}
