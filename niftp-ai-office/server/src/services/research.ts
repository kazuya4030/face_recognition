// 定期研究。研究員（カイ）が、登録されたテーマを一定の間隔で 1 件ずつ研究する。
// - 初期値は無効。CEO が有効にしたときだけ動く。サーバーが動いている間だけ判定する（PC のスリープ中は進まない）。
// - 待ち行列が停止中、前回の定期研究がまだ終わっていない、確認待ちが多い、1 日の上限に達した場合は作らない。
// - 作った案件は通常の案件と同じ流れ（作業計画→調査→研究ノート→レビュー→CEO の確認）で、費用・回数の上限も同じ。
import { SEED_TEMPLATES } from '../domain/templates.ts';
import type { Job, ResearchTopic } from '../domain/types.ts';
import type { ChangeBus } from '../events.ts';
import { periodRange } from '../runner/jobRunner.ts';
import type { Repo } from '../store/repo.ts';
import { UserError } from './errors.ts';
import { text, type OfficeService } from './office.ts';

const TEMPLATE_ID = 'science-research';
const ACTIVE: Job['status'][] = ['draft', 'queued', 'running', 'paused'];

export class ResearchProgram {
  constructor(
    private readonly repo: Repo,
    private readonly office: OfficeService,
    private readonly bus: ChangeBus,
  ) {}

  private recurringJobs(): Job[] {
    return this.repo.listJobs().filter((j) => j.recurringTopicId != null);
  }

  /** 次の定期研究を作らない理由。作れるなら null。 */
  private blockReason(now: Date, ignoreSchedule: boolean): string | null {
    const s = this.repo.getSettings();
    if (!ignoreSchedule && !s.recurringEnabled) return '定期研究は無効です';
    if (!this.repo.queueRunning()) return '待ち行列が停止中です';
    if (!this.repo.getEmployee('scientist')) return '研究員（scientist）がいません';
    if (!this.repo.listTopics().some((t) => t.active)) return '有効な研究テーマがありません';
    const jobs = this.recurringJobs();
    if (jobs.some((j) => ACTIVE.includes(j.status))) return '前回の定期研究がまだ終わっていません（未着手・実行中・保留中）';
    const pending = jobs.filter((j) => j.status === 'awaiting_review').length;
    if (pending >= s.recurringMaxPending) return `CEOの確認待ちの定期研究が${pending}件あります（上限 ${s.recurringMaxPending}件）`;
    const [from, to] = periodRange('day', now);
    const today = jobs.filter((j) => j.createdAt >= from && j.createdAt < to).length;
    if (today >= s.recurringMaxPerDay) return `本日の定期研究の上限（${s.recurringMaxPerDay}件）に達しています`;
    if (!ignoreSchedule) {
      const last = jobs.map((j) => j.createdAt).sort().at(-1);
      if (last && Date.parse(last) + s.recurringIntervalHours * 3600_000 > now.getTime()) return '次の定期研究の時刻になっていません';
    }
    return null;
  }

  /** 次に研究するテーマ（まだ研究していないもの → 最後に研究してから時間がたったもの の順）。 */
  private nextTopic(): ResearchTopic | undefined {
    const lastUse = new Map<number, string>();
    for (const j of this.recurringJobs()) {
      const prev = lastUse.get(j.recurringTopicId!);
      if (!prev || j.createdAt > prev) lastUse.set(j.recurringTopicId!, j.createdAt);
    }
    return this.repo
      .listTopics()
      .filter((t) => t.active)
      .sort((a, b) => (lastUse.get(a.id) ?? '').localeCompare(lastUse.get(b.id) ?? '') || a.id - b.id)[0];
  }

  private nextDueAt(): string | null {
    const s = this.repo.getSettings();
    if (!s.recurringEnabled) return null;
    const last = this.recurringJobs().map((j) => j.createdAt).sort().at(-1);
    return last ? new Date(Date.parse(last) + s.recurringIntervalHours * 3600_000).toISOString() : new Date().toISOString();
  }

  /** 定期的に呼ばれる判定。条件がそろえば案件を 1 件作って開始する。 */
  tick(now = new Date(), opts: { ignoreSchedule?: boolean } = {}): { jobId: number | null; reason: string } {
    const reason = this.blockReason(now, opts.ignoreSchedule === true);
    if (reason) return { jobId: null, reason };
    const topic = this.nextTopic()!;
    const t = SEED_TEMPLATES.find((x) => x.id === TEMPLATE_ID)!;
    const template = this.repo.listTemplates().find((x) => x.id === TEMPLATE_ID) ?? t;
    const job = this.office.createJob(
      {
        title: `【定期研究】${topic.text}`.slice(0, 120),
        purpose: `定期研究（研究員による継続的な調査）。テーマ「${topic.text}」について、先行研究と検証できる仮説を整理する。`,
        details: `研究したいテーマ・問い:\n${topic.text}\n\n範囲: 研究員が作業計画で決める（広すぎる場合は CEO に確認）\n実験・計算の実行は行わない。安全上扱えない内容は扱わない。`,
        acceptanceCriteria: template.acceptanceCriteria,
        assigneeId: 'scientist',
        usePlanner: template.usePlanner,
        useResearch: template.useResearch,
        useReviewer: template.useReviewer,
        researchWeb: template.researchWeb,
        reviewPlan: false,
        templateId: template.id,
        stageInstructions: template.stageInstructions,
      },
      { recurringTopicId: topic.id, actor: 'system' },
    );
    this.office.applyAction(job.id, 'start', {});
    this.bus.changed(job.id);
    return { jobId: job.id, reason: `テーマ#${topic.id}「${topic.text}」の定期研究を開始しました` };
  }

  view() {
    const s = this.repo.getSettings();
    const jobs = this.recurringJobs();
    const topics = this.repo.listTopics();
    return {
      settings: {
        recurringEnabled: s.recurringEnabled,
        recurringIntervalHours: s.recurringIntervalHours,
        recurringMaxPerDay: s.recurringMaxPerDay,
        recurringMaxPending: s.recurringMaxPending,
        adapter: s.defaultAdapter,
      },
      topics: topics.map((t) => ({ ...t, jobCount: jobs.filter((j) => j.recurringTopicId === t.id).length })),
      recent: jobs.slice(0, 10).map((j) => ({ id: j.id, title: j.title, status: j.status, createdAt: j.createdAt, topicId: j.recurringTopicId })),
      nextDueAt: this.nextDueAt(),
      waitingReason: this.blockReason(new Date(), false),
    };
  }

  addTopic(body: Record<string, unknown>) {
    const t = text(body.text, 'テーマ', 300, true);
    if (this.repo.listTopics().length >= 50) throw new UserError('テーマは50件までです');
    const topic = this.repo.addTopic(t);
    this.bus.changed();
    return topic;
  }

  updateTopic(id: number, body: Record<string, unknown>) {
    if (!this.repo.listTopics().some((t) => t.id === id)) throw new UserError('テーマが見つかりません', 404);
    this.repo.updateTopic(id, {
      text: body.text == null ? undefined : text(body.text, 'テーマ', 300, true),
      active: body.active == null ? undefined : body.active === true,
    });
    this.bus.changed();
    return this.view();
  }

  /** CEO の操作で、間隔・有効/無効に関係なく今すぐ 1 件始める（他の上限は守る）。 */
  runNow() {
    const r = this.tick(new Date(), { ignoreSchedule: true });
    if (r.jobId == null) throw new UserError(`今は始められません: ${r.reason}`, 409);
    return r;
  }
}
