import { useState } from 'react';
import type { EmployeeView, Snapshot } from '../api.ts';
import { Badge, DemoBadge } from '../components.tsx';
import { BOARD_COLUMNS, EMPLOYEE_STATUS } from '../labels.ts';

type Props = { snapshot: Snapshot; navigate: (p: string) => void };

const STATUS_ICON: Record<EmployeeView['status'], string> = {
  idle: '',
  working: '',
  waiting_review: '!',
  done: '✓',
  error: '×',
};

function Avatar({ color, ceo = false }: { color: string; ceo?: boolean }) {
  return (
    <svg className="avatar" viewBox="0 0 40 48" aria-hidden>
      <ellipse cx="20" cy="45" rx="13" ry="3" fill="rgba(0,0,0,.15)" />
      <path d="M6 44 C6 30 34 30 34 44 Z" fill={color} />
      {ceo && <path d="M18 31 L20 40 L22 31 Z" fill="#7a2e2e" />}
      <circle cx="20" cy="18" r="10" fill="#f2d3b3" />
      <path d="M10 16 C10 6 30 6 30 16 C27 11 13 11 10 16 Z" fill={ceo ? '#2b2b2b' : '#4a3a2c'} />
    </svg>
  );
}

function Desk({ e, selected, onSelect }: { e: EmployeeView; selected: boolean; onSelect: () => void }) {
  const st = EMPLOYEE_STATUS[e.status];
  return (
    <button
      type="button"
      className={`desk status-${e.status} ${selected ? 'selected' : ''}`}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${e.name}（${st.label}）の詳細を見る`}
    >
      <div className="desk-person">
        {STATUS_ICON[e.status] && <span className={`bubble tone-${st.tone}`}>{STATUS_ICON[e.status]}</span>}
        <Avatar color={e.color} />
      </div>
      <div className="desk-table">
        <div className={`monitor ${e.status === 'working' ? 'on' : ''}`}>
          {e.status === 'working' && (
            <>
              <i />
              <i />
              <i />
            </>
          )}
        </div>
      </div>
      <div className="nameplate">
        <span className="name">{e.name}</span>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      {e.currentJob && <div className="desk-job">#{e.currentJob.id} {e.currentJob.title}</div>}
    </button>
  );
}

function EmployeePanel({ e, navigate, onClose }: { e: EmployeeView; navigate: Props['navigate']; onClose: () => void }) {
  const st = EMPLOYEE_STATUS[e.status];
  return (
    <aside className="panel employee-panel" aria-label={`${e.name}の詳細`}>
      <div className="panel-head">
        <span className="swatch" style={{ background: e.color }} />
        <div>
          <h2>{e.name}</h2>
          <div className="muted">{e.roleTitle}</div>
        </div>
        <button type="button" className="btn ghost small" onClick={onClose}>
          閉じる
        </button>
      </div>
      <dl className="kv">
        <dt>役割</dt>
        <dd>{e.description}</dd>
        <dt>状態</dt>
        <dd>
          <Badge tone={st.tone}>{st.label}</Badge> <span className="muted">{e.statusDetail}</span>
        </dd>
        <dt>現在の案件</dt>
        <dd>
          {e.currentJob ? (
            <a href={`#/jobs/${e.currentJob.id}`}>
              #{e.currentJob.id} {e.currentJob.title}（{e.currentJob.stage}）
            </a>
          ) : (
            <span className="muted">なし</span>
          )}
        </dd>
        <dt>順番待ち</dt>
        <dd>
          {e.queuedJobs.length === 0 ? (
            <span className="muted">なし</span>
          ) : (
            <ul className="plain">
              {e.queuedJobs.map((j) => (
                <li key={j.id}>
                  <a href={`#/jobs/${j.id}`}>
                    #{j.id} {j.title}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </dd>
        <dt>相談事項</dt>
        <dd>
          {e.pendingApprovals.length === 0 ? (
            <span className="muted">なし</span>
          ) : (
            <ul className="plain">
              {e.pendingApprovals.map((a) => (
                <li key={a.id}>
                  <a href="#/approvals">{a.title}</a>（確認事項 {a.itemCount}件）
                </li>
              ))}
            </ul>
          )}
        </dd>
        <dt>成果物</dt>
        <dd>
          {e.recentDeliverables.length === 0 ? (
            <span className="muted">まだありません</span>
          ) : (
            <ul className="plain">
              {e.recentDeliverables.map((d) => (
                <li key={d.id}>
                  <a href={`#/library/${d.id}`}>{d.title}</a> {d.isDemo && <DemoBadge />} <span className="muted">#{d.jobId}</span>
                </li>
              ))}
            </ul>
          )}
        </dd>
      </dl>
      <div className="panel-foot">
        <button type="button" className="btn primary" onClick={() => navigate(`request?assignee=${e.id}`)}>
          この社員に仕事を依頼
        </button>
        <a className="btn" href="#/settings">
          作業指示を編集
        </a>
      </div>
    </aside>
  );
}

export function OfficePage({ snapshot, navigate }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = snapshot.employees.find((e) => e.id === selectedId) ?? null;
  const pending = snapshot.approvals.filter((a) => a.status === 'pending');
  const counts = Object.fromEntries(BOARD_COLUMNS.map((c) => [c.key, snapshot.jobs.filter((j) => j.column === c.key).length]));
  const deliverableCount = snapshot.jobs.reduce((s, j) => s + j.deliverableCount, 0);

  return (
    <div className="office-layout">
      <section className="floor" aria-label="オフィスの見取り図">
        <div className="room room-ceo">
          <div className="room-label">社長室</div>
          <div className="ceo-desk">
            <div className="desk-person">
              {pending.length > 0 && <span className="bubble tone-review">{pending.length}</span>}
              <Avatar color="#3b3f4a" ceo />
            </div>
            <div className="desk-table wide">
              <div className="papers">{pending.length > 0 && <i />}</div>
            </div>
            <div className="nameplate">
              <span className="name">植村和也</span>
              <span className="muted">CEO</span>
            </div>
          </div>
          <button type="button" className="room-action" onClick={() => navigate('approvals')}>
            {pending.length > 0 ? `承認待ち ${pending.length}件を確認する` : '承認待ちはありません'}
          </button>
        </div>

        <div className="room room-work">
          <div className="room-label">執務エリア</div>
          <div className="desks">
            {snapshot.employees.map((e) => (
              <Desk key={e.id} e={e} selected={e.id === selectedId} onSelect={() => setSelectedId(e.id === selectedId ? null : e.id)} />
            ))}
          </div>
        </div>

        <div className="room room-meeting">
          <div className="room-label">会議室</div>
          <div className="meeting-table" aria-hidden>
            <i />
            <i />
            <i />
            <i />
          </div>
          <button type="button" className="room-action" onClick={() => navigate('request')}>
            新しい仕事を依頼する
          </button>
        </div>

        <div className="room room-library">
          <div className="room-label">資料室</div>
          <div className="shelves" aria-hidden>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="shelf">
                {Array.from({ length: Math.min(6, Math.max(0, deliverableCount - i * 6)) }, (_, k) => (
                  <i key={k} />
                ))}
              </div>
            ))}
          </div>
          <button type="button" className="room-action" onClick={() => navigate('library')}>
            成果物 {deliverableCount}件を見る
          </button>
        </div>
      </section>

      {selected ? (
        <EmployeePanel e={selected} navigate={navigate} onClose={() => setSelectedId(null)} />
      ) : (
        <aside className="panel">
          <h2>会社の状況</h2>
          <p className="muted">社員をクリックすると、役割・状態・現在の案件・成果物・相談事項を確認できます。</p>
          <ul className="stat-list">
            {BOARD_COLUMNS.map((c) => (
              <li key={c.key}>
                <a href="#/board">{c.label}</a>
                <strong>{counts[c.key]}</strong>
              </li>
            ))}
          </ul>
          <h3>実行の仕組み</h3>
          <ul className="plain">
            {snapshot.adapters.map((a) => (
              <li key={a.id}>
                <Badge tone={a.ok ? 'done' : 'cancelled'}>{a.ok ? '利用可' : '利用不可'}</Badge> {a.label}
                {a.version ? `（${a.version}）` : ''}
                {snapshot.settings.defaultAdapter === a.id && <span className="muted">・既定</span>}
              </li>
            ))}
          </ul>
          <p className="muted">同時実行数: {snapshot.runner.maxConcurrent}（実行中 {snapshot.runner.active}）</p>
          <h3>状態の見方</h3>
          <ul className="legend">
            {Object.values(EMPLOYEE_STATUS).map((s) => (
              <li key={s.label}>
                <Badge tone={s.tone}>{s.label}</Badge>
              </li>
            ))}
          </ul>
          <p className="muted small">画面が動くのは実際に実行中（作業中）のときだけです。</p>
        </aside>
      )}
    </div>
  );
}
