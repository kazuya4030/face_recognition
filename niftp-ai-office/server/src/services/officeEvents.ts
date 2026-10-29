// オフィス画面の演出用イベント。実行履歴・成果物・承認の記録（構造化データ）から導出する。
// 新しい状態は持たず、発言や成果を作り出さない。画面は同じ情報を案件履歴でも確認できる。
import type { Approval, Deliverable, Job, Run, StageKind } from '../domain/types.ts';
import { stageLabel } from '../runner/workspace.ts';

export type OfficeEventType =
  | 'work_started'
  | 'handoff'
  | 'stage_done'
  | 'deliverable_saved'
  | 'approval_requested'
  | 'approved'
  | 'rejected'
  | 'error'
  | 'cancelled';

export interface OfficeEvent {
  /** 同じ出来事に常に同じ値を返す識別子（画面側で既読管理に使う）。 */
  key: string;
  at: string;
  type: OfficeEventType;
  jobId: number;
  jobTitle: string;
  /** 出来事の主体（引き継ぎ・提出では渡す側）。CEO の操作では null。 */
  employeeId: string | null;
  /** 引き継ぎ先。'ceo' は社長のデスク、'shelf' は資料棚。 */
  toEmployeeId: string | null;
  stageKind: StageKind | null;
  deliverableId: number | null;
  approvalId: number | null;
  label: string;
}

export function deriveOfficeEvents(
  jobs: Job[],
  runs: Run[],
  deliverables: Deliverable[],
  approvals: Approval[],
  limit = 40,
): OfficeEvent[] {
  const titleOf = new Map(jobs.map((j) => [j.id, j.title]));
  const events: OfficeEvent[] = [];
  const base = (jobId: number) => ({
    jobId,
    jobTitle: titleOf.get(jobId) ?? '',
    toEmployeeId: null,
    stageKind: null,
    deliverableId: null,
    approvalId: null,
  });

  const byAttempt = new Map<string, Run[]>();
  for (const r of runs) {
    const k = `${r.jobId}:${r.attempt}`;
    byAttempt.set(k, [...(byAttempt.get(k) ?? []), r]);
  }
  for (const group of byAttempt.values()) {
    group.sort((a, b) => a.id - b.id);
    group.forEach((r, i) => {
      const prev = group[i - 1];
      if (prev && prev.status === 'succeeded' && prev.stageIndex < r.stageIndex && prev.employeeId !== r.employeeId) {
        events.push({
          ...base(r.jobId),
          key: `run:${r.id}:handoff`,
          at: r.startedAt,
          type: 'handoff',
          employeeId: prev.employeeId,
          toEmployeeId: r.employeeId,
          stageKind: r.stageKind,
          label: r.stageKind === 'review' ? 'レビュー依頼' : '引き継ぎ',
        });
      }
      events.push({
        ...base(r.jobId),
        key: `run:${r.id}:start`,
        at: r.startedAt,
        type: 'work_started',
        employeeId: r.employeeId,
        stageKind: r.stageKind,
        label: `作業開始（${stageLabel(r.stageKind)}）`,
      });
      if (!r.finishedAt) return;
      const end: Pick<OfficeEvent, 'type' | 'label'> | null =
        r.status === 'succeeded'
          ? { type: 'stage_done', label: `${stageLabel(r.stageKind)}完了` }
          : r.status === 'cancelled'
            ? { type: 'cancelled', label: '中止' }
            : r.status === 'paused'
              ? null
              : { type: 'error', label: r.status === 'timeout' ? 'タイムアウト' : r.status === 'interrupted' ? '中断' : r.status === 'blocked' ? '保留' : 'エラー' };
      if (end) {
        events.push({ ...base(r.jobId), key: `run:${r.id}:end`, at: r.finishedAt, employeeId: r.employeeId, stageKind: r.stageKind, ...end });
      }
    });
  }

  for (const d of deliverables) {
    events.push({
      ...base(d.jobId),
      key: `deliverable:${d.id}`,
      at: d.createdAt,
      type: 'deliverable_saved',
      employeeId: d.employeeId,
      toEmployeeId: 'shelf',
      deliverableId: d.id,
      label: `成果物を保存: ${d.title}`,
    });
  }

  for (const a of approvals) {
    events.push({
      ...base(a.jobId),
      key: `approval:${a.id}:request`,
      at: a.createdAt,
      type: 'approval_requested',
      employeeId: a.requestedBy,
      toEmployeeId: 'ceo',
      approvalId: a.id,
      label: '承認待ち',
    });
    if (a.decidedAt && (a.status === 'approved' || a.status === 'rejected')) {
      events.push({
        ...base(a.jobId),
        key: `approval:${a.id}:decision`,
        at: a.decidedAt,
        type: a.status,
        employeeId: null,
        toEmployeeId: a.status === 'rejected' ? a.requestedBy : null,
        approvalId: a.id,
        label: a.status === 'approved' ? '承認' : '差し戻し',
      });
    }
  }

  // 同時刻の出来事は記録順（開始→引き継ぎ→完了の順序が崩れないよう key の種類で並べる）
  const order: Record<OfficeEventType, number> = {
    stage_done: 0,
    deliverable_saved: 1,
    handoff: 2,
    work_started: 3,
    approval_requested: 4,
    approved: 5,
    rejected: 5,
    error: 1,
    cancelled: 1,
  };
  events.sort((a, b) => (a.at === b.at ? order[a.type] - order[b.type] : a.at < b.at ? -1 : 1));
  return events.slice(-limit);
}
