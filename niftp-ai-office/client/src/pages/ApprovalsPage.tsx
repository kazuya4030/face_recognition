import { useEffect, useState } from 'react';
import { api, type ApprovalView, type DeliverableView, type Snapshot } from '../api.ts';
import { Badge, DemoBadge, Empty } from '../components.tsx';
import { useChangeSignal } from '../hooks.ts';
import { SEVERITY, formatTime } from '../labels.ts';

type Props = { snapshot: Snapshot; navigate: (p: string) => void };

const DECISION: Record<string, { label: string; tone: string }> = {
  pending: { label: '確認待ち', tone: 'review' },
  approved: { label: '承認', tone: 'done' },
  rejected: { label: '差し戻し', tone: 'error' },
  superseded: { label: '取り下げ', tone: 'cancelled' },
};

/** AI社員からの確認依頼。差し戻しにはコメントを必須にする。 */
export function ApprovalCard({
  approval,
  requesterName,
  deliverables,
  onDone,
}: {
  approval: Omit<ApprovalView, 'jobTitle'> & { jobTitle?: string };
  requesterName: string;
  deliverables: DeliverableView[];
  onDone?: () => void;
}) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mine = deliverables.filter((d) => d.jobId === approval.jobId && d.attempt === approval.attempt);
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
    <article className="approval-card">
      <header>
        <h3>{approval.title}</h3>
        <div className="muted small">
          依頼者: {requesterName}・{formatTime(approval.createdAt)}・<a href={`#/jobs/${approval.jobId}`}>案件 #{approval.jobId} を開く</a>
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
      <h4>提出物（{mine.length}件）</h4>
      {mine.length === 0 ? (
        <p className="muted">今回の実行で記録された成果物はありません。</p>
      ) : (
        <ul className="plain">
          {mine.map((d) => (
            <li key={d.id}>
              {d.exists ? <a href={`#/library/${d.id}`}>{d.title}</a> : <span>{d.title}（ファイルなし）</span>} {d.isDemo && <DemoBadge />}
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

export function ApprovalsPage({ snapshot }: Props) {
  const deliverables = useDeliverables();
  const nameOf = (id: string) => snapshot.employees.find((e) => e.id === id)?.name ?? id;
  const pending = snapshot.approvals.filter((a) => a.status === 'pending');
  const history = snapshot.approvals.filter((a) => a.status !== 'pending');
  return (
    <div className="page narrow">
      <h1>承認</h1>
      <p className="muted">AI社員から届いた確認依頼です。承認すると案件は完了、差し戻すとコメント付きで未着手に戻ります（再開始はCEOが行います）。</p>
      {pending.length === 0 && <Empty>確認待ちはありません。</Empty>}
      {pending.map((a) => (
        <ApprovalCard key={a.id} approval={a} requesterName={nameOf(a.requestedBy)} deliverables={deliverables} />
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
              <th>回</th>
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
                <td>{a.attempt}</td>
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
