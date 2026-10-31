import { useEffect, useState } from 'react';
import { api, type EmployeeView, type ResearchView, type Snapshot } from '../api.ts';
import { JOB_STATUS } from '../labels.ts';
import { Badge } from '../components.tsx';
import { useReducedMotion } from '../office/state.ts';

const TOOLS: { id: string; label: string }[] = [
  { id: 'Read', label: 'ファイルを読む' },
  { id: 'Write', label: 'ファイルを書く' },
  { id: 'Edit', label: 'ファイルを編集' },
  { id: 'Glob', label: 'ファイル検索' },
  { id: 'Grep', label: '内容検索' },
  { id: 'WebSearch', label: 'Web検索（読み取り）' },
  { id: 'WebFetch', label: 'Webページ取得（読み取り）' },
];

const REFS: { id: string; label: string }[] = [
  { id: 'brief', label: '依頼書' },
  { id: 'company', label: '会社情報' },
  { id: 'feedback', label: 'CEOのコメント' },
  { id: 'plan', label: '作業計画' },
  { id: 'research', label: '調査結果' },
  { id: 'deliverables', label: '提出物（レビュー時）' },
  { id: 'review', label: '前の版へのレビュー（修正時）' },
];

const editable = (e: EmployeeView) => ({
  name: e.name,
  roleTitle: e.roleTitle,
  description: e.description,
  instructions: e.instructions,
  outputFormat: e.outputFormat,
  escalation: e.escalation,
  refs: e.refs as string[],
  color: e.color,
  tools: e.tools,
});

