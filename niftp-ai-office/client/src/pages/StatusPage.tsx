// 業務状況。実際の記録（件数・状態・日時）から集計して表示する。AI は使わず、進捗率・売上・社員のコメントは作らない。
import { useCallback, useEffect, useState } from 'react';
import { api, type BackupsView, type Snapshot, type SummaryView } from '../api.ts';
import { Badge, DemoBadge, Empty } from '../components.tsx';
import { useChangeSignal } from '../hooks.ts';
import { JOB_STATUS, formatBytes, formatTime } from '../labels.ts';

const usd = (n: number) => `$${n.toFixed(4)}`;

function Backups() {
  const [data, setData] = useState<BackupsView | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => {
    api.backups().then(setData).catch((e: Error) => setMsg(e.message));
  }, []);
  useEffect(reload, [reload]);
  const create = async () => {
    setBusy(true);
    setMsg('');
    try {
      const b = await api.createBackup();
      setMsg(`作成しました: ${b.name}（${formatBytes(b.size)}）。ダウンロードして、この PC 以外の場所にも保存してください。`);
      reload();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel" id="backups" data-testid="backups">
      <h2>バックアップ</h2>
      <p className="muted small">
        DB・案件の作業ファイル・成果物の保存版・資料をまとめて保存します（各ファイルの SHA-256 を記録）。保存先: <code>{data?.dir ?? '…'}</code>
      </p>
      <div className="form-actions">
        <button type="button" className="btn primary" disabled={busy} onClick={create}>
          {busy ? '作成中…' : '今すぐバックアップを作成'}
        </button>
        {msg && <span className="muted small">{msg}</span>}
      </div>
      {data && data.list.length === 0 && <Empty>バックアップはまだありません。</Empty>}
      {data && data.list.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>ファイル</th>
              <th>作成</th>
              <th>サイズ</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.list.slice(0, 10).map((b) => (
              <tr key={b.name}>
                <td>{b.name}</td>
                <td>{formatTime(b.createdAt)}</td>
                <td>{formatBytes(b.size)}</td>
                <td>
                  <a className="btn small" href={`/api/backups/${b.name}/download`}>
                    ダウンロード
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <details>
        <summary>復元の方法</summary>
        <ol className="small">
          <li>アプリを停止します（起動したターミナルで Ctrl+C）。</li>
          <li>
            中身を確認: <code>npm run backup:verify -- バックアップのファイル</code>
          </li>
          <li>
            別の場所に復元して確かめる: <code>npm run restore -- バックアップのファイル --data-dir ./data-restored</code>
          </li>
          <li>
            今のデータと入れ替える: <code>npm run restore -- バックアップのファイル --force</code>（今のデータは削除せず <code>data.before-restore-日時</code> に退避されます）
          </li>
          <li>
            <code>npm start</code> で起動します。復元直後は待ち行列が停止状態のことがあります。
          </li>
        </ol>
        <p className="muted small">画面からの復元はできません（実行中のデータを上書きしないため）。</p>
      </details>
    </section>
  );
}

export function StatusPage({ snapshot }: { snapshot: Snapshot }) {
  const [s, setS] = useState<SummaryView | null>(null);
  const [error, setError] = useState('');
  const reload = useCallback(() => {
    api.summary().then(setS).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(reload, [reload]);
  useChangeSignal(reload);
  if (!s) return <p className="muted">{error || '読み込み中…'}</p>;
  const nameOf = (id: string) => snapshot.employees.find((e) => e.id === id)?.name ?? id;
  const u = s.usage;
  const claude = snapshot.adapters.find((a) => a.id === 'claude');
  return (
    <div className="page narrow status">
      <h1>業務状況</h1>
      <p className="muted small">記録から集計しています（{formatTime(s.generatedAt)} 時点）。待ち行列: {s.queueRunning ? '稼働中' : '停止中'}</p>

      <section className="panel" data-testid="status-decisions">
        <h2>CEOが次に判断すること（{s.decisions.total}件）</h2>
        <p>
          承認 {s.decisions.approval}件・質問 {s.decisions.question}件・作業計画の確認 {s.decisions.plan_review}件・失敗/保留 {s.decisions.failure}件{' '}
          <a className="btn small primary" href="#/inbox">
            受信箱を開く
          </a>
        </p>
        {s.decisions.top.length > 0 && (
          <ul className="plain">
            {s.decisions.top.map((d) => (
              <li key={d.key}>
                <a href={`#/jobs/${d.jobId}`}>
                  #{d.jobId} {d.jobTitle}
                </a>
                <span className="muted small">
                  {' '}
                  {d.reason.slice(0, 80)}・{formatTime(d.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="detail-grid">
        <section className="panel">
          <h2>進行中の仕事（{s.inProgress.length}件）</h2>
          {s.inProgress.length === 0 ? (
            <Empty>なし</Empty>
          ) : (
            <ul className="plain">
              {s.inProgress.map((j) => (
                <li key={j.id}>
                  <a href={`#/jobs/${j.id}`}>
                    #{j.id} {j.title}
                  </a>{' '}
                  {j.adapter === 'demo' && <DemoBadge />}
                  <span className="muted small">
                    {' '}
                    {JOB_STATUS[j.status as keyof typeof JOB_STATUS].label}
                    {j.position > 0 ? `（待ち${j.position}番目）` : j.currentStageLabel ? `（${j.currentStageLabel}）` : ''}・担当 {nameOf(j.assigneeId)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel">
          <h2>止まっている仕事（{s.stopped.length}件）</h2>
          {s.stopped.length === 0 ? (
            <Empty>なし</Empty>
          ) : (
            <ul className="plain">
              {s.stopped.map((j) => (
                <li key={j.id}>
                  <a href={`#/jobs/${j.id}`}>
                    #{j.id} {j.title}
                  </a>{' '}
                  <Badge tone={j.status === 'error' ? 'error' : 'paused'}>{j.holdLabel}</Badge>
                  <div className="muted small">{j.reason}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="panel">
        <h2>完了した仕事（直近{s.completed.length}件）</h2>
        {s.completed.length === 0 ? (
          <Empty>なし</Empty>
        ) : (
          <ul className="plain">
            {s.completed.map((j) => (
              <li key={j.id}>
                <a href={`#/jobs/${j.id}`}>
                  #{j.id} {j.title}
                </a>{' '}
                {j.adapter === 'demo' && <DemoBadge />}
                <span className="muted small">
                  {' '}
                  第{j.approvedRevision ?? '?'}版を承認・{formatTime(j.updatedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel" id="usage" data-testid="usage">
        <h2>利用状況と上限</h2>
        <p className="muted small">{u.costNote}</p>
        <p className="small">
          Claude Code: {claude?.ok ? `利用可（${claude.version ?? ''}）` : '利用不可'}・{claude?.detail}
        </p>
        <table className="table">
          <thead>
            <tr>
              <th />
              <th>報告された費用（推定値）</th>
              <th>費用を取得できなかった実行</th>
              <th>上限</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>今日</td>
              <td>{usd(u.today.knownUsd)}</td>
              <td>{u.today.unknownRuns > 0 ? `${u.today.unknownRuns}件（未取得）` : 'なし'}</td>
              <td>
                {usd(u.today.limitUsd)}・工程 {u.today.runsToday}/{u.today.maxRunsPerDay}
              </td>
            </tr>
            <tr>
              <td>今月</td>
              <td>{usd(u.month.knownUsd)}</td>
              <td>{u.month.unknownRuns > 0 ? `${u.month.unknownRuns}件（未取得）` : 'なし'}</td>
              <td>{usd(u.month.limitUsd)}</td>
            </tr>
          </tbody>
        </table>
        <p className="small">
          1工程: {u.limits.maxTurns}ターン・{u.limits.maxBudgetUsd} USD・{u.limits.timeoutSec}秒／1案件: {u.limits.maxJobBudgetUsd} USD・実行{u.limits.maxAttemptsPerJob}回まで／1回の実行: {u.limits.maxStageRunsPerAttempt}工程・{u.limits.maxJobTimeSec}秒まで／自動修正 {u.limits.maxAutoRework}回／同時実行 1件{' '}
          <a href="#/settings">上限を変更</a>
        </p>
        <p className="muted small">
          推定値で判定するため、上限ちょうどで止まることは保証できません（工程の途中で上限を少し超えることがあります）。費用が取得できない工程の後は、次の工程の前で停止します。
        </p>
        <p className="small">最終バックアップ: {u.lastBackup ? `${u.lastBackup.name}（${formatTime(u.lastBackup.createdAt)}）` : 'まだありません'}</p>
      </section>

      <Backups />
    </div>
  );
}
