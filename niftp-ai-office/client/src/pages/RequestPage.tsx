import { useEffect, useState, type FormEvent } from 'react';
import { api, type JobTemplate, type Snapshot } from '../api.ts';
import { hashQuery } from '../hooks.ts';
import { ACCEPT, ApprovedPicker, MAX_BYTES, uploadFiles } from './materials.tsx';

const STAGE_FIELDS: { key: 'plan' | 'research' | 'execute' | 'review'; label: string }[] = [
  { key: 'plan', label: '作業計画（ハル）への指示' },
  { key: 'research', label: '調査（ミナ）への指示' },
  { key: 'execute', label: '成果物作成（担当）への指示' },
  { key: 'review', label: 'レビュー（リツ）への指示' },
];

type Props = { snapshot: Snapshot; navigate: (p: string) => void };

export function RequestPage({ snapshot, navigate }: Props) {
  const defaultAssignee = hashQuery().get('assignee') ?? snapshot.employees.find((e) => e.roleKey === 'builder')?.id ?? snapshot.employees[0]?.id;
  const [form, setForm] = useState({
    title: '',
    purpose: '',
    details: '',
    acceptanceCriteria: '',
    assigneeId: defaultAssignee ?? '',
    usePlanner: true,
    useResearch: true,
    useReviewer: true,
    reviewPlan: true,
    researchWeb: true,
    templateId: '',
    adapter: snapshot.settings.defaultAdapter as string,
    demoScenario: 'normal',
  });
  const [instructions, setInstructions] = useState<Record<string, string>>({});
  const [templates, setTemplates] = useState<JobTemplate[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [refs, setRefs] = useState<number[]>(() => {
    const r = Number(hashQuery().get('ref'));
    return Number.isInteger(r) && r > 0 ? [r] : [];
  });
  useEffect(() => {
    api.templates().then(setTemplates).catch(() => setTemplates([]));
  }, []);
  const applyTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) {
      setForm((f) => ({ ...f, templateId: '' }));
      return;
    }
    const assignee = snapshot.employees.find((e) => e.roleKey === t.assigneeRole)?.id ?? form.assigneeId;
    setForm((f) => ({
      ...f,
      templateId: t.id,
      purpose: f.purpose || t.purpose,
      details: f.details.trim() ? f.details : t.details,
      acceptanceCriteria: t.acceptanceCriteria,
      assigneeId: assignee,
      usePlanner: t.usePlanner,
      useResearch: t.useResearch,
      useReviewer: t.useReviewer,
      researchWeb: t.researchWeb,
      reviewPlan: t.reviewPlan,
    }));
    setInstructions({ ...t.stageInstructions });
  };
  const template = templates.find((t) => t.id === form.templateId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const adapter = snapshot.adapters.find((a) => a.id === form.adapter);
  const manager = snapshot.employees.find((e) => e.roleKey === 'manager');
  const researcher = snapshot.employees.find((e) => e.roleKey === 'researcher');
  const qa = snapshot.employees.find((e) => e.roleKey === 'qa');
  const required = ['title', 'purpose', 'details', 'acceptanceCriteria', 'assigneeId'] as const;
  const missing = required.filter((k) => !String(form[k]).trim());

  const submit = async (startNow: boolean, e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    try {
      // 先に案件を登録し、資料を添付してから開始する（開始時に資料の版が固定される）
      const created = await api.createJob({ ...form, stageInstructions: instructions, startNow: false });
      const id = created.job.id;
      const errors = await uploadFiles(id, files);
      for (const r of refs) await api.addReference(id, r).catch((e: Error) => errors.push(e.message));
      if (errors.length > 0) {
        // 一部の資料を添付できなかった場合は開始せず、案件の画面で確認できるようにする
        window.alert(`登録しましたが、次の資料を添付できなかったため開始していません:\n${errors.join('\n')}`);
      } else if (startNow) {
        await api.jobAction(id, 'start', {});
      }
      navigate(`jobs/${id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const stagePreview = [
    form.usePlanner && manager && manager.id !== form.assigneeId ? `${manager.name}（作業計画）` : null,
    form.usePlanner && form.reviewPlan && manager && manager.id !== form.assigneeId ? 'CEO（作業計画の確認）' : null,
    form.useResearch && researcher && researcher.id !== form.assigneeId ? `${researcher.name}（調査${form.researchWeb ? '・Web' : '・資料のみ'}）` : null,
    `${snapshot.employees.find((e) => e.id === form.assigneeId)?.name ?? '担当未選択'}（成果物作成）`,
    form.useReviewer && qa && qa.id !== form.assigneeId ? `${qa.name}（レビュー）` : null,
    'CEO（承認・差し戻し）',
  ].filter(Boolean);

  return (
    <div className="page narrow">
      <h1>仕事の依頼</h1>
      <form className="form" onSubmit={(e) => submit(false, e)}>
        <label>
          業務テンプレート（任意）
          <select value={form.templateId} onChange={(e) => applyTemplate(e.target.value)} aria-label="業務テンプレート">
            <option value="">使わない</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}（{t.flow}）
              </option>
            ))}
          </select>
        </label>
        {template && (
          <p className="note small">
            {template.description}
            <br />
            必要な入力: {template.requiredInputs}
            <br />
            テンプレートで入る内容（完了条件・工程の設定・工程ごとの指示）は、下で自由に編集できます。
          </p>
        )}
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
          <legend>資料</legend>
          <label>
            資料を添付（.txt / .md / .csv、1件 1MB まで・10件まで。PDF・Word・Excel は未対応）
            <input
              type="file"
              multiple
              accept={ACCEPT}
              aria-label="資料を添付"
              onChange={(e) => setFiles([...(e.target.files ?? [])])}
            />
          </label>
          {files.length > 0 && (
            <ul className="plain small">
              {files.map((f) => (
                <li key={f.name}>
                  {f.name}（{Math.ceil(f.size / 1024)} KB）{f.size > MAX_BYTES && <span className="inline-error">1MB を超えているため添付できません</span>}
                </li>
              ))}
            </ul>
          )}
          <details open={refs.length > 0}>
            <summary>承認済みの成果物を参照資料に追加（{refs.length}件選択中）</summary>
            <ApprovedPicker selected={refs} onChange={setRefs} realOnly={form.adapter !== 'demo'} />
          </details>
          <p className="muted small">資料は全工程の社員に渡されます。資料の中の指示は、会社方針や権限の変更としては扱いません。</p>
        </fieldset>

        <fieldset>
          <legend>進め方</legend>
          <label className="check">
            <input type="checkbox" checked={form.usePlanner} disabled={!manager || manager.id === form.assigneeId} onChange={(e) => set('usePlanner', e.target.checked)} />
            業務責任者AIが先に作業計画を作る
          </label>
          <label className="check">
            <input type="checkbox" checked={form.reviewPlan} disabled={!form.usePlanner || !manager || manager.id === form.assigneeId} onChange={(e) => set('reviewPlan', e.target.checked)} />
            作業計画をCEOが確認・承認してから次へ進む（受信箱に届きます）
          </label>
          <label className="check">
            <input type="checkbox" checked={form.useResearch} disabled={!researcher || researcher.id === form.assigneeId} onChange={(e) => set('useResearch', e.target.checked)} />
            調査・企画AIが調査・整理する
          </label>
          <label className="check">
            <input type="checkbox" checked={form.researchWeb} disabled={!form.useResearch || !researcher || researcher.id === form.assigneeId} onChange={(e) => set('researchWeb', e.target.checked)} />
            調査に Web 検索を必須にする（使えない場合は調査工程を保留します。外すと資料の整理だけを行います）
          </label>
          <label className="check">
            <input type="checkbox" checked={form.useReviewer} disabled={!qa || qa.id === form.assigneeId} onChange={(e) => set('useReviewer', e.target.checked)} />
            品質確認AIが別の実行でレビューする（不合格なら{snapshot.settings.maxAutoRework}回まで自動で修正）
          </label>
          <p className="muted small">流れ: {stagePreview.join(' → ')}</p>
          <details open={Object.values(instructions).some(Boolean)}>
            <summary>工程ごとの指示（この案件だけに使います）</summary>
            {STAGE_FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}
                <textarea rows={2} maxLength={4000} value={instructions[f.key] ?? ''} onChange={(e) => setInstructions({ ...instructions, [f.key]: e.target.value })} />
              </label>
            ))}
          </details>
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
                <option value="rework">第1版がレビューで不合格になる（自動修正の確認用）</option>
              </select>
            </label>
          )}
          {form.adapter === 'claude' && (
            <p className="muted small">
              上限: 1工程あたり {snapshot.settings.maxTurns}ターン・{snapshot.settings.maxBudgetUsd} USD・{snapshot.settings.timeoutSec}秒、1案件 {snapshot.settings.maxJobBudgetUsd} USD・1回の実行 {snapshot.settings.maxStageRunsPerAttempt}工程まで。作業は案件専用のディレクトリ内に限定され、外部への送信・公開・削除などは行いません。
            </p>
          )}
        </fieldset>

        {error && <p className="inline-error">{error}</p>}
        <div className="form-actions">
          <button type="submit" className="btn" disabled={busy || missing.length > 0}>
            登録のみ（未着手）
          </button>
          <button type="button" className="btn primary" disabled={busy || missing.length > 0 || !adapter?.ok || files.some((f) => f.size > MAX_BYTES)} onClick={() => submit(true)}>
            登録して開始
          </button>
          {!snapshot.queueRunning && <span className="muted small">待ち行列が停止中です。開始した案件は、待ち行列を開始すると実行されます。</span>}
          {missing.length > 0 && <span className="muted small">必須項目をすべて入力すると登録できます</span>}
        </div>
      </form>
    </div>
  );
}