function EmployeeEditor({ e }: { e: EmployeeView }) {
  const [form, setForm] = useState(editable(e));
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(editable(e));
  const save = async () => {
    setBusy(true);
    try {
      await api.updateEmployee(e.id, form);
      setMsg('保存しました');
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="panel employee-editor">
      <summary>
        <span className="swatch" style={{ background: e.color }} /> {e.name} <span className="muted">（{e.roleTitle}）</span>
      </summary>
      <div className="form">
        <div className="row">
          <label>
            名前（仮の名前です）
            <input value={form.name} maxLength={40} onChange={(x) => setForm({ ...form, name: x.target.value })} />
          </label>
          <label>
            役割
            <input value={form.roleTitle} maxLength={40} onChange={(x) => setForm({ ...form, roleTitle: x.target.value })} />
          </label>
          <label className="color">
            差し色（小物）
            <input type="color" value={form.color} onChange={(x) => setForm({ ...form, color: x.target.value })} />
          </label>
        </div>
        <label>
          説明
          <input value={form.description} maxLength={400} onChange={(x) => setForm({ ...form, description: x.target.value })} />
        </label>
        <label>
          担当指示（Claude Code 実行時にシステムプロンプトへ追加されます）
          <textarea rows={5} value={form.instructions} maxLength={4000} onChange={(x) => setForm({ ...form, instructions: x.target.value })} />
        </label>
        <label>
          提出形式（どのファイルに、どの順で書くか）
          <textarea rows={4} value={form.outputFormat} maxLength={2000} onChange={(x) => setForm({ ...form, outputFormat: x.target.value })} />
        </label>
        <label>
          人間に戻す条件（該当すると重大な確認事項として報告し、次の工程の前で停止します）
          <textarea rows={3} value={form.escalation} maxLength={2000} onChange={(x) => setForm({ ...form, escalation: x.target.value })} />
        </label>
        <fieldset>
          <legend>参照できる情報（入力ファイルとして渡すもの）</legend>
          {REFS.map((r) => (
            <label key={r.id} className="check inline">
              <input
                type="checkbox"
                checked={form.refs.includes(r.id)}
                onChange={(x) => setForm({ ...form, refs: x.target.checked ? [...form.refs, r.id] : form.refs.filter((v) => v !== r.id) })}
              />
              {r.label}
            </label>
          ))}
          <p className="muted small">工程の入力として一覧で渡すファイルを決めます。案件の作業ディレクトリ内のファイル自体は読み取れるため、アクセス制限ではありません。</p>
        </fieldset>
        <fieldset>
          <legend>Claude Code で使えるツール</legend>
          {TOOLS.map((t) => (
            <label key={t.id} className="check inline">
              <input
                type="checkbox"
                checked={form.tools.includes(t.id)}
                onChange={(x) => setForm({ ...form, tools: x.target.checked ? [...form.tools, t.id] : form.tools.filter((v) => v !== t.id) })}
              />
              {t.label}
            </label>
          ))}
          <p className="muted small">シェルコマンド（Bash）は初期版では許可できません。ファイル操作は案件の作業ディレクトリ内に限られます。</p>
        </fieldset>
        <div className="form-actions">
          <button type="button" className="btn primary" disabled={!dirty || busy} onClick={save}>
            保存
          </button>
          {msg && <span className="muted">{msg}</span>}
        </div>
      </div>
    </details>
  );
}

const NUMBER_FIELDS = [
  { key: 'maxTurns', label: '1工程あたりの最大ターン数（Claude Code）', step: 1 },
  { key: 'maxBudgetUsd', label: '1工程あたりの費用上限 USD（Claude Code の推定値で判定）', step: 0.05 },
  { key: 'timeoutSec', label: '1工程あたりの制限時間 秒（Claude Code）', step: 30 },
  { key: 'maxRunsPerDay', label: '1日あたりの実接続の工程数の上限', step: 1 },
  { key: 'maxAttemptsPerJob', label: '1案件あたりの実行回数の上限（差し戻し・やり直しを含む）', step: 1 },
  { key: 'maxJobBudgetUsd', label: '1案件あたりの費用上限 USD（報告された推定値の合計）', step: 0.5 },
  { key: 'maxStageRunsPerAttempt', label: '1回の実行で起動する工程数の上限（自動修正を含む）', step: 1 },
  { key: 'maxAutoRework', label: 'レビュー不合格時の自動修正の回数（0で自動修正しない）', step: 1 },
  { key: 'maxDailyBudgetUsd', label: '1日の費用上限 USD（報告された推定値の合計）', step: 1 },
  { key: 'maxMonthlyBudgetUsd', label: '1か月の費用上限 USD（報告された推定値の合計）', step: 5 },
  { key: 'maxJobTimeSec', label: '1回の実行で工程に使える時間の合計 秒', step: 60 },
  { key: 'demoTimeoutSec', label: 'デモ実行の制限時間 秒', step: 1 },
] as const;

function ExecutionSettings({ snapshot }: { snapshot: Snapshot }) {
  const [form, setForm] = useState<Record<string, string | number | boolean>>({ ...snapshot.settings });
  const [msg, setMsg] = useState('');
  const save = async () => {
    try {
      await api.updateSettings(form);
      setMsg('保存しました');
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  const refresh = async () => {
    setMsg('確認中…');
    await api.refreshAdapters().catch(() => {});
    setMsg('再確認しました');
  };
  return (
    <section className="panel">
      <h2>実行方式</h2>
      <ul className="plain">
        {snapshot.adapters.map((a) => (
          <li key={a.id}>
            <Badge tone={a.ok ? 'done' : 'cancelled'}>{a.ok ? '利用可' : '利用不可'}</Badge> <strong>{a.label}</strong> {a.version && <span className="muted">{a.version}</span>} — <span className="muted">{a.detail}</span>
          </li>
        ))}
      </ul>
      <button type="button" className="btn small" onClick={refresh}>
        Claude Code の検出を再確認
      </button>
      <div className="form">
        <fieldset>
          <legend>新しい依頼の既定の実行方式</legend>
          {snapshot.adapters.map((a) => (
            <label key={a.id} className="check">
              <input type="radio" name="defaultAdapter" checked={form.defaultAdapter === a.id} disabled={!a.ok} onChange={() => setForm({ ...form, defaultAdapter: a.id })} />
              {a.label}
            </label>
          ))}
        </fieldset>
        <label>
          Claude Code のモデル（空欄なら Claude Code の既定。例: sonnet / opus）
          <input value={String(form.claudeModel ?? '')} maxLength={64} onChange={(e) => setForm({ ...form, claudeModel: e.target.value })} />
        </label>
        <div className="grid-2">
          {NUMBER_FIELDS.map((f) => (
            <label key={f.key}>
              {f.label}
              <input type="number" step={f.step} value={String(form[f.key])} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            </label>
          ))}
        </div>
        <p className="muted small">費用は Claude Code が報告する推定値です（サブスクリプション利用時は実際の請求額と一致しません）。報告がない場合は「未取得」と表示します。</p>
        <div className="form-actions">
          <button type="button" className="btn primary" onClick={save}>
            保存
          </button>
          {msg && <span className="muted">{msg}</span>}
        </div>
      </div>
    </section>
  );
}

/** 会社の基本情報（名前・CEO・法人の状態）。方針・仮説・未決事項は「会社の記憶」で版つきで管理する。 */
function CompanyEditor({ snapshot }: { snapshot: Snapshot }) {
  const c = snapshot.company;
  const initial = { name: c.name, ceo: c.ceo, status: c.status };
  const [form, setForm] = useState(initial);
  const [msg, setMsg] = useState('');
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const save = async () => {
    try {
      await api.updateCompany(form);
      setMsg('保存しました（次に開始する案件から反映）');
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  return (
    <section className="panel" id="company">
      <h2>会社情報</h2>
      <p className="muted small">
        確定した方針・検証中の仮説・未決事項は <a href="#/memory">会社の記憶</a> で編集します（版つきで記録され、案件の開始時に固定されます）。
      </p>
      <div className="form">
        <div className="row">
          <label>
            会社名
            <input value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            CEO
            <input value={form.ceo} maxLength={60} onChange={(e) => setForm({ ...form, ceo: e.target.value })} />
          </label>
        </div>
        <label>
          法人の状態
          <input value={form.status} maxLength={200} onChange={(e) => setForm({ ...form, status: e.target.value })} />
        </label>
        <div className="form-actions">
          <button type="button" className="btn primary" disabled={!dirty} onClick={save}>
            保存
          </button>
          {msg && <span className="muted">{msg}</span>}
        </div>
      </div>
    </section>
  );
}

/** 研究員（カイ）の定期研究。初期値は無効。間隔・1日の件数・確認待ちの上限を決めて有効にする。 */
function ResearchSettings() {
  const [data, setData] = useState<ResearchView | null>(null);
  const [form, setForm] = useState({ recurringIntervalHours: 24, recurringMaxPerDay: 1, recurringMaxPending: 3 });
  const [topic, setTopic] = useState('');
  const [msg, setMsg] = useState('');
  const load = () =>
    api.research().then((d) => {
      setData(d);
      setForm({ recurringIntervalHours: d.settings.recurringIntervalHours, recurringMaxPerDay: d.settings.recurringMaxPerDay, recurringMaxPending: d.settings.recurringMaxPending });
    });
  useEffect(() => {
    void load();
  }, []);
  if (!data) return null;
  const act = async (fn: () => Promise<unknown>, done: string) => {
    setMsg('');
    try {
      await fn();
      setMsg(done);
      await load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  const enabled = data.settings.recurringEnabled;
  return (
    <section className="panel" id="research" data-testid="research-settings">
      <h2>研究員の定期研究</h2>
      <p className="muted small">
        研究員カイが、登録したテーマを一定の間隔で1件ずつ研究し（作業計画→文献調査→研究ノート→レビュー）、成果を受信箱に届けます。実験・計算の実行はしません。
        サーバーが動いている間だけ動きます（PC のスリープ中は進みません）。費用・回数の上限は通常の案件と同じです。
      </p>
      <p>
        <Badge tone={enabled ? 'working' : 'cancelled'}>{enabled ? '有効' : '無効'}</Badge>{' '}
        {enabled ? (data.waitingReason ? `待機中: ${data.waitingReason}` : '次の判定で開始します') : '有効にすると自動で始まります'}
        {enabled && data.nextDueAt && <span className="muted small">（次の予定: {new Date(data.nextDueAt).toLocaleString('ja-JP')} 以降）</span>}
      </p>
      <div className="form">
      <div className="grid-2">
        <label>
          間隔（時間）
          <input type="number" min={1} max={168} value={form.recurringIntervalHours} onChange={(e) => setForm({ ...form, recurringIntervalHours: Number(e.target.value) })} />
        </label>
        <label>
          1日に作る件数の上限
          <input type="number" min={1} max={10} value={form.recurringMaxPerDay} onChange={(e) => setForm({ ...form, recurringMaxPerDay: Number(e.target.value) })} />
        </label>
        <label>
          CEOの確認待ちがこの件数に達したら止める
          <input type="number" min={1} max={10} value={form.recurringMaxPending} onChange={(e) => setForm({ ...form, recurringMaxPending: Number(e.target.value) })} />
        </label>
      </div>
      </div>
      <div className="form-actions">
        <button
          type="button"
          className={`btn ${enabled ? '' : 'primary'}`}
          onClick={() =>
            act(
              () => api.updateSettings({ ...form, recurringEnabled: !enabled }),
              enabled ? '定期研究を無効にしました' : '定期研究を有効にしました（利用枠を使います）',
            )
          }
        >
          {enabled ? '定期研究を無効にする' : '保存して定期研究を有効にする'}
        </button>
        <button type="button" className="btn" onClick={() => act(() => api.updateSettings(form), '保存しました')}>
          間隔・上限だけ保存
        </button>
        <button type="button" className="btn" disabled={!data.topics.some((t) => t.active)} onClick={() => act(() => api.researchRunNow(), '研究を1件開始しました（待ち行列に入りました）')}>
          今すぐ1件研究させる
        </button>
        {msg && <span className="muted small">{msg}</span>}
      </div>
      <h3>研究テーマ（上から順に、まだ研究していないものを優先）</h3>
      {data.topics.length === 0 ? (
        <p className="muted small">テーマがありません。下で追加してください。</p>
      ) : (
        <ul className="plain">
          {data.topics.map((t) => (
            <li key={t.id} className="memory-row">
              <label className="check inline">
                <input type="checkbox" checked={t.active} onChange={(e) => act(() => api.updateTopic(t.id, { active: e.target.checked }), '更新しました')} />
                {t.text}
              </label>{' '}
              <span className="muted small">テーマ#{t.id}・研究 {t.jobCount}回</span>
            </li>
          ))}
        </ul>
      )}
      <div className="form-actions">
        <input value={topic} maxLength={300} onChange={(e) => setTopic(e.target.value)} placeholder="例: ペロブスカイト太陽電池の耐久性を高める方法" aria-label="研究テーマを追加" />
        <button type="button" className="btn small" disabled={!topic.trim()} onClick={() => act(async () => { await api.addTopic(topic); setTopic(''); }, 'テーマを追加しました')}>
          追加
        </button>
      </div>
      <p className="muted small">兵器・危険な合成など安全上扱えないテーマは研究しません。医療・人や動物を対象とする内容は、専門家・倫理審査の確認が必要と明記されます。</p>
      {data.recent.length > 0 && (
        <>
          <h3>最近の定期研究</h3>
          <ul className="plain small">
            {data.recent.map((j) => (
              <li key={j.id}>
                <a href={`#/jobs/${j.id}`}>
                  #{j.id} {j.title}
                </a>{' '}
                <span className="muted">
                  {JOB_STATUS[j.status as keyof typeof JOB_STATUS]?.label}・{new Date(j.createdAt).toLocaleString('ja-JP')}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function DisplaySettings() {
  const { pref, setPref } = useReducedMotion();
  return (
    <section className="panel">
      <h2>表示</h2>
      <fieldset>
        <legend>アニメーション（このブラウザだけの設定）</legend>
        {(
          [
            ['system', 'OS の設定に従う'],
            ['on', '動きを減らす（まばたき・書類の受け渡しなどを止める）'],
            ['off', '動きを減らさない'],
          ] as const
        ).map(([v, label]) => (
          <label key={v} className="check">
            <input type="radio" name="motion" checked={pref === v} onChange={() => setPref(v)} />
            {label}
          </label>
        ))}
      </fieldset>
      <p className="muted small">動きを減らしても、状態の表示・通知・出来事の一覧は同じように確認できます。</p>
    </section>
  );
}

export function SettingsPage({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div className="page narrow">
      <h1>設定</h1>
      <CompanyEditor key={`${snapshot.company.name}-${snapshot.company.ceo}-${snapshot.company.status}`} snapshot={snapshot} />
      <ExecutionSettings snapshot={snapshot} />
      <ResearchSettings />
      <DisplaySettings />
      <h2>AI社員</h2>
      <p className="muted">名前・役割・担当指示・提出形式・人間に戻す条件・参照できる情報・使えるツールを変更できます。変更は次の実行から反映されます。</p>
      {snapshot.employees.map((e) => (
        <EmployeeEditor key={`${e.id}-${e.updatedAt}`} e={e} />
      ))}
    </div>
  );
}
