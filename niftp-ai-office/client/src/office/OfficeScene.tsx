// NIFTP本社のアイソメトリック表示。家具・人物を奥から順に描き、最前面に名札・通知・演出を重ねる。
// 演出（吹き出し・書類の受け渡し）は実際に記録された出来事が届いたときだけ表示し、操作を妨げない（pointer-events なし）。
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { EmployeeView, OfficeEvent, Snapshot } from '../api.ts';
import { appearanceOf, CEO_APPEARANCE } from './appearance.ts';
import { Character } from './Character.tsx';
import { EmployeeDesk, FurniturePiece } from './Furniture.tsx';
import { depthOf, iso, VIEW } from './iso.ts';
import { CEO_SEAT, DESK_SLOTS, FURNITURE, type Target } from './layout.ts';
import { Hit, Room, SceneDefs } from './Room.tsx';

const SEAT_LIFT = 14; // 座面の高さ（px）
const HEAD_TOP = 58; // 座面から頭頂まで（px）

type Effect =
  | { id: string; kind: 'bubble'; at: [number, number]; label: string; tone: string; target: string }
  | { id: string; kind: 'fly'; from: [number, number]; to: [number, number]; tone: string };

const TONE: Partial<Record<OfficeEvent['type'], string>> = {
  work_started: 'working',
  handoff: 'review',
  stage_done: 'done',
  deliverable_saved: 'done',
  approval_requested: 'review',
  approved: 'done',
  rejected: 'error',
  error: 'error',
  cancelled: 'cancelled',
};

const STATUS_CHIP: Record<EmployeeView['status'], { icon: string; tone: string } | null> = {
  idle: null,
  working: { icon: '', tone: 'working' },
  waiting_review: { icon: '!', tone: 'review' },
  done: { icon: '✓', tone: 'done' },
  error: { icon: '×', tone: 'error' },
};

const textWidth = (s: string, size: number) => [...s].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2000 ? size : size * 0.6), 0);

type Props = {
  snapshot: Snapshot;
  selected: string | null;
  onSelectEmployee: (id: string) => void;
  onTarget: (t: Target) => void;
  unseenCount: number;
  onOpenNewest: () => void;
  completedCount: number;
  deliverableCount: number;
  fresh: OfficeEvent[];
  consume: (keys: string[]) => void;
  reducedMotion: boolean;
  now: Date;
};

