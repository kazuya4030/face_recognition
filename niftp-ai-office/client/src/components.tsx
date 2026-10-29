import { useEffect, useState, type ReactNode } from 'react';
import { api, type DeliverableContent, type JobSummary, type Snapshot } from './api.ts';
import { ACTION_LABEL, formatBytes, formatTime } from './labels.ts';

export function Badge({ tone, children, title }: { tone: string; children: ReactNode; title?: string }) {
  return (
    <span className={`badge tone-${tone}`} title={title}>
      {children}
    </span>
  );
}

export function DemoBadge() {
  return (
    <Badge tone="demo" title="デモ実行アダプターによる定型データです。実際のAIによる作業ではありません。">
      デモ
    </Badge>
  );
}

/** 案件の操作ボタン。サーバーが無効と判断した操作は押せないようにし、理由を表示する。 */
export function JobActions({
  job,
  onDone,
  adapterChoice,
}: {
  job: JobSummary;
  onDone?: () => void;
  adapterChoice?: string;
}) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [answer, setAnswer] = useState('');
  const run = async (action: string, from?: 'continue' | 'beginning') => {
    if (action === 'cancel' && !window.confirm(`案件「${job.title}」をキャンセルしますか？${job.status === 'running' ? '\n実行中の処理を停止します。' : ''}`)) return;
    setBusy(from ? `${action}:${from}` : action);
    setError('');
    try {
      const body: Record<string, unknown> = {};
      if (action === 'start' && adapterChoice) body.adapter = adapterChoice;
      if (action === 'start' && from) body.from = from;
      if (action === 'resume' && answer.trim()) body.comment = answer.trim();
      await api.jobAction(job.id, action, body);
      setAnswer('');
      onDone?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  const start = job.actions.find((a) => a.action === 'start');
  const resume = job.actions.find((a) => a.action === 'resume');
  return (
    <div className="job-actions">
      {start?.enabled && job.resumePoint && (
        <button type="button" className="btn primary" disabled={busy !== ''} title="前の工程の出力（作業計画・調査結果など）を引き継いで、この工程から始めます" onClick={() => run('start', 'continue')}>
          {busy === 'start:continue' ? '処理中…' : `続きから開始（${job.resumePoint.label}から）`}
        </button>
      )}
      {resume?.enabled && (
        <input className="resume-answer" value={answer} maxLength={4000} onChange={(e) => setAnswer(e.target.value)} placeholder="再開時の回答・指示（任意）" aria-label="再開時の回答・指示" />
      )}
      {job.actions.map((a) => (
        <button
          key={a.action}
          type="button"
          className={`btn ${(a.action === 'start' && !job.resumePoint) || a.action === 'resume' ? 'primary' : ''} ${a.action === 'cancel' ? 'danger' : ''}`}
          disabled={!a.enabled || busy !== ''}
          title={a.reason}
          onClick={() => run(a.action, a.action === 'start' ? 'beginning' : undefined)}
        >
          {busy === a.action || busy === `${a.action}:beginning`
            ? '処理中…'
            : a.action === 'start' && (job.resumePoint || job.status === 'error')
              ? '最初からやり直す'
              : ACTION_LABEL[a.action]}
        </button>
      ))}
      {error && <span className="inline-error">{error}</span>}
      {job.actions.some((a) => !a.enabled && a.reason) && (
        <details className="action-reasons">
          <summary>押せない操作の理由</summary>
          <ul>
            {job.actions
              .filter((a) => !a.enabled)
              .map((a) => (
                <li key={a.action}>
                  {ACTION_LABEL[a.action]}: {a.reason}
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** 成果物の内容表示。保存済みファイルがない場合はリンクを出さない。内容はテキストとして表示し、HTMLとして解釈しない。 */
export function DeliverableViewer({ id }: { id: number }) {
  const [data, setData] = useState<DeliverableContent | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setData(null);
    api.deliverableContent(id).then(setData).catch((e: Error) => setError(e.message));
  }, [id]);
  if (error) return <p className="inline-error">{error}</p>;
  if (!data) return <p className="muted">読み込み中…</p>;
  const d = data.deliverable;
  return (
    <div className="viewer">
      <div className="viewer-meta">
        <strong>{d.title}</strong>
        {d.isDemo && <DemoBadge />}
        <span className="muted">
          {formatBytes(d.size)}・{d.stageKind === 'execute' || d.stageKind === 'review' ? `第${d.revision}版・` : ''}{d.attempt}回目の実行・{formatTime(d.createdAt)}・SHA-256 {d.sha256.slice(0, 12)}…
        </span>
        {d.exists && (
          <a className="btn small" href={`/api/deliverables/${d.id}/download`}>
            ダウンロード
          </a>
        )}
      </div>
      {!d.exists && <p className="inline-error">保存済みのファイルが見つかりません（データディレクトリから削除された可能性があります）。</p>}
      {d.exists && !d.previewable && <p className="muted">この形式は画面上でプレビューできません。ダウンロードして確認してください。</p>}
      {data.content != null && (
        <>
          <pre className="file-content">{data.content}</pre>
          {data.truncated && <p className="muted">先頭300KBのみ表示しています。</p>}
        </>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/** 会社情報。社名は構想上の名称で、法人設立状況を設立済みと誤認させない表記を必ず併記する。 */
export function CompanyInfo({ snapshot }: { snapshot: Snapshot }) {
  const c = snapshot.company;
  return (
    <div className="company-info">
      <p className="company-name">{c.name}</p>
      <p className="concept-note">{c.status}</p>
      <dl>
        <dt>CEO</dt>
        <dd>{c.ceo}</dd>
        <dt>AI社員</dt>
        <dd>{snapshot.employees.length}名（名前は仮の名前です）</dd>
        <dt>未決定・未確認</dt>
        <dd>{c.unknowns.length > 0 ? c.unknowns.join('、') : 'なし'}</dd>
      </dl>
      <a className="small" href="#/settings">
        確定事項・仮説・未確認を見る／編集する
      </a>
    </div>
  );
}
