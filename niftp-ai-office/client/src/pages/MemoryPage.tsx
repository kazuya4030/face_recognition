// 会社の記憶。会社共通の情報（確定した方針・検証中の仮説・未決事項）と、案件限定の情報（CEO の指摘）を分けて表示する。
// 案件の指摘は、その案件の修正にだけ使われる。会社共通にするには「会社共通の方針に登録」を明示的に押す。
import { useCallback, useEffect, useState } from 'react';
import { api, type MemoryView } from '../api.ts';
import { Badge, DemoBadge, Empty } from '../components.tsx';
import { useChangeSignal } from '../hooks.ts';
import { formatTime } from '../labels.ts';

type Kind = 'policy' | 'hypothesis' | 'undecided';
const KINDS: Kind[] = ['policy', 'hypothesis', 'undecided'];
const NOTE_KIND: Record<string, string> = { rejection: '差し戻し', answer: '質問への回答', plan: '作業計画の確認', resume: '再開時の指示' };

function MemoryRow({ item, onDone }: { item: MemoryView['items'][number]; onDone: () => void }) {
  const [editing, setEditing] = useState(false);
  const [textValue, setText] = useState(item.text);
  const [kind, setKind] = useState<Kind>(item.kind);
  const [error, setError] = useState('');
  const save = async (body: Record<string, unknown>) => {
    try {
      await api.updateMemory(item.id, body);
      setEditing(false);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <li className="memory-row" data-testid={`memory-${item.id}`}>
      {editing ? (
        <div className="form">
          <textarea rows={2} maxLength={1000} value={textValue} onChange={(e) => setText(e.target.value)} />
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label="種類">
            <option value="policy">確定した会社方針</option>
            <option value="hypothesis">検証中の仮説</option>
            <option value="undecided">未決事項</option>
          </select>
          <div className="form-actions">
            <button type="button" className="btn small primary" onClick={() => save({ text: textValue, kind })}>
              保存（新しい版になります）
            </button>
            <button type="button" className="btn small ghost" onClick={() => setEditing(false)}>
              やめる
            </button>
          </div>
        </div>
      ) : (
        <>
          <span>{item.text}</span>{' '}
          <span className="muted small">
            記憶#{item.id}・第{item.version}版・{formatTime(item.updatedAt)}
            {item.sourceNoteId != null && `・案件の指摘#${item.sourceNoteId}から登録`}
          </span>{' '}
          <button type="button" className="btn small ghost" onClick={() => setEditing(true)}>
            編集
          </button>
          <button type="button" className="btn small ghost" onClick={() => save({ archived: true })}>
            アーカイブ
          </button>
        </>
      )}
      {error && <span className="inline-error">{error}</span>}
    </li>
  );
}

function PromoteForm({ note, onDone }: { note: MemoryView['notes'][number]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [textValue, setText] = useState(note.text);
  const [kind, setKind] = useState<Kind>('policy');
  const [error, setError] = useState('');
  if (!open) {
    return (
      <button type="button" className="btn small" onClick={() => setOpen(true)}>
        会社共通の方針に登録…
      </button>
    );
  }
  return (
    <div className="form">
      <p className="muted small">登録すると、以後に開始する全案件へ会社の記憶として渡されます（実行中の案件は変わりません）。必要なら全案件向けの表現に直してください。</p>
      <textarea rows={2} maxLength={1000} value={textValue} onChange={(e) => setText(e.target.value)} aria-label="登録する内容" />
      <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label="登録先">
        <option value="policy">確定した会社方針</option>
        <option value="hypothesis">検証中の仮説</option>
        <option value="undecided">未決事項</option>
      </select>
      <div className="form-actions">
        <button
          type="button"
          className="btn small primary"
          onClick={async () => {
            try {
              await api.promoteNote(note.id, kind, textValue);
              onDone();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          会社の記憶に登録する
        </button>
        <button type="button" className="btn small ghost" onClick={() => setOpen(false)}>
          やめる
        </button>
      </div>
      {error && <p className="inline-error">{error}</p>}
    </div>
  );
}

export function MemoryPage({ navigate }: { navigate: (p: string) => void }) {
  const [data, setData] = useState<MemoryView | null>(null);
  const [newText, setNewText] = useState<Record<Kind, string>>({ policy: '', hypothesis: '', undecided: '' });
  const [error, setError] = useState('');
  const reload = useCallback(() => {
    api.memory().then(setData).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(reload, [reload]);
  useChangeSignal(reload);
  if (!data) return <p className="muted">{error || '読み込み中…'}</p>;
  const active = data.items.filter((i) => !i.archivedAt);
  const archived = data.items.filter((i) => i.archivedAt);
  const add = async (kind: Kind) => {
    try {
      await api.addMemory(kind, newText[kind]);
      setNewText({ ...newText, [kind]: '' });
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="page narrow memory">
      <h1>会社の記憶</h1>
      <p className="muted">
        {data.company.name}（{data.company.status}）・CEO {data.company.ceo}。会社名・CEO・法人の状態は「設定」で変更できます。
      </p>
      {error && <p className="inline-error">{error}</p>}

      <h2>会社共通の情報</h2>
      <p className="muted small">案件を開始したときの版が固定され、その案件の全工程に渡されます（途中で編集しても、実行中の案件の入力は変わりません）。編集すると新しい版になり、過去の版も残ります。ここにない実績・顧客・売上は、AI社員に作らせません。</p>
      {KINDS.map((k) => (
        <section key={k} className="panel" data-testid={`memory-section-${k}`}>
          <h3>{data.kinds[k]}</h3>
          {active.filter((i) => i.kind === k).length === 0 ? (
            <Empty>登録はありません。</Empty>
          ) : (
            <ul className="plain memory-list">
              {active
                .filter((i) => i.kind === k)
                .map((i) => (
                  <MemoryRow key={`${i.id}-${i.version}`} item={i} onDone={reload} />
                ))}
            </ul>
          )}
          <div className="form-actions">
            <input value={newText[k]} maxLength={1000} onChange={(e) => setNewText({ ...newText, [k]: e.target.value })} placeholder="追加する内容" aria-label={`${data.kinds[k]}を追加`} />
            <button type="button" className="btn small" disabled={!newText[k].trim()} onClick={() => add(k)}>
              追加
            </button>
          </div>
        </section>
      ))}
      {archived.length > 0 && (
        <details className="panel">
          <summary>アーカイブした項目（{archived.length}件）</summary>
          <ul className="plain">
            {archived.map((i) => (
              <li key={i.id} className="muted">
                記憶#{i.id}（{data.kinds[i.kind]}・第{i.version}版）{i.text}{' '}
                <button type="button" className="btn small ghost" onClick={() => api.updateMemory(i.id, { archived: false }).then(reload)}>
                  戻す
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <h2>承認済みの成果物</h2>
      <section className="panel">
        <p className="muted small">CEOが承認した版の成果物です。承認は「その版の成果物を受け取った」ことで、会社方針として採用したことではありません。新しい案件の参照資料として渡せます。</p>
        {data.approved.length === 0 ? (
          <Empty>承認済みの成果物はまだありません。</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>成果物</th>
                <th>案件・版</th>
                <th>承認</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.approved.map((d) => (
                <tr key={d.deliverableId}>
                  <td>
                    <a href={`#/library/${d.deliverableId}`}>{d.title}</a> {d.isDemo && <DemoBadge />}
                  </td>
                  <td>
                    <a href={`#/jobs/${d.jobId}`}>#{d.jobId} {d.jobTitle}</a>・第{d.revision}版
                  </td>
                  <td className="small">
                    承認#{d.approvalId}・{formatTime(d.decidedAt)}
                  </td>
                  <td>
                    <button type="button" className="btn small" onClick={() => navigate(`request?ref=${d.deliverableId}`)}>
                      参照して依頼
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <h2>案件で受けたCEOの指摘（案件限定）</h2>
      <section className="panel">
        <p className="muted small">差し戻し・質問への回答・作業計画の確認で CEO が書いた内容です。その案件の修正にだけ使われ、他の案件には渡されません。</p>
        {data.notes.length === 0 ? (
          <Empty>指摘はまだありません。</Empty>
        ) : (
          <ul className="plain note-list">
            {[...data.notes].reverse().map((n) => (
              <li key={n.id} className="note-row" data-testid={`note-${n.id}`}>
                <div>
                  <Badge tone="idle">{NOTE_KIND[n.kind] ?? n.kind}</Badge>{' '}
                  <a href={`#/jobs/${n.jobId}`}>
                    #{n.jobId} {n.jobTitle}
                  </a>{' '}
                  {n.jobAdapter === 'demo' && <DemoBadge />}
                  <span className="muted small">
                    {' '}
                    指摘#{n.id}・第{n.revision}版・{formatTime(n.createdAt)}
                  </span>
                </div>
                <p className="pre-wrap">{n.text}</p>
                {n.promotedItemId != null ? <span className="muted small">会社の記憶#{n.promotedItemId} に登録済み</span> : <PromoteForm note={n} onDone={reload} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
