// 案件の状態遷移ルール。ボタンの有効/無効もここで決め、画面は結果を表示するだけにする。
import type { BoardColumn, Employee, Job, JobAction, JobStatus, Stage } from './types.ts';

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  draft: '未着手',
  queued: '実行待ち',
  running: '作業中',
  paused: '一時停止中',
  awaiting_review: '確認待ち',
  completed: '完了',
  error: 'エラー',
  cancelled: 'キャンセル済み',
};

export function boardColumnOf(status: JobStatus): BoardColumn {
  switch (status) {
    case 'draft':
      return 'todo';
    case 'queued':
    case 'running':
    case 'paused':
      return 'doing';
    case 'awaiting_review':
      return 'review';
    case 'completed':
      return 'done';
    case 'error':
    case 'cancelled':
      return 'error';
  }
}

/**
 * 案件の工程。業務責任者AIの作業分解・担当者の実行・品質確認AIの照合を順番に行う。
 * 役割に該当する社員がいない場合、その工程は省略する。
 */
export function stagesOf(job: Pick<Job, 'assigneeId' | 'usePlanner' | 'useReviewer'>, employees: Employee[]): Stage[] {
  const stages: Omit<Stage, 'index'>[] = [];
  const manager = employees.find((e) => e.roleKey === 'manager');
  const qa = employees.find((e) => e.roleKey === 'qa');
  if (job.usePlanner && manager && manager.id !== job.assigneeId) {
    stages.push({ kind: 'plan', employeeId: manager.id });
  }
  stages.push({ kind: 'execute', employeeId: job.assigneeId });
  if (job.useReviewer && qa && qa.id !== job.assigneeId) {
    stages.push({ kind: 'review', employeeId: qa.id });
  }
  return stages.map((s, index) => ({ ...s, index }));
}

export interface ActionContext {
  adapterAvailable: boolean;
  adapterUnavailableReason: string;
  adapterSupportsStepPause: boolean;
  stageCount: number;
  maxAttemptsPerJob: number;
}

export interface ActionState {
  action: JobAction;
  enabled: boolean;
  reason: string;
}

export function availableActions(job: Job, ctx: ActionContext): ActionState[] {
  const attemptsLeft = job.attempt < ctx.maxAttemptsPerJob;
  const s = job.status;

  const start: ActionState = (() => {
    if (s !== 'draft' && s !== 'error') {
      return { action: 'start', enabled: false, reason: `「${JOB_STATUS_LABEL[s]}」の案件は開始できません` };
    }
    if (!ctx.adapterAvailable) return { action: 'start', enabled: false, reason: ctx.adapterUnavailableReason };
    if (!attemptsLeft) {
      return { action: 'start', enabled: false, reason: `実行回数の上限（${ctx.maxAttemptsPerJob}回）に達しています` };
    }
    return { action: 'start', enabled: true, reason: s === 'error' ? '最初の工程からやり直します' : '' };
  })();

  const pause: ActionState = (() => {
    if (s === 'queued') return { action: 'pause', enabled: true, reason: '実行待ちから外して保留します' };
    if (s !== 'running') return { action: 'pause', enabled: false, reason: '実行待ち・作業中の案件のみ一時停止できます' };
    if (job.pauseRequested) return { action: 'pause', enabled: false, reason: '一時停止を要求済みです（区切りで停止します）' };
    const hasNextStage = job.currentStageIndex < ctx.stageCount - 1;
    if (ctx.adapterSupportsStepPause || hasNextStage) {
      return { action: 'pause', enabled: true, reason: '現在の区切り（手順または工程）が終わった時点で停止します' };
    }
    return {
      action: 'pause',
      enabled: false,
      reason: 'Claude Code実行中の最終工程は途中で一時停止できません（キャンセルのみ可能）',
    };
  })();

  const resume: ActionState =
    s === 'paused'
      ? ctx.adapterAvailable
        ? { action: 'resume', enabled: true, reason: '' }
        : { action: 'resume', enabled: false, reason: ctx.adapterUnavailableReason }
      : { action: 'resume', enabled: false, reason: '一時停止中の案件のみ再開できます' };

  const cancellable: JobStatus[] = ['draft', 'queued', 'running', 'paused', 'error', 'awaiting_review'];
  const cancel: ActionState = cancellable.includes(s)
    ? { action: 'cancel', enabled: true, reason: s === 'running' ? '実行中の処理を停止して記録します' : '' }
    : { action: 'cancel', enabled: false, reason: `「${JOB_STATUS_LABEL[s]}」の案件はキャンセルできません` };

  return [start, pause, resume, cancel];
}
