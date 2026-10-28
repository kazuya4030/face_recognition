import { useEffect, useState, type ReactNode } from 'react';
import { api, type DeliverableContent, type JobSummary } from './api.ts';
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
  const run = async (action: string) => {
    if (action === 'cancel' && !window.confirm(`案件「${job.title}」をキャンセルしますか？${job.status === 'running' ? '\n実行中の処理を停止します。' : ''}`)) return;
    setBusy(action);
    setError('');
    try {
      await api.jobAction(job.id, action, action === 'start' && adapterChoice ? { adapter: adapterChoice } : {});
      onDone?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  return (
    <div className="job-actions">
      {job.actions.map((a) => (
        <button
          key={a.action}
          type="button"
          className={`btn ${a.action === 'start' || a.action === 'resume' ? 'primary' : ''} ${a.action === 'cancel' ? 'danger' : ''}`}
          disabled={!a.enabled || busy !== ''}
          title={a.reason}
          onClick={() => run(a.action)}
        >
          {busy === a.action ? '処理中…' : a.action === 'start' && job.status === 'error' ? 'やり直す' : ACTION_LABEL[a.action]}
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
          {formatBytes(d.size)}・{d.attempt}回目の実行・{formatTime(d.createdAt)}・SHA-256 {d.sha256.slice(0, 12)}…
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
