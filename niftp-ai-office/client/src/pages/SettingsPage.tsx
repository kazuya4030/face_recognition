import { useState } from 'react';
import { api, type EmployeeView, type Snapshot } from '../api.ts';
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
  { key: 'demoTimeoutSec', label: 'デモ実行の制限時間 秒', step: 1 },
] as const;

function ExecutionSettings({ snapshot }: { snapshot: Snapshot }) {
  const [form, setForm] = useState<Record<string, string | number>>({ ...snapshot.settings });
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
              <input type="number" step={f.step} value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
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

const toLines = (xs: string[]) => xs.join('\n');

/** 会社情報。確定事項・仮説・未決定（未確認）を分けて保存し、AI社員の作業ディレクトリに渡す。 */
function CompanyEditor({ snapshot }: { snapshot: Snapshot }) {
  const c = snapshot.company;
  const initial = { name: c.name, ceo: c.ceo, status: c.status, facts: toLines(c.facts), hypotheses: toLines(c.hypotheses), unknowns: toLines(c.unknowns) };
  const [form, setForm] = useState(initial);
  const [msg, setMsg] = useState('');
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const save = async () => {
    try {
      await api.updateCompany(form);
      setMsg('保存しました（次の実行から反映）');
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  const area = (key: 'facts' | 'hypotheses' | 'unknowns', label: string, hint: string) => (
    <label>
      {label}
      <textarea rows={key === 'facts' ? 6 : 3} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={hint} />
    </label>
  );
  return (
    <section className="panel" id="company">
      <h2>会社情報</h2>
      <p className="muted small">1行に1項目。AI社員には「確定事項」だけを事実として渡し、仮説は検証対象、未決定・未確認は推測で埋めないよう指示します。ここにない実績・顧客・売上は作らせません。</p>
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
        {area('facts', '確定事項', '例: 方針：…')}
        {area('hypotheses', '仮説（検証が必要）', '例: 中小企業の◯◯業務に需要がある')}
        {area('unknowns', '未決定・未確認', '例: 実際の売上')}
        <div className="form-actions">
          <button type="button" className="btn primary" disabled={!dirty} onClick={save}>
            保存
          </button>
          {msg && <span className="muted">{msg}</span>}
          {c.updatedAt && <span className="muted small">最終更新 {new Date(c.updatedAt).toLocaleString('ja-JP')}</span>}
        </div>
      </div>
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
      <CompanyEditor key={snapshot.company.updatedAt} snapshot={snapshot} />
      <ExecutionSettings snapshot={snapshot} />
      <DisplaySettings />
      <h2>AI社員</h2>
      <p className="muted">名前・役割・担当指示・提出形式・人間に戻す条件・参照できる情報・使えるツールを変更できます。変更は次の実行から反映されます。</p>
      {snapshot.employees.map((e) => (
        <EmployeeEditor key={`${e.id}-${e.updatedAt}`} e={e} />
      ))}
    </div>
  );
}
