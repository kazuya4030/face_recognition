// 画面の表示文言。状態の意味はサーバー側の定義に合わせる。
import type { EmployeeStatus, JobStatus, RunStatus } from '../../server/src/domain/types.ts';
import type { JobSummary } from './api.ts';

export const EMPLOYEE_STATUS: Record<EmployeeStatus, { label: string; tone: string }> = {
  idle: { label: '待機中', tone: 'idle' },
  working: { label: '作業中', tone: 'working' },
  waiting_review: { label: '確認待ち', tone: 'review' },
  done: { label: '完了', tone: 'done' },
  error: { label: 'エラー', tone: 'error' },
};

export const JOB_STATUS: Record<JobStatus, { label: string; tone: string }> = {
  draft: { label: '未着手', tone: 'idle' },
  queued: { label: '実行待ち', tone: 'queued' },
  running: { label: '作業中', tone: 'working' },
  paused: { label: '一時停止中', tone: 'paused' },
  awaiting_review: { label: '確認待ち', tone: 'review' },
  completed: { label: '完了', tone: 'done' },
  error: { label: 'エラー', tone: 'error' },
  cancelled: { label: 'キャンセル', tone: 'cancelled' },
};

export const RUN_STATUS: Record<RunStatus, { label: string; tone: string }> = {
  running: { label: '実行中', tone: 'working' },
  succeeded: { label: '完了', tone: 'done' },
  failed: { label: '失敗', tone: 'error' },
  timeout: { label: 'タイムアウト', tone: 'error' },
  cancelled: { label: 'キャンセル', tone: 'cancelled' },
  paused: { label: '一時停止', tone: 'paused' },
  interrupted: { label: '中断', tone: 'error' },
  blocked: { label: '保留', tone: 'paused' },
};

export const VERDICT: Record<string, { label: string; tone: string }> = {
  // 記号（✓ × !）はバッジの色区分（tone）側で付く
  pass: { label: '合格', tone: 'done' },
  fail: { label: '不合格', tone: 'error' },
  unknown: { label: '判定不明', tone: 'review' },
  none: { label: 'レビューなし', tone: 'idle' },
};

/** トークン数。取得できなかった値は「未取得」。 */
export function formatTokens(u: { inputTokens: number | null; outputTokens: number | null; cacheReadTokens: number | null } | null): string {
  if (!u || (u.inputTokens == null && u.outputTokens == null)) return '未取得';
  const n = (v: number | null) => (v == null ? '未取得' : v.toLocaleString('ja-JP'));
  return `入力 ${n(u.inputTokens)}・出力 ${n(u.outputTokens)}${u.cacheReadTokens ? `・キャッシュ読込 ${n(u.cacheReadTokens)}` : ''}`;
}

export const BOARD_COLUMNS: { key: JobSummary['column']; label: string; hint: string }[] = [
  { key: 'todo', label: '未着手', hint: '登録済み・差し戻し' },
  { key: 'doing', label: '作業中', hint: '実行待ち・一時停止を含む' },
  { key: 'review', label: '確認待ち', hint: 'CEOの承認待ち' },
  { key: 'done', label: '完了', hint: '承認済み' },
  { key: 'error', label: 'エラー', hint: '失敗・タイムアウト・キャンセル' },
];

export const ACTION_LABEL: Record<string, string> = { start: '開始', pause: '一時停止', resume: '再開', halt: '工程を止める', cancel: 'キャンセル' };

export const SEVERITY: Record<string, { label: string; tone: string }> = {
  info: { label: '情報', tone: 'idle' },
  warning: { label: '要確認', tone: 'review' },
  blocker: { label: '重大', tone: 'error' },
};

export const ACTIVITY_KIND: Record<string, string> = {
  status: '進行',
  ceo: 'CEO',
  action: '操作',
  result: '結果',
  evidence: '根拠',
  question: '確認事項',
  denied: '権限拒否',
  error: 'エラー',
  system: 'システム',
};

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDuration(start: string, end: string | null): string {
  if (!end) return '—';
  const sec = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  return sec < 60 ? `${sec}秒` : `${Math.floor(sec / 60)}分${sec % 60}秒`;
}

/** 費用表示。取得できなかった値は推測せず「未取得」と表示する。 */
export function formatCost(usd: number | null, adapter: string): string {
  if (adapter === 'demo') return 'デモ（費用なし）';
  if (usd == null) return '未取得';
  return `$${usd.toFixed(4)}（推定）`;
}

export function formatJobCost(cost: JobSummary['cost']): string {
  if (cost.kind === 'none') return '実接続の実行なし';
  if (cost.kind === 'partial') return '未取得を含む';
  return `$${cost.usd.toFixed(4)}（Claude Code 報告の推定値）`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