export function OfficeScene(props: Props) {
  const { snapshot, selected, onSelectEmployee, onTarget, unseenCount, onOpenNewest, fresh, consume, reducedMotion } = props;
  const pending = snapshot.approvals.filter((a) => a.status === 'pending').length;
  const counts = useMemo(() => {
    const c = { todo: 0, doing: 0, review: 0, done: 0, error: 0 };
    for (const j of snapshot.jobs) c[j.column] += 1;
    return c;
  }, [snapshot.jobs]);

  const seats = useMemo(() => {
    const m = new Map<string, { slot: (typeof DESK_SLOTS)[number]; e: EmployeeView; index: number }>();
    [...snapshot.employees]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .forEach((e, i) => {
        if (DESK_SLOTS[i]) m.set(e.id, { slot: DESK_SLOTS[i], e, index: i });
      });
    return m;
  }, [snapshot.employees]);

  const headOf = (id: string | null): [number, number] | null => {
    if (id === 'ceo' || id == null) {
      const [x, y] = iso(CEO_SEAT.x, CEO_SEAT.y, 0);
      return [x, y - SEAT_LIFT - HEAD_TOP];
    }
    if (id === 'shelf') return iso(0.45, 6.7, 2.75);
    const s = seats.get(id);
    if (!s) return null;
    const [x, y] = iso(s.slot.seat.x, s.slot.seat.y, 0);
    return [x, y - SEAT_LIFT - HEAD_TOP];
  };
  const ceoDesk = iso(2.2, 3.05, 1.0);

  // ---- 実際の出来事から演出を作る ----
  const [effects, setEffects] = useState<Effect[]>([]);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  useEffect(() => {
    if (fresh.length === 0) return;
    consume(fresh.map((e) => e.key));
    fresh.forEach((ev, i) => {
      const delay = i * 450;
      const tone = TONE[ev.type] ?? 'idle';
      const add: Effect[] = [];
      const from = headOf(ev.employeeId);
      const short = ev.type === 'stage_done' ? '完了' : ev.type === 'work_started' ? '作業開始' : ev.type === 'deliverable_saved' ? '成果物を保存' : ev.label;
      if (ev.type === 'approved' || ev.type === 'rejected') {
        add.push({ id: `${ev.key}:b`, kind: 'bubble', at: headOf('ceo')!, label: ev.label, tone, target: 'ceo' });
        const to = headOf(ev.toEmployeeId);
        if (to && ev.type === 'rejected') add.push({ id: `${ev.key}:f`, kind: 'fly', from: ceoDesk, to, tone });
      } else if (from) {
        if (ev.type !== 'deliverable_saved') add.push({ id: `${ev.key}:b`, kind: 'bubble', at: from, label: short, tone, target: ev.employeeId ?? '' });
        const to = ev.toEmployeeId === 'ceo' ? ceoDesk : headOf(ev.toEmployeeId);
        if (to && (ev.type === 'handoff' || ev.type === 'deliverable_saved' || ev.type === 'approval_requested')) {
          add.push({ id: `${ev.key}:f`, kind: 'fly', from: [from[0], from[1] + 30], to, tone });
        }
      }
      timers.current.push(
        window.setTimeout(() => {
          setEffects((cur) => {
            // 同じ人の吹き出しは最新の1つだけ残す
            const targets = new Set(add.filter((a) => a.kind === 'bubble').map((a) => (a as { target: string }).target));
            return [...cur.filter((c) => c.kind !== 'bubble' || !targets.has(c.target)), ...add];
          });
          timers.current.push(window.setTimeout(() => setEffects((cur) => cur.filter((c) => !add.some((a) => a.id === c.id))), 3200));
        }, delay),
      );
    });
  }, [fresh]);

  // ---- 奥から手前へ並べた描画リスト ----
  const layers: { key: number; node: ReactNode }[] = [];
  for (const it of FURNITURE) {
    if (it.kind === 'rug' || it.kind === 'doormat') continue;
    const piece = <FurniturePiece it={it} pending={pending} />;
    layers.push({
      key: depthOf(it),
      node: it.target ? (
        <Hit key={it.id} label={TARGET_LABEL[it.target]} onClick={() => onTarget(it.target!)} testId={`furniture-${it.id}`}>
          {piece}
        </Hit>
      ) : (
        <g key={it.id}>{piece}</g>
      ),
    });
  }

  // CEO
  {
    const [sx, sy] = iso(CEO_SEAT.x, CEO_SEAT.y, 0);
    layers.push({
      key: CEO_SEAT.x + CEO_SEAT.y + 0.4,
      node: (
        <Hit key="ceo-person" label={`CEO 植村和也（判断待ち${pending}件）`} onClick={() => onTarget('ceo')} testId="ceo">
          <g transform={`translate(${sx} ${sy - SEAT_LIFT})`}>
            <Character look={CEO_APPEARANCE} outfitColor="#2b3348" blinkDelay={1.3} />
          </g>
        </Hit>
      ),
    });
  }

  for (const { slot, e, index } of seats.values()) {
    const look = appearanceOf(e.id);
    const working = e.status === 'working';
    const [sx, sy] = iso(slot.seat.x, slot.seat.y, 0);
    const chair = { x: slot.seat.x - 0.38, y: slot.seat.y - 0.32, w: 0.76, d: 0.66 };
    const label = `${e.name}（${e.roleTitle}）: ${STATUS_LABEL[e.status]}`;
    const isSel = selected === e.id;
    layers.push({
      key: depthOf(chair) + 0.01,
      node: (
        <Hit key={`person-${e.id}`} label={label} onClick={() => onSelectEmployee(e.id)} testId={`employee-${e.id}`}>
          <g className={`person status-${e.status} ${isSel ? 'selected' : ''}`} data-employee={e.id} data-status={e.status}>
            {isSel && <ellipse cx={sx} cy={sy} rx={34} ry={17} className="select-ring" />}
            <FurniturePiece it={{ id: `chair-${e.id}`, kind: 'chair', ...chair, h: 0.5, color: '#2f3b57' }} pending={0} />
            <g transform={`translate(${sx} ${sy - SEAT_LIFT})`}>
              <ellipse cx={0} cy={-26} rx={24} ry={34} fill="transparent" />
              <Character look={look} outfitColor={e.color} working={working} blinkDelay={index * 1.7} />
            </g>
          </g>
        </Hit>
      ),
    });
    layers.push({
      key: depthOf(slot.desk),
      node: (
        <Hit key={`desk-${e.id}`} label={label} onClick={() => onSelectEmployee(e.id)}>
          <g className={`desk-group status-${e.status}`}>
            <EmployeeDesk desk={slot.desk} top={look.deskTop} props={look.deskProps} working={working} />
          </g>
        </Hit>
      ),
    });
  }
  layers.sort((a, b) => a.key - b.key);

  const floorItems = FURNITURE.filter((it) => it.kind === 'rug' || it.kind === 'doormat');

  return (
    <svg className="iso-scene" viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} role="group" aria-label="NIFTP本社のオフィス">
      <SceneDefs />
      <Room now={props.now} counts={counts} completedCount={props.completedCount} deliverableCount={props.deliverableCount} onTarget={onTarget} />
      {floorItems.map((it) =>
        it.target ? (
          <Hit key={it.id} label={TARGET_LABEL[it.target]} onClick={() => onTarget(it.target!)}>
            <FurniturePiece it={it} pending={0} />
          </Hit>
        ) : (
          <g key={it.id}>
            <FurniturePiece it={it} pending={0} />
          </g>
        ),
      )}
      {layers.map((l) => l.node)}

      {/* ---- 最前面: 名札・通知・演出 ---- */}
      <g className="overlay">
        {[...seats.values()].map(({ slot, e }) => {
          const [sx, sy] = iso(slot.seat.x, slot.seat.y, 0);
          const top = sy - SEAT_LIFT - HEAD_TOP;
          const chip = STATUS_CHIP[e.status];
          const job = e.currentJob ? snapshot.jobs.find((j) => j.id === e.currentJob!.id) : undefined;
          const progress = e.status === 'working' && job ? `${job.currentStageIndex + 1}/${job.stages.length}` : '';
          const nameW = textWidth(e.name, 10) + 20;
          return (
            <g key={`tag-${e.id}`} className="name-tag" transform={`translate(${sx} ${top - 4})`} onClick={() => onSelectEmployee(e.id)}>
              <rect x={-nameW / 2} y={-13} width={nameW} height={15} rx={7.5} className={`tag-bg ${selected === e.id ? 'is-selected' : ''}`} />
              <circle cx={-nameW / 2 + 8} cy={-5.5} r={3} className={`dot tone-fill-${chip?.tone ?? 'idle'}`} />
              <text x={-nameW / 2 + 14} y={-2} className="tag-text">
                {e.name}
              </text>
              {chip && (
                <g transform={`translate(${nameW / 2 + 2} -12)`}>
                  {e.status === 'working' ? (
                    <g className="chip">
                      <rect x={0} y={0} width={34} height={13} rx={6.5} className="tone-fill-working" />
                      <text x={17} y={9.6} textAnchor="middle" className="chip-text">
                        {progress || '作業中'}
                      </text>
                    </g>
                  ) : (
                    <g className="chip">
                      <circle cx={6.5} cy={6.5} r={6.5} className={`tone-fill-${chip.tone}`} />
                      <text x={6.5} y={10} textAnchor="middle" className="chip-text">
                        {chip.icon}
                      </text>
                    </g>
                  )}
                </g>
              )}
            </g>
          );
        })}

        {(() => {
          const [cx, cy] = iso(CEO_SEAT.x, CEO_SEAT.y, 0);
          return (
            <g className="name-tag" transform={`translate(${cx} ${cy - SEAT_LIFT - HEAD_TOP - 4})`} onClick={() => onTarget('ceo')}>
              <rect x={-30} y={-13} width={60} height={15} rx={7.5} className="tag-bg ceo-tag" />
              <text x={0} y={-2} textAnchor="middle" className="tag-text">
                CEO 植村
              </text>
            </g>
          );
        })()}

        {/* 社長のデスク: 判断待ちの通知 */}
        {pending > 0 && (
          <Hit label={`CEOの判断待ち ${pending}件を確認する`} onClick={() => onTarget('ceo')} testId="ceo-notice">
            <g transform={`translate(${headOf('ceo')![0] + 36} ${headOf('ceo')![1] - 46})`}>
              <g className="notice notice-review">
                <rect x={-5} y={-5} width={104} height={36} rx={11} className="notice-halo" />
                <rect x={-2} y={-2} width={98} height={30} rx={8} className="notice-bg" />
                <circle cx={14} cy={13} r={9} className="tone-fill-review" />
                <text x={14} y={17.5} textAnchor="middle" className="chip-text big">
                  {pending}
                </text>
                <text x={28} y={11} className="notice-title">
                  判断待ち
                </text>
                <text x={28} y={23} className="notice-sub">
                  クリックで確認
                </text>
                <path d="M 10 28 L 4 38 L 20 28 Z" className="notice-bg" />
              </g>
            </g>
          </Hit>
        )}

        {/* 資料棚: 新着成果物 */}
        {unseenCount > 0 && (
          <Hit label={`新しい成果物 ${unseenCount}件（最新を開く）`} onClick={onOpenNewest} testId="shelf-notice">
            <g transform={`translate(${iso(0.45, 6.7, 2.75)[0] + 6} ${iso(0.45, 6.7, 2.75)[1] - 30})`}>
              <g className="notice notice-done">
                <rect x={-5} y={-5} width={100} height={32} rx={11} className="notice-halo" />
                <rect x={-2} y={-2} width={94} height={26} rx={8} className="notice-bg" />
                <text x={8} y={15.5} className="notice-title">
                  新着成果物 {unseenCount}
                </text>
                <path d="M 8 24 L 2 34 L 18 24 Z" className="notice-bg" />
              </g>
            </g>
          </Hit>
        )}

        {/* 会議室の案内 */}
        <Hit label="会議室で仕事を依頼する" onClick={() => onTarget('meeting')} testId="meeting-sign">
          <g transform={`translate(${iso(13.9, 4.4, 2.2)[0] - 46} ${iso(13.9, 4.4, 2.2)[1]})`} className="sign">
            <rect x={0} y={0} width={92} height={20} rx={10} className="sign-bg" />
            <text x={46} y={14} textAnchor="middle" className="sign-text">
              会議室・依頼する
            </text>
          </g>
        </Hit>

        {effects.map((fx) =>
          fx.kind === 'bubble' ? (
            <g key={fx.id} className={`fx-bubble tone-${fx.tone}`} transform={`translate(${fx.at[0]} ${fx.at[1] - 30})`}>
              <rect x={-(textWidth(fx.label, 10) + 16) / 2} y={-16} width={textWidth(fx.label, 10) + 16} height={18} rx={9} className="bubble-bg" />
              <path d="M -4 2 L 0 7 L 4 2 Z" className="bubble-bg" />
              <text x={0} y={-3.5} textAnchor="middle" className="bubble-text">
                {fx.label}
              </text>
            </g>
          ) : reducedMotion ? null : (
            <Flight key={fx.id} from={fx.from} to={fx.to} tone={fx.tone} />
          ),
        )}
      </g>
    </svg>
  );
}

