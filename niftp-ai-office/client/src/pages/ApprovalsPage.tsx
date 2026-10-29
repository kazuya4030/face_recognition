import { useEffect, useState } from 'react';
import { api, type ApprovalView, type DeliverableView, type Snapshot } from '../api.ts';
import { Badge, DemoBadge, Empty } from '../components.tsx';
import { useChangeSignal } from '../hooks.ts';
import { SEVERITY, VERDICT, formatTime } from '../labels.ts';

type Props = { snapshot: Snapshot; navigate: (p: string) => void };

const DECISION: Record<string, { label: string; tone: string }> = {
  pending: { label: '確認待ち', tone: 'review' },
  approved: { label: '承認', tone: 'done' },
  rejected: { label: '差し戻し', tone: 'error' },
  superseded: { label: '取り下げ', tone: 'cancelled' },
};

const STAGE_FILE_LABEL: Record<string, string> = { plan: '作業計画', research: '調査', execute: '成果物', review: 'レビュー' };

/** AI社員からの確認依頼。差し戻しにはコメントを必須にする。 */
export function ApprovalCard({
  approval,
  requesterName,
  deliverables,
  onDone,
  focused = false,
}: {
  approval: Omit<ApprovalView, 'jobTitle' | 'jobAdapter'> & { jobTitle?: string };
  requesterName: string;
  deliverables: DeliverableView[];
  onDone?: () => void;
  focused?: boolean;
}) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // 確認対象はこの版の保存版（サーバーが記録した ID の一覧）。保存版の有無は成果物一覧で確認する
  const exists = new Map(deliverables.map((d) => [d.id, d.exists]));
  const verdict = VERDICT[approval.reviewVerdict] ?? VERDICT.unknown;
  const decide = async (decision: 'approve' | 'reject') => {
    setBusy(true);
    setError('');
    try {
      await api.decide(approval.id, decision, comment);
      setComment('');
      onDone?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className={`approval-card ${focused ? 'is-focused' : ''}`} id={`approval-${approval.id}`} data-testid={`approval-${approval.id}`}>
      <header>
        <h3>{approval.title}</h3>
        <div className="muted small">
          依頼者: {requesterName}・{formatTime(approval.createdAt)}・<a href={`#/jobs/${approval.jobId}`}>案件 #{approval.jobId} を開く</a>
        </div>
        <div className="approval-meta">
          <Badge tone="idle">第{approval.revision}版</Badge>
          <Badge tone={verdict.tone}>レビュー: {verdict.label}</Badge>
          <span className="muted small">この判断は第{approval.revision}版にだけ有効です（修正版には引き継ぎません）</span>
        </div>
      </header>
      <h4>作業の報告</h4>
      <pre className="summary">{approval.summary || '（報告なし）'}</pre>
      <h4>確認事項（{approval.items.length}件）</h4>
      {approval.items.length === 0 ? (
        <p className="muted">AI社員からの確認事項はありません。</p>
      ) : (
        <ul className="items">
          {approval.items.map((it, i) => (
            <li key={i}>
              <Badge tone={SEVERITY[it.severity]?.tone ?? 'idle'}>{SEVERITY[it.severity]?.label ?? it.severity}</Badge> {it.text}
            </li>
          ))}
        </ul>
      )}
      <h4>確認対象のファイル（{approval.files.length}件）</h4>
      {approval.files.length === 0 ? (
        <p className="muted">確認対象として記録されたファイルはありません。</p>
      ) : (
        <ul className="plain">
          {approval.files.map((d) => (
            <li key={d.id}>
              {exists.get(d.id) !== false ? <a href={`#/library/${d.id}`}>{d.title}</a> : <span>{d.title}（ファイルなし）</span>}{' '}
              <span className="muted small">
                {STAGE_FILE_LABEL[d.stageKind] ?? ''}・保存版 #{d.id}・SHA-256 {d.sha256.slice(0, 10)}…
              </span>{' '}
              {d.isDemo && <DemoBadge />}
            </li>
          ))}
        </ul>
      )}
      <label className="comment">
        CEOコメント（差し戻しの場合は必須）
        <textarea rows={3} value={comment} maxLength={4000} onChange={(e) => setComment(e.target.value)} placeholder="承認理由、修正してほしい点など" />
      </label>
      {error && <p className="inline-error">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn primary" disabled={busy} onClick={() => decide('approve')}>
          承認する
        </button>
        <button type="button" className="btn danger" disabled={busy || !comment.trim()} title={comment.trim() ? '' : '差し戻しにはコメントが必要です'} onClick={() => decide('reject')}>
          差し戻す
        </button>
      </div>
    </article>
  );
}

export function useDeliverablesState() {
  const [state, setState] = useState<{ list: DeliverableView[]; loaded: boolean }>({ list: [], loaded: false });
  const reload = () => void api.deliverables().then((list) => setState({ list, loaded: true })).catch(() => {});
  useEffect(reload, []);
  useChangeSignal(reload);
  return state;
}

export function useDeliverables() {
  return useDeliverablesState().list;
}

export function ApprovalsPage({ snapshot, focusId }: Props & { focusId?: number }) {
  // オフィスの「確認に答える」から来たときは、該当の確認事項へ移動する
  useEffect(() => {
    if (focusId) document.getElementById(`approval-${focusId}`)?.scrollIntoView({ block: 'start' });
  }, [focusId]);
  const deliverables = useDeliverables();
  const nameOf = (id: string) => snapshot.employees.find((e) => e.id === id)?.name ?? id;
  const pending = snapshot.approvals.filter((a) => a.status === 'pending');
  const history = snapshot.approvals.filter((a) => a.status !== 'pending');
  return (
    <div className="page narrow">
      <h1>承認</h1>
      <p className="muted">AI社員から届いた確認依頼です。承認するとその版で案件は完了、差し戻すとコメント付きで未着手に戻ります（修正の開始はCEOが「続きから開始」で行います）。</p>
      {pending.length === 0 && <Empty>確認待ちはありません。</Empty>}
      {pending.map((a) => (
        <ApprovalCard key={a.id} approval={a} requesterName={nameOf(a.requestedBy)} deliverables={deliverables} focused={a.id === focusId} />
      ))}

      <h2>承認記録</h2>
      {history.length === 0 ? (
        <Empty>記録はまだありません。</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>判断日時</th>
              <th>案件</th>
              <th>版</th>
              <th>レビュー</th>
              <th>結果</th>
              <th>CEOコメント</th>
            </tr>
          </thead>
          <tbody>
            {history.map((a) => (
              <tr key={a.id}>
                <td>{formatTime(a.decidedAt)}</td>
                <td>
                  <a href={`#/jobs/${a.jobId}`}>
                    #{a.jobId} {a.jobTitle}
                  </a>
                </td>
                <td>第{a.revision}版（{a.files.length}件）</td>
                <td>{VERDICT[a.reviewVerdict] && <Badge tone={VERDICT[a.reviewVerdict].tone}>{VERDICT[a.reviewVerdict].label}</Badge>}</td>
                <td>
                  <Badge tone={DECISION[a.status].tone}>{DECISION[a.status].label}</Badge>
                </td>
                <td className="pre-wrap">{a.ceoComment || <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export { DECISION };
