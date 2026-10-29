// 案件の待ち行列。同時実行は1件。待機中の順番変更、個別の保留・キャンセル、全体の開始・停止を行う。
// 「新しい案件・工程の開始を止める（全体停止）」と「実行中の工程を止める」は別の操作。
import { useCallback, useEffect, useState } from 'react';
import { api, type QueueView } from '../api.ts';
import { Badge, DemoBadge, Empty, JobActions } from '../components.tsx';
import { useChangeSignal } from '../hooks.ts';

export function QueuePage() {
  const [q, setQ] = useState<QueueView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => {
    api.queue().then(setQ).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(reload, [reload]);
  useChangeSignal(reload);
  const act = async (fn: () => Promise<QueueView>) => {
    setBusy(true);
    setError('');
    try {
      setQ(await fn());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!q) return <p className="muted">{error || '読み込み中…'}</p>;
  return (
    <div className="page narrow queue">
      <h1>待ち行列</h1>
      <section className="panel queue-state" data-testid="queue-state">
        <div className="queue-state-row">
          <Badge tone={q.running ? 'working' : 'paused'}>{q.running ? '稼働中' : '停止中'}</Badge>
          <span>
            {q.running
              ? '実行待ちの案件を上から順に1件ずつ実行します。'
              : '新しい案件・工程を始めません（実行中の工程は最後まで実行し、次の工程の前で待機します）。'}
          </span>
          {q.running ? (
            <button type="button" className="btn" disabled={busy} onClick={() => act(api.queueStop)}>
              待ち行列を停止
            </button>
          ) : (
            <button type="button" className="btn primary" disabled={busy} onClick={() => act(api.queueStart)}>
              待ち行列を開始
            </button>
          )}
        </div>
        <p className="muted small">
          実行中の工程そのものを止めるには、実行中の案件の「工程を止める」（案件は保留になり、再開するとその工程をやり直します）か「キャンセル」を使ってください。アプリを再起動したときは、待ち行列は停止状態で始まります。
        </p>
      </section>
      {error && <p className="inline-error">{error}</p>}

      <section className="panel">
        <h2>実行中（同時に1件）</h2>
        {q.active.length === 0 ? (
          <Empty>実行中の案件はありません。</Empty>
        ) : (
          q.active.map((j) => (
            <div key={j.id} className="queue-row">
              <a href={`#/jobs/${j.id}`} className="strong">
                #{j.id} {j.title}
              </a>
              {j.adapter === 'demo' ? <DemoBadge /> : <Badge tone="real">実案件</Badge>}
              <span className="muted small">工程: {j.currentStageLabel}</span>
              <JobActions job={j} onDone={reload} only={['pause', 'halt', 'cancel']} />
            </div>
          ))
        )}
      </section>

      <section className="panel">
        <h2>実行待ち（{q.waiting.length}件・上から順に実行）</h2>
        {q.waiting.length === 0 ? (
          <Empty>実行待ちの案件はありません。</Empty>
        ) : (
          <ol className="queue-list">
            {q.waiting.map((j, i) => (
              <li key={j.id} className="queue-row" data-testid={`queue-waiting-${j.id}`}>
                <span className="queue-pos">{i + 1}</span>
                <a href={`#/jobs/${j.id}`} className="strong">
                  #{j.id} {j.title}
                </a>
                {j.adapter === 'demo' ? <DemoBadge /> : <Badge tone="real">実案件</Badge>}
                {j.statusNote && <span className="muted small">{j.statusNote}</span>}
                <span className="row-actions">
                  <button type="button" className="btn small" disabled={busy || i === 0} onClick={() => act(() => api.queueMove(j.id, 'top'))}>
                    先頭へ
                  </button>
                  <button type="button" className="btn small" disabled={busy || i === 0} aria-label="ひとつ上へ" onClick={() => act(() => api.queueMove(j.id, 'up'))}>
                    ↑
                  </button>
                  <button type="button" className="btn small" disabled={busy || i === q.waiting.length - 1} aria-label="ひとつ下へ" onClick={() => act(() => api.queueMove(j.id, 'down'))}>
                    ↓
                  </button>
                </span>
                <JobActions job={j} onDone={reload} only={['pause', 'cancel']} />
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="panel">
        <h2>保留中（{q.held.length}件）</h2>
        {q.held.length === 0 ? (
          <Empty>保留中の案件はありません。</Empty>
        ) : (
          q.held.map((j) => (
            <div key={j.id} className="queue-row">
              <a href={`#/jobs/${j.id}`} className="strong">
                #{j.id} {j.title}
              </a>
              <Badge tone="paused">{j.holdLabel}</Badge>
              <span className="muted small">{j.statusNote}</span>
              {j.holdKind === 'question' || j.holdKind === 'plan_review' ? (
                <a className="btn small" href="#/inbox">
                  受信箱で対応
                </a>
              ) : (
                <JobActions job={j} onDone={reload} only={['resume', 'cancel']} />
              )}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
