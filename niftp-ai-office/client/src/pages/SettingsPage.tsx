import { useState } from 'react';
import { api, type EmployeeView, type Snapshot } from '../api.ts';
import { Badge } from '../components.tsx';

const TOOLS: { id: string; label: string }[] = [
  { id: 'Read', label: 'ファイルを読む' },
  { id: 'Write', label: 'ファイルを書く' },
  { id: 'Edit', label: 'ファイルを編集' },
  { id: 'Glob', label: 'ファイル検索' },
  { id: 'Grep', label: '内容検索' },
  { id: 'WebSearch', label: 'Web検索（読み取り）' },
  { id: 'WebFetch', label: 'Webページ取得（読み取り）' },
];

function EmployeeEditor({ e }: { e: EmployeeView }) {
  const [form, setForm] = useState({ name: e.name, roleTitle: e.roleTitle, description: e.description, instructions: e.instructions, color: e.color, tools: e.tools });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify({ name: e.name, roleTitle: e.roleTitle, description: e.description, instructions: e.instructions, color: e.color, tools: e.tools });
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
            名前
            <input value={form.name} maxLength={40} onChange={(x) => setForm({ ...form, name: x.target.value })} />
          </label>
          <label>
            役割
            <input value={form.roleTitle} maxLength={40} onChange={(x) => setForm({ ...form, roleTitle: x.target.value })} />
          </label>
          <label className="color">
            色
            <input type="color" value={form.color} onChange={(x) => setForm({ ...form, color: x.target.value })} />
          </label>
        </div>
        <label>
          説明
          <input value={form.description} maxLength={400} onChange={(x) => setForm({ ...form, description: x.target.value })} />
        </label>
        <label>
          作業指示（Claude Code 実行時にシステムプロンプトへ追加されます）
          <textarea rows={5} value={form.instructions} maxLength={4000} onChange={(x) => setForm({ ...form, instructions: x.target.value })} />
        </label>
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

export function SettingsPage({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div className="page narrow">
      <h1>設定</h1>
      <ExecutionSettings snapshot={snapshot} />
      <h2>AI社員</h2>
      <p className="muted">名前・役割・作業指示・使えるツールを変更できます。変更は次の実行から反映されます。</p>
      {snapshot.employees.map((e) => (
        <EmployeeEditor key={`${e.id}-${e.updatedAt}`} e={e} />
      ))}
    </div>
  );
}
