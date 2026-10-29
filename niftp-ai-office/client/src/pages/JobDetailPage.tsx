import { useCallback, useEffect, useState } from 'react';
import { api, type JobDetail, type Snapshot } from '../api.ts';
import { Badge, DemoBadge, Empty, JobActions } from '../components.tsx';
import { useChangeSignal } from '../hooks.ts';
import { ACTIVITY_KIND, JOB_STATUS, RUN_STATUS, VERDICT, formatBytes, formatCost, formatDuration, formatJobCost, formatTime, formatTokens } from '../labels.ts';
import { ApprovalCard, DECISION, useDeliverables } from './ApprovalsPage.tsx';

type Props = { jobId: number; snapshot: Snapshot; navigate: (p: string) => void };

export function JobDetailPage({ jobId, snapshot, navigate }: Props) {
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [error, setError] = useState('');
  const [adapterChoice, setAdapterChoice] = useState<string>('');
  const deliverables = useDeliverables();
  const reload = useCallback(() => {
    api
      .job(jobId)
      .then((d) => {
        setDetail(d);
        setError('');
      })
      .catch((e: Error) => setError(e.message));
  }, [jobId]);
  useEffect(reload, [reload]);
  useChangeSignal(reload);

  if (error) return <p className="inline-error">{error}</p>;
  if (!detail) return <p className="muted">読み込み中…</p>;
  const { job, runs, activities, approvals } = detail;
  const nameOf = (id: string | null) => (id ? (snapshot.employees.find((e) => e.id === id)?.name ?? id) : '');
  const st = JOB_STATUS[job.status];
  const canChooseAdapter = job.status === 'draft' || job.status === 'error';
  const choice = adapterChoice || job.adapter;
  const pending = approvals.find((a) => a.status === 'pending');

  return (
    <div className="page job-detail">
      <button type="button" className="btn ghost small" onClick={() => navigate('board')}>
        ← 案件ボードへ
      </button>
      <div className="page-head">
        <h1>
          <span className="muted">#{job.id}</span> {job.title}
        </h1>
        <Badge tone={st.tone}>{st.label}</Badge>
        {job.adapter === 'demo' ? <DemoBadge /> : <Badge tone="real">Claude Code</Badge>}
      </div>

      <section className="panel">
        <div className="controls">
          {canChooseAdapter && (
            <label className="inline">
              実行方式
              <select value={choice} onChange={(e) => setAdapterChoice(e.target.value)}>
                {snapshot.adapters.map((a) => (
                  <option key={a.id} value={a.id} disabled={!a.ok}>
                    {a.label}
                    {a.ok ? '' : '（利用不可）'}
                  </option>
                ))}
              </select>
            </label>
          )}
          <JobActions
            job={{ ...job, actions: job.actions.map((a) => (a.action === 'start' ? (job.startOptions.find((o) => o.adapter === choice) ?? a) : a)) }}
            adapterChoice={choice} onDone={reload} />
        </div>
        {job.pauseRequested && <p className="note">一時停止を要求しています。現在の区切りが終わると停止します。</p>}
        {job.statusNote && <p className="note">{job.statusNote}</p>}
        {job.status === 'error' && <p className="error-text">{job.errorMessage}</p>}
        <div className="stage-progress large">
          {job.stages.map((s) => {
            const lastRun = [...runs].reverse().find((r) => r.attempt === job.attempt && r.stageIndex === s.index);
            return (
              <span key={s.index} className={lastRun ? `run-${lastRun.status}` : ''}>
                {s.index + 1}. {s.label}
                <small>{s.employeeName}</small>
                {lastRun && <small>{RUN_STATUS[lastRun.status].label}</small>}
              </span>
            );
          })}
          <span className={job.status === 'completed' ? 'run-succeeded' : job.status === 'awaiting_review' ? 'run-running' : ''}>
            {job.stages.length + 1}. CEO承認<small>植村和也</small>
          </span>
        </div>
      </section>

      <div className="detail-grid">
        <section className="panel">
          <h2>依頼内容</h2>
          <dl className="kv">
            <dt>目的</dt>
            <dd className="pre-wrap">{job.purpose}</dd>
            <dt>依頼内容</dt>
            <dd className="pre-wrap">{job.details}</dd>
            <dt>完了条件</dt>
            <dd className="pre-wrap">{job.acceptanceCriteria}</dd>
            <dt>担当</dt>
            <dd>{nameOf(job.assigneeId)}</dd>
            {job.feedback && (
              <>
                <dt>CEOからのコメント</dt>
                <dd className="pre-wrap">{job.feedback}</dd>
              </>
            )}
            <dt>実行回数</dt>
            <dd>{job.attempt}回</dd>
            <dt>成果物の版</dt>
            <dd>{job.revision > 0 ? `第${job.revision}版` : 'まだありません'}</dd>
            <dt>費用</dt>
            <dd>{formatJobCost(job.cost)}</dd>
            <dt>登録</dt>
            <dd>{formatTime(job.createdAt)}</dd>
          </dl>
        </section>

        <section className="panel">
          <h2>提出物</h2>
          {detail.deliverables.length === 0 ? (
            <Empty>まだ成果物はありません。</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>ファイル</th>
                  <th>作成</th>
                  <th>版</th>
                  <th>サイズ</th>
                </tr>
              </thead>
              <tbody>
                {detail.deliverables.map((d) => (
                  <tr key={d.id}>
                    <td>
                      {d.exists ? <a href={`#/library/${d.id}`}>{d.title}</a> : <span>{d.title}（ファイルなし）</span>} {d.isDemo && <DemoBadge />}
                    </td>
                    <td>{nameOf(d.employeeId)}</td>
                    <td>{d.stageKind === 'execute' || d.stageKind === 'review' ? `第${d.revision}版` : '資料'}</td>
                    <td>{formatBytes(d.size)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {pending && (
        <section className="panel">
          <h2>確認事項（CEOの判断待ち）</h2>
          <ApprovalCard approval={pending} requesterName={nameOf(pending.requestedBy)} deliverables={deliverables} onDone={reload} />
        </section>
      )}

      <section className="panel">
        <h2>実行履歴</h2>
        {runs.length === 0 ? (
          <Empty>まだ実行されていません。</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>回</th>
                <th>工程</th>
                <th>版</th>
                <th>担当</th>
                <th>方式</th>
                <th>結果</th>
                <th>開始</th>
                <th>所要</th>
                <th>ターン</th>
                <th>費用</th>
                <th>入力・出力</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} data-testid={`run-${r.id}`}>
                  <td>{r.attempt}</td>
                  <td>{job.stages.find((s) => s.kind === r.stageKind)?.label ?? r.stageKind}</td>
                  <td>{r.stageKind === 'execute' || r.stageKind === 'review' ? `第${r.revision}版` : '—'}</td>
                  <td>{nameOf(r.employeeId)}</td>
                  <td>{r.adapter === 'demo' ? <DemoBadge /> : 'Claude Code'}</td>
                  <td>
                    <Badge tone={RUN_STATUS[r.status].tone}>{RUN_STATUS[r.status].label}</Badge>
                    {r.stageKind === 'review' && r.status === 'succeeded' && <Badge tone={VERDICT[r.verdict].tone}>{VERDICT[r.verdict].label}</Badge>}
                    {r.error && <div className="small error-text">{r.error}</div>}
                  </td>
                  <td>{formatTime(r.startedAt)}</td>
                  <td>{formatDuration(r.startedAt, r.finishedAt)}</td>
                  <td>{r.numTurns ?? (r.adapter === 'demo' || r.costNote === 'AIを呼び出していません' ? '—' : '未取得')}</td>
                  <td title={r.costNote}>{r.costNote === 'AIを呼び出していません' ? 'なし（AI未実行）' : formatCost(r.costUsd, r.adapter)}</td>
                  <td>
                    <details className="run-io">
                      <summary>
                        入力{r.inputs.length}・出力{r.outputs.length}
                      </summary>
                      <dl className="kv small">
                        <dt>入力</dt>
                        <dd>{r.inputs.length ? r.inputs.join('\n') : 'なし'}</dd>
                        <dt>出力</dt>
                        <dd>{r.outputs.length ? r.outputs.join('\n') : 'なし'}</dd>
                        <dt>終了</dt>
                        <dd>{formatTime(r.finishedAt)}</dd>
                        {r.adapter !== 'demo' && (
                          <>
                            <dt>モデル</dt>
                            <dd>{r.model || '未取得'}</dd>
                            <dt>トークン</dt>
                            <dd>{formatTokens(r.usage)}</dd>
                          </>
                        )}
                      </dl>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>作業履歴</h2>
        <p className="muted small">AIの内部思考ではなく、実行した操作・結果・根拠・確認事項を記録しています。</p>
        {activities.length === 0 ? (
          <Empty>履歴はまだありません。</Empty>
        ) : (
          <ol className="timeline">
            {activities.map((a) => (
              <li key={a.id} className={`kind-${a.kind}`}>
                <time>{formatTime(a.createdAt)}</time>
                <span className="kind">{ACTIVITY_KIND[a.kind] ?? a.kind}</span>
                <span className="who">{a.actor === 'ceo' ? 'CEO' : a.employeeId ? nameOf(a.employeeId) : 'システム'}</span>
                <span className="msg">
                  {a.message}
                  {a.detail && a.kind !== 'question' && <small className="detail">{a.detail}</small>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {approvals.length > 0 && (
        <section className="panel">
          <h2>承認記録</h2>
          <table className="table">
            <thead>
              <tr>
                <th>版</th>
                <th>レビュー</th>
                <th>結果</th>
                <th>判断日時</th>
                <th>CEOコメント</th>
              </tr>
            </thead>
            <tbody>
              {approvals.map((a) => (
                <tr key={a.id}>
                  <td>
                    第{a.revision}版（{a.files.length}件）
                  </td>
                  <td>{VERDICT[a.reviewVerdict] && <Badge tone={VERDICT[a.reviewVerdict].tone}>{VERDICT[a.reviewVerdict].label}</Badge>}</td>
                  <td>
                    <Badge tone={DECISION[a.status].tone}>{DECISION[a.status].label}</Badge>
                  </td>
                  <td>{formatTime(a.decidedAt)}</td>
                  <td className="pre-wrap">{a.ceoComment || <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