/** 書類が担当者間を移動する演出（CSS の offset-path で経路に沿って動かす）。 */
function Flight({ from, to, tone }: { from: [number, number]; to: [number, number]; tone: string }) {
  const path = `M ${from[0].toFixed(1)} ${from[1].toFixed(1)} Q ${((from[0] + to[0]) / 2).toFixed(1)} ${(Math.min(from[1], to[1]) - 70).toFixed(1)} ${to[0].toFixed(1)} ${to[1].toFixed(1)}`;
  return (
    <g className={`fx-doc tone-${tone}`} style={{ offsetPath: `path('${path}')` }}>
      <rect x={-6} y={-8} width={12} height={15} rx={1.5} fill="#fffdf6" stroke="#8a6340" strokeWidth={0.8} />
      <path d="M -3 -4 L 3 -4 M -3 -1 L 3 -1 M -3 2 L 1 2" stroke="#b0a58f" strokeWidth={0.8} />
    </g>
  );
}

const TARGET_LABEL: Record<Target, string> = {
  ceo: 'CEOのデスク（承認・判断待ち）',
  shelf: '資料棚（成果物）',
  meeting: '会議室（仕事を依頼する）',
  whiteboard: 'ホワイトボード（案件ボード）',
  achievements: '実績ボード',
  entrance: 'エントランス（会社情報）',
};

const STATUS_LABEL: Record<EmployeeView['status'], string> = {
  idle: '待機中',
  working: '作業中',
  waiting_review: '確認待ち',
  done: '完了',
  error: 'エラー',
};
