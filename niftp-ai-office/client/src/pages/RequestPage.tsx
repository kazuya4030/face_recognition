import { useState, type FormEvent } from 'react';
import { api, type Snapshot } from '../api.ts';
import { hashQuery } from '../hooks.ts';

type Props = { snapshot: Snapshot; navigate: (p: string) => void };

export function RequestPage({ snapshot, navigate }: Props) {
  const defaultAssignee = hashQuery().get('assignee') ?? snapshot.employees.find((e) => e.roleKey === 'researcher')?.id ?? snapshot.employees[0]?.id;
  const [form, setForm] = useState({
    title: '',
    purpose: '',
    details: '',
    acceptanceCriteria: '',
    assigneeId: defaultAssignee ?? '',
    usePlanner: true,
    useReviewer: true,
    adapter: snapshot.settings.defaultAdapter as string,
    demoScenario: 'normal',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const adapter = snapshot.adapters.find((a) => a.id === form.adapter);
  const manager = snapshot.employees.find((e) => e.roleKey === 'manager');
  const qa = snapshot.employees.find((e) => e.roleKey === 'qa');
  const required = ['title', 'purpose', 'details', 'acceptanceCriteria', 'assigneeId'] as const;
  const missing = required.filter((k) => !String(form[k]).trim());

  const submit = async (startNow: boolean, e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    try {
      const created = await api.createJob({ ...form, startNow });
      navigate(`jobs/${created.job.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const stagePreview = [
    form.usePlanner && manager && manager.id !== form.assigneeId ? `${manager.name}（作業分解）` : null,
    `${snapshot.employees.find((e) => e.id === form.assigneeId)?.name ?? '担当未選択'}（実行）`,
    form.useReviewer && qa && qa.id !== form.assigneeId ? `${qa.name}（品質確認）` : null,
    'CEO（承認・差し戻し）',
  ].filter(Boolean);

  return (
    <div className="page narrow">
      <h1>仕事の依頼</h1>
      <form className="form" onSubmit={(e) => submit(false, e)}>
        <label>
          タイトル <span className="req">必須</span>
          <input value={form.title} maxLength={120} onChange={(e) => set('title', e.target.value)} placeholder="例: 競合サービスの料金調査" />
        </label>
        <label>
          目的 <span className="req">必須</span>
          <textarea rows={2} value={form.purpose} maxLength={2000} onChange={(e) => set('purpose', e.target.value)} placeholder="何のための仕事か" />
        </label>
        <label>
          依頼内容 <span className="req">必須</span>
          <textarea rows={5} value={form.details} maxLength={8000} onChange={(e) => set('details', e.target.value)} placeholder="具体的にやってほしいこと、前提、参考情報" />
        </label>
        <label>
          完了条件 <span className="req">必須</span>
          <textarea rows={3} value={form.acceptanceCriteria} maxLength={4000} onChange={(e) => set('acceptanceCriteria', e.target.value)} placeholder={'1行に1条件。例:\n3社の料金表がある\n各数値に出典URLがある'} />
        </label>
        <label>
          担当社員 <span className="req">必須</span>
          <select value={form.assigneeId} onChange={(e) => set('assigneeId', e.target.value)}>
            {snapshot.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}（{e.roleTitle}）
              </option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend>進め方</legend>
          <label className="check">
            <input type="checkbox" checked={form.usePlanner} disabled={!manager || manager.id === form.assigneeId} onChange={(e) => set('usePlanner', e.target.checked)} />
            業務責任者AIが先に作業を分解する
          </label>
          <label className="check">
            <input type="checkbox" checked={form.useReviewer} disabled={!qa || qa.id === form.assigneeId} onChange={(e) => set('useReviewer', e.target.checked)} />
            品質確認AIが成果物を照合する
          </label>
          <p className="muted small">流れ: {stagePreview.join(' → ')}</p>
        </fieldset>

        <fieldset>
          <legend>実行方式</legend>
          {snapshot.adapters.map((a) => (
            <label key={a.id} className="check">
              <input type="radio" name="adapter" value={a.id} checked={form.adapter === a.id} disabled={!a.ok} onChange={() => set('adapter', a.id)} />
              {a.label}
              {a.isDemo ? '（定型データで流れを確認。実際のAI作業ではありません）' : '（実際にClaude Codeが作業します。費用・利用枠を消費します）'}
              {!a.ok && <span className="muted">・利用不可: {a.detail}</span>}
            </label>
          ))}
          {form.adapter === 'demo' && (
            <label>
              デモのシナリオ
              <select value={form.demoScenario} onChange={(e) => set('demoScenario', e.target.value)}>
                <option value="normal">正常に完了する</option>
                <option value="error">途中でエラーになる（エラー表示の確認用）</option>
                <option value="timeout">応答が止まりタイムアウトする（タイムアウト表示の確認用）</option>
              </select>
            </label>
          )}
          {form.adapter === 'claude' && (
            <p className="muted small">
              上限: 1工程あたり {snapshot.settings.maxTurns}ターン・{snapshot.settings.maxBudgetUsd} USD・{snapshot.settings.timeoutSec}秒。作業は案件専用のディレクトリ内に限定され、外部への送信・公開・削除などは行いません。
            </p>
          )}
        </fieldset>

        {error && <p className="inline-error">{error}</p>}
        <div className="form-actions">
          <button type="submit" className="btn" disabled={busy || missing.length > 0}>
            登録のみ（未着手）
          </button>
          <button type="button" className="btn primary" disabled={busy || missing.length > 0 || !adapter?.ok} onClick={() => submit(true)}>
            登録して開始
          </button>
          {missing.length > 0 && <span className="muted small">必須項目をすべて入力すると登録できます</span>}
        </div>
      </form>
    </div>
  );
}
