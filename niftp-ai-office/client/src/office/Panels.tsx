// オフィスで社員や家具を選んだときに開く詳細パネル。内容はすべて実際の記録から作る。
import type { ReactNode } from 'react';
import type { DeliverableView, EmployeeView, OfficeEvent, Snapshot } from '../api.ts';
import { Badge, CompanyInfo, DemoBadge } from '../components.tsx';
import { EMPLOYEE_STATUS, JOB_STATUS, formatTime } from '../labels.ts';
import { appearanceOf } from './appearance.ts';
import { Portrait } from './Character.tsx';

export type PanelKind = 'ceo' | 'shelf' | 'projects' | 'events' | 'entrance' | 'list' | { employee: string };

export function PanelShell({ title, onClose, children, testId }: { title: ReactNode; onClose: () => void; children: ReactNode; testId?: string }) {
  return (
    <aside className="hq-panel" aria-label={typeof title === 'string' ? title : '詳細'} data-testid={testId}>
      <div className="hq-panel-head">
        <h2>{title}</h2>
        <button type="button" className="btn ghost small" onClick={onClose} aria-label="閉じる">
          閉じる
        </button>
      </div>
      <div className="hq-panel-body">{children}</div>
    </aside>
  );
}

export function EmployeePanel({
  e,
  snapshot,
  navigate,
  onClose,
  onOpenDeliverable,
}: {
  e: EmployeeView;
  snapshot: Snapshot;
  navigate: (p: string) => void;
  onClose: () => void;
  onOpenDeliverable: (id: number) => void;
}) {
  const st = EMPLOYEE_STATUS[e.status];
  const job = e.currentJob ? snapshot.jobs.find((j) => j.id === e.currentJob!.id) : undefined;
  const running = job?.status === 'running';
  const progress = running && job ? `${job.currentStageIndex + 1}/${job.stages.length}` : '';
  const latest = e.recentDeliverables[0];
  const consult = e.pendingApprovals[0];
  // 社員の様子の説明は、実際の状態から作る短い説明だけにする（発言は作らない）
  const summary =
    e.status === 'working' && job
      ? `#${job.id}「${job.title}」の「${job.currentStageLabel}」工程を進めています（${progress}）。`
      : e.status === 'waiting_review'
        ? `#${e.currentJob?.id}「${e.currentJob?.title}」の成果物について、CEOの確認を待っています。`
        : e.status === 'error'
          ? `#${e.currentJob?.id}「${e.currentJob?.title}」がエラーで止まっています。`
          : e.status === 'done'
            ? `直近の案件はCEOが承認済みです。`
            : e.queuedJobs.length > 0
              ? `順番待ちの案件が${e.queuedJobs.length}件あります。`
              : '新しい依頼を待っています。';
  return (
    <PanelShell
      testId="employee-panel"
      onClose={onClose}
      title={
        <span className="emp-title">
          <Portrait look={appearanceOf(e.id)} size={64} />
          <span>
            <span className="emp-name">{e.name}</span>
            <span className="emp-role">{e.roleTitle}</span>
          </span>
        </span>
      }
    >
      <div className={`emp-state state-${e.status}`} data-testid="employee-state">
        <Badge tone={st.tone}>{st.label}</Badge>
        <span className="muted small">最終更新 {e.lastActivityAt ? formatTime(e.lastActivityAt) : '記録なし'}</span>
        <p>{summary}</p>
      </div>

      {e.status === 'error' && (
        <div className="emp-error" role="alert">
          <h3>エラーの理由</h3>
          <p>{e.statusDetail}</p>
          <h3>次の対応</h3>
          <p>案件を開いて作業履歴を確認し、「やり直す」で再実行するか、「キャンセル」で終了してください。</p>
        </div>
      )}

      <h3>得意な仕事</h3>
      <p className="small">{e.description || '（設定画面で登録できます）'}</p>

      <h3>取り組んでいる案件</h3>
      {e.currentJob ? (
        <div className="emp-job">
          <a href={`#/jobs/${e.currentJob.id}`}>
            #{e.currentJob.id} {e.currentJob.title}
          </a>{' '}
          {job && (job.adapter === 'demo' ? <DemoBadge /> : <Badge tone="real">Claude Code</Badge>)}
          {job && (
            <div className="stage-progress" aria-label="工程">
              {job.stages.map((s) => (
                <span key={s.index} className={running ? (s.index < job.currentStageIndex ? 'done' : s.index === job.currentStageIndex ? 'current' : '') : ''}>
                  {s.label}・{s.employeeName}
                </span>
              ))}
            </div>
          )}
          <div className="muted small">現在の工程: {e.currentJob.stage}</div>
        </div>
      ) : (
        <p className="muted">いまは担当している案件はありません。</p>
      )}
      {e.queuedJobs.length > 0 && (
        <p className="small">
          順番待ち:{' '}
          {e.queuedJobs.map((j) => (
            <a key={j.id} href={`#/jobs/${j.id}`} className="chip-link">
              #{j.id} {j.title}
            </a>
          ))}
        </p>
      )}

      <h3>直近の成果物</h3>
      {e.recentDeliverables.length === 0 ? (
        <p className="muted">まだ保存された成果物はありません。</p>
      ) : (
        <ul className="plain">
          {e.recentDeliverables.slice(0, 3).map((d) => (
            <li key={d.id}>
              <button type="button" className="link-button" onClick={() => onOpenDeliverable(d.id)}>
                {d.title}
              </button>{' '}
              {d.isDemo && <DemoBadge />} <span className="muted small">#{d.jobId}・{formatTime(d.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}

      <h3>CEOへの確認事項</h3>
      {e.pendingApprovals.length === 0 ? (
        <p className="muted">CEOへの確認事項はありません。</p>
      ) : (
        e.pendingApprovals.map((a) => (
          <div key={a.id} className="consult">
            <div className="strong small">{a.title}</div>
            {a.items.length === 0 ? (
              <p className="muted small">確認事項の記載はありません（成果物の承認を待っています）。</p>
            ) : (
              <ul className="items small">
                {a.items.slice(0, 4).map((it, i) => (
                  <li key={i}>
                    <Badge tone={it.severity === 'blocker' ? 'error' : it.severity === 'warning' ? 'review' : 'idle'}>{SEVERITY_LABEL[it.severity]}</Badge> {it.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))
      )}

      {/* 実際に動く操作だけを置く */}
      <div className="panel-actions">
        <button type="button" className="btn primary" onClick={() => navigate(`request?assignee=${e.id}`)}>
          仕事を依頼する
        </button>
        {e.currentJob && (
          <button type="button" className="btn" onClick={() => navigate(`jobs/${e.currentJob!.id}`)}>
            案件を見る
          </button>
        )}
        {latest && (
          <button type="button" className="btn" onClick={() => onOpenDeliverable(latest.id)}>
            成果を見る
          </button>
        )}
        {consult && (
          <button type="button" className="btn attention" onClick={() => navigate(`approvals/${consult.id}`)}>
            確認に答える
          </button>
        )}
      </div>
      <a className="small" href="#/settings">
        名前・作業指示を編集
      </a>
    </PanelShell>
  );
}

const SEVERITY_LABEL: Record<string, string> = { info: '情報', warning: '要確認', blocker: '重大' };

export function CeoPanel({ snapshot, onClose }: { snapshot: Snapshot; onClose: () => void }) {
  const pending = snapshot.approvals.filter((a) => a.status === 'pending');
  const nameOf = (id: string) => snapshot.employees.find((e) => e.id === id)?.name ?? id;
  return (
    <PanelShell title="CEO 植村和也" onClose={onClose} testId="ceo-panel">
      <p className="muted small">チームと同じ共同デスクで働いています。AI社員から届いた、CEOの判断が必要な事項です。</p>
      {pending.length === 0 ? (
        <p>判断待ちはありません。</p>
      ) : (
        <ul className="decision-list">
          {pending.map((a) => (
            <li key={a.id} className="attention">
              <div className="strong">{a.title}</div>
              <div className="muted small">
                依頼者 {nameOf(a.requestedBy)}・確認事項 {a.items.length}件・{formatTime(a.createdAt)}
              </div>
              <div className="row-actions">
                <a className="btn small primary" href={`#/approvals/${a.id}`}>
                  確認に答える
                </a>
                <a className="btn small" href={`#/jobs/${a.jobId}`}>
                  案件を開く
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PanelShell>
  );
}

export function ShelfPanel({
  deliverables,
  snapshot,
  lastSeen,
  onOpen,
  onClose,
}: {
  deliverables: DeliverableView[];
  snapshot: Snapshot;
  lastSeen: number;
  onOpen: (id: number) => void;
  onClose: () => void;
}) {
  const recent = deliverables.filter((d) => d.exists).slice(0, 12);
  const nameOf = (id: string) => snapshot.employees.find((e) => e.id === id)?.name ?? id;
  return (
    <PanelShell title="資料棚" onClose={onClose} testId="shelf-panel">
      <p className="muted small">AI社員が実際に保存した成果物です（新しい順）。</p>
      {recent.length === 0 ? (
        <p className="muted">まだ成果物はありません。</p>
      ) : (
        <ul className="shelf-list">
          {recent.map((d) => (
            <li key={d.id}>
              <button type="button" className="file-btn" onClick={() => onOpen(d.id)}>
                <span className="file-name">{d.title}</span>
                {d.id > lastSeen && <Badge tone="review">新着</Badge>}
                {d.isDemo && <DemoBadge />}
                <span className="muted small">
                  #{d.jobId}・{nameOf(d.employeeId)}・{formatTime(d.createdAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <a className="btn" href="#/library">
        資料・成果物の一覧へ
      </a>
    </PanelShell>
  );
}

/** プロジェクトボード：実際の案件と成果物の一覧。データがなければ最初の依頼への導線を出す。 */
export function ProjectBoardPanel({
  snapshot,
  deliverables,
  navigate,
  onOpenDeliverable,
  onClose,
}: {
  snapshot: Snapshot;
  deliverables: DeliverableView[];
  navigate: (p: string) => void;
  onOpenDeliverable: (id: number) => void;
  onClose: () => void;
}) {
  const active = snapshot.jobs.filter((j) => j.status !== 'completed' && j.status !== 'cancelled');
  const done = snapshot.jobs.filter((j) => j.status === 'completed').sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''));
  const latestOf = (jobId: number) => deliverables.find((d) => d.jobId === jobId && d.exists);
  const card = (j: (typeof snapshot.jobs)[number]) => {
    const st = JOB_STATUS[j.status];
    const d = latestOf(j.id);
    return (
      <li key={j.id} className={j.status === 'awaiting_review' ? 'attention' : j.status === 'error' ? 'is-error' : ''}>
        <div className="row-top">
          <Badge tone={st.tone}>{st.label}</Badge> {j.adapter === 'demo' && <DemoBadge />}
        </div>
        <a href={`#/jobs/${j.id}`} className="strong">
          #{j.id} {j.title}
        </a>
        <div className="muted small">
          {j.status === 'completed' ? `完了 ${formatTime(j.finishedAt)}` : `更新 ${formatTime(j.updatedAt)}`}・成果物 {j.deliverableCount}件
        </div>
        {d && (
          <div className="row-actions">
            <button type="button" className="btn small" onClick={() => onOpenDeliverable(d.id)}>
              成果を見る（{d.title}）
            </button>
          </div>
        )}
      </li>
    );
  };
  return (
    <PanelShell title="プロジェクトボード" onClose={onClose} testId="projects-panel">
      <dl className="ach-stats">
        <div>
          <dt>進行中</dt>
          <dd>{active.length}</dd>
        </div>
        <div>
          <dt>完了</dt>
          <dd>{done.length}</dd>
        </div>
        <div>
          <dt>成果物</dt>
          <dd>{deliverables.length}</dd>
        </div>
      </dl>
      {snapshot.jobs.length === 0 ? (
        <div className="empty-start">
          <p>まだプロジェクトはありません。</p>
          <button type="button" className="btn primary" onClick={() => navigate('request')}>
            最初のプロジェクトを始める
          </button>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <>
              <h3>進行中</h3>
              <ul className="decision-list">{active.map(card)}</ul>
            </>
          )}
          {done.length > 0 && (
            <>
              <h3>完了</h3>
              <ul className="decision-list">{done.slice(0, 8).map(card)}</ul>
            </>
          )}
          <a className="btn" href="#/board">
            案件ボードを開く
          </a>
        </>
      )}
    </PanelShell>
  );
}

export function EventsPanel({ events, snapshot, onClose }: { events: OfficeEvent[]; snapshot: Snapshot; onClose: () => void }) {
  const nameOf = (id: string | null) => (id == null ? 'CEO' : id === 'shelf' ? '資料棚' : id === 'ceo' ? 'CEO' : (snapshot.employees.find((e) => e.id === id)?.name ?? id));
  const list = [...events].reverse().slice(0, 30);
  return (
    <PanelShell title="最近の出来事" onClose={onClose} testId="events-panel">
      <p className="muted small">実行履歴・成果物・承認の記録から表示しています。詳しい内容は各案件の作業履歴で確認できます。</p>
      {list.length === 0 ? (
        <p className="muted">まだ出来事はありません。</p>
      ) : (
        <ol className="event-list">
          {list.map((e) => (
            <li key={e.key}>
              <time>{formatTime(e.at)}</time>
              <span>
                <strong>{nameOf(e.employeeId)}</strong>
                {e.toEmployeeId && e.type === 'handoff' ? ` → ${nameOf(e.toEmployeeId)}` : ''}：{e.label}
                <a href={`#/jobs/${e.jobId}`} className="muted small">
                  {' '}
                  #{e.jobId} {e.jobTitle}
                </a>
              </span>
            </li>
          ))}
        </ol>
      )}
    </PanelShell>
  );
}

export function EntrancePanel({ snapshot, onClose }: { snapshot: Snapshot; onClose: () => void }) {
  return (
    <PanelShell title="会社情報" onClose={onClose} testId="entrance-panel">
      <img className="panel-logo" src="/brand/niftp-logo.png" alt="NIFTP" width={1087} height={381} />
      <CompanyInfo snapshot={snapshot} />
      <p className="muted small">社員の名前・作業指示は設定画面で変更できます。</p>
      <a className="btn" href="#/settings">
        設定を開く
      </a>
    </PanelShell>
  );
}
