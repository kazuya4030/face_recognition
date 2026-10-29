// CEO の受信箱。対応が必要な事項（社員からの質問・作業計画の確認・成果物の承認・失敗と保留）を一か所に集め、
// その場で回答・承認・差し戻し・再開まで完了できるようにする。
import { useCallback, useEffect, useState } from 'react';
import { api, type InboxItem, type Snapshot } from '../api.ts';
import { Badge, DemoBadge, Empty, JobActions } from '../components.tsx';
import { useChangeSignal } from '../hooks.ts';
import { formatTime } from '../labels.ts';
import { ApprovalCard, useDeliverables } from './ApprovalsPage.tsx';
import { MaterialLink } from './materials.tsx';

const KIND: Record<InboxItem['kind'], { label: string; tone: string }> = {
  question: { label: '社員からの質問', tone: 'review' },
  plan_review: { label: '作業計画の確認', tone: 'review' },
  approval: { label: '成果物の承認', tone: 'review' },
  failure: { label: '失敗・中断', tone: 'error' },
  hold: { label: '保留', tone: 'paused' },
};

const STAGE_NAMES: Record<string, string> = { research: '調査', execute: '成果物作成', review: 'レビュー' };

function useInbox() {
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [error, setError] = useState('');
  const reload = useCallback(() => {
    api.inbox().then(setItems).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(reload, [reload]);
  useChangeSignal(reload);
  return { items, error, reload };
}

function QuestionForm({ item, onDone }: { item: InboxItem; onDone: () => void }) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const qs = item.questions ?? [];
  const ready = qs.every((q) => (answers[q.id] ?? '').trim());
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api.answer(item.jobId, { answers });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="form">
      {qs.map((q) => (
        <label key={q.id}>
          <span>
            <Badge tone="review">質問#{q.id}</Badge> {q.text}
          </span>
          <textarea rows={2} maxLength={4000} value={answers[q.id] ?? ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} placeholder="回答（この案件にだけ記録されます。会社共通の方針にはなりません）" />
        </label>
      ))}
      {error && <p className="inline-error">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn primary" disabled={!ready || busy} onClick={submit}>
          {busy ? '送信中…' : '回答して再開'}
        </button>
        <span className="muted small">回答すると、質問が出た工程を回答つきでやり直します。</span>
      </div>
    </div>
  );
}

function PlanReview({ item, onDone }: { item: InboxItem; onDone: () => void }) {
  const stages = item.job.stages.filter((s) => s.kind !== 'plan').map((s) => s.kind);
  const [instr, setInstr] = useState<Record<string, string>>(() => ({ ...(item.stageInstructions ?? {}) }));
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const run = async (kind: 'approve' | 'revise') => {
    setBusy(kind);
    setError('');
    try {
      if (kind === 'approve') await api.approvePlan(item.jobId, { stageInstructions: instr, comment });
      else await api.revisePlan(item.jobId, comment);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  return (
    <div className="form">
      <details open>
        <summary>ハルの作業計画（outputs/plan.md）</summary>
        {item.plan ? <pre className="file-content">{item.plan.content}</pre> : <p className="inline-error">作業計画の保存版が見つかりません。</p>}
      </details>
      <fieldset>
        <legend>工程ごとの指示（この案件だけに使います。修正して承認できます）</legend>
        {stages.map((k) => (
          <label key={k}>
            {STAGE_NAMES[k] ?? k}
            <textarea rows={3} maxLength={4000} value={instr[k] ?? ''} onChange={(e) => setInstr({ ...instr, [k]: e.target.value })} />
          </label>
        ))}
      </fieldset>
      <label>
        コメント（承認時は任意、作り直しの依頼では必須）
        <textarea rows={2} maxLength={4000} value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      <p className="muted small">計画を承認しても、外部への送信・公開・契約・支払いの権限は増えません。</p>
      {error && <p className="inline-error">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn primary" disabled={busy !== ''} onClick={() => run('approve')}>
          {busy === 'approve' ? '送信中…' : '計画を承認して次へ'}
        </button>
        <button type="button" className="btn" disabled={busy !== '' || !comment.trim()} title={comment.trim() ? '' : '修正点を書いてください'} onClick={() => run('revise')}>
          作り直しを依頼
        </button>
      </div>
    </div>
  );
}

export function InboxPage({ snapshot }: { snapshot: Snapshot }) {
  const { items, error, reload } = useInbox();
  const deliverables = useDeliverables();
  const [filter, setFilter] = useState<'all' | 'real' | 'demo'>('all');
  if (error) return <p className="inline-error">{error}</p>;
  if (!items) return <p className="muted">読み込み中…</p>;
  const visible = items.filter((x) => filter === 'all' || (filter === 'demo') === (x.adapter === 'demo'));
  return (
    <div className="page narrow inbox">
      <div className="page-head">
        <h1>受信箱</h1>
        <label className="inline">
          表示
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="受信箱の表示">
            <option value="all">すべて</option>
            <option value="real">実案件</option>
            <option value="demo">デモ案件</option>
          </select>
        </label>
      </div>
      <p className="muted">CEOが判断・回答する事項だけが届きます。ここで回答・承認・差し戻し・再開まで行えます。</p>
      {visible.length === 0 && <Empty>対応が必要な事項はありません。</Empty>}
      {visible.map((item) => {
        const k = KIND[item.kind];
        const approval = item.approvalId ? snapshot.approvals.find((a) => a.id === item.approvalId) : undefined;
        return (
          <article key={item.key} className="panel inbox-item" data-testid={`inbox-${item.kind}-${item.jobId}`}>
            <header className="inbox-head">
              <Badge tone={k.tone}>{k.label}</Badge>
              <a href={`#/jobs/${item.jobId}`} className="strong">
                #{item.jobId} {item.jobTitle}
              </a>
              {item.adapter === 'demo' ? <DemoBadge /> : <Badge tone="real">実案件</Badge>}
              <span className="muted small">
                担当: {item.employeeName}・{formatTime(item.at)}
              </span>
            </header>
            <dl className="kv">
              <dt>確認理由</dt>
              <dd>{item.reason}</dd>
              <dt>必要な判断</dt>
              <dd>{item.decision}</dd>
              {item.materials.length > 0 && (
                <>
                  <dt>関連資料</dt>
                  <dd>
                    {item.materials.map((m) => (
                      <MaterialLink key={`${m.type}-${m.id}`} m={m} />
                    ))}
                  </dd>
                </>
              )}
            </dl>
            {item.kind === 'question' && <QuestionForm item={item} onDone={reload} />}
            {item.kind === 'plan_review' && <PlanReview item={item} onDone={reload} />}
            {item.kind === 'approval' && approval && (
              <ApprovalCard approval={approval} requesterName={item.employeeName} deliverables={deliverables} onDone={reload} />
            )}
            {(item.kind === 'failure' || item.kind === 'hold') && <JobActions job={item.job} onDone={reload} />}
          </article>
        );
      })}
    </div>
  );
}
