// NIFTP本社のアイソメトリック表示。家具・人物を奥から順に描き、最前面に名札・通知・演出を重ねる。
// 演出（吹き出し・書類の受け渡し）は実際に記録された出来事が届いたときだけ表示し、操作を妨げない（pointer-events なし）。
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { EmployeeView, OfficeEvent, Snapshot } from '../api.ts';
import { appearanceOf, CEO_APPEARANCE, type Appearance } from './appearance.ts';
import { Character } from './Character.tsx';
import { BenchSegment, ChairBack, ChairBase, FurniturePiece, type BenchSide } from './Furniture.tsx';
import { depthOf, iso, VIEW } from './iso.ts';
import { BENCH, CEO_SEAT, EMPLOYEE_SEATS, FURNITURE, type Seat, type Target } from './layout.ts';
import { Hit, Room, SceneDefs } from './Room.tsx';

const SEAT_LIFT = 13; // 座面の高さ（px）
const HEAD_TOP = 58; // 座面から頭頂まで（px）
const SEG_W = BENCH.w / BENCH.segments;
const segOf = (s: Seat) => Math.min(BENCH.segments - 1, Math.floor((s.x - BENCH.x) / SEG_W));

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

const STATUS_LABEL: Record<EmployeeView['status'], string> = {
  idle: '待機中',
  working: '作業中',
  waiting_review: '確認待ち',
  done: '完了',
  error: 'エラー',
};

const TARGET_LABEL: Record<Target, string> = {
  ceo: 'CEOの席（承認待ちを確認する）',
  shelf: '資料棚（成果物）',
  meeting: 'プロジェクトルーム（仕事を依頼する）',
  whiteboard: 'ホワイトボード（案件ボード）',
  achievements: '実績ボード',
  entrance: 'エントランス（会社情報）',
};

const textWidth = (s: string, size: number) => [...s].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2000 ? size : size * 0.62), 0);

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

interface Occupant {
  key: string;
  seat: Seat;
  look: Appearance;
  working: boolean;
  accent: string;
  employee: EmployeeView | null; // null は CEO
}

export function OfficeScene(props: Props) {
  const { snapshot, selected, onSelectEmployee, onTarget, unseenCount, onOpenNewest, fresh, consume, reducedMotion } = props;
  const pending = snapshot.approvals.filter((a) => a.status === 'pending').length;
  const counts = useMemo(() => {
    const c = { todo: 0, doing: 0, review: 0, done: 0, error: 0 };
    for (const j of snapshot.jobs) c[j.column] += 1;
    return c;
  }, [snapshot.jobs]);

  const occupants = useMemo(() => {
    const list: Occupant[] = [...snapshot.employees]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .slice(0, EMPLOYEE_SEATS.length)
      .map((e, i) => ({ key: e.id, seat: EMPLOYEE_SEATS[i], look: appearanceOf(e.id), working: e.status === 'working', accent: e.color, employee: e }));
    list.push({ key: 'ceo', seat: CEO_SEAT, look: CEO_APPEARANCE, working: false, accent: '#f2f0e7', employee: null });
    return list;
  }, [snapshot.employees]);

  const headOf = (id: string | null): [number, number] | null => {
    if (id === 'shelf') return iso(0.35, 8.9, 2.6);
    const o = occupants.find((x) => x.key === (id ?? 'ceo'));
    if (!o) return null;
    const [x, y] = iso(o.seat.x, o.seat.y, 0);
    return [x, y - SEAT_LIFT - HEAD_TOP];
  };
  const ceoDesk = iso(CEO_SEAT.x, BENCH.y + 0.3, BENCH.h + 0.2);

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
      const short = ev.type === 'stage_done' ? '完了' : ev.type === 'work_started' ? '作業開始' : ev.label;
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
  const floorKinds = new Set(['floor-patch', 'rug', 'doormat']);
  for (const it of FURNITURE) {
    if (floorKinds.has(it.kind)) continue;
    const piece = <FurniturePiece it={it} />;
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

  // 共同デスク（3区画）
  const sides = new Map<string, BenchSide>();
  for (const o of occupants) sides.set(`${o.seat.facing}-${segOf(o.seat)}`, { working: o.working, props: o.look.deskProps, accent: o.accent });
  for (let i = 0; i < BENCH.segments; i++) {
    layers.push({
      key: BENCH.x + SEG_W * (i + 0.5) + BENCH.y + BENCH.d / 2,
      node: <BenchSegment key={`bench-${i}`} index={i} far={sides.get(`front-${i}`) ?? null} near={sides.get(`back-${i}`) ?? null} />,
    });
  }

  // 空いている席には椅子だけを置く
  const allSeats = [...EMPLOYEE_SEATS, CEO_SEAT];
  for (const seat of allSeats) {
    if (occupants.some((o) => o.seat === seat)) continue;
    layers.push({
      key: seat.x + seat.y,
      node: (
        <g key={`empty-${seat.x}-${seat.y}`}>
          {seat.facing === 'front' && <ChairBack x={seat.x} y={seat.y} facing="front" />}
          <ChairBase x={seat.x} y={seat.y} />
          {seat.facing === 'back' && <ChairBack x={seat.x} y={seat.y} facing="back" />}
        </g>
      ),
    });
  }

  for (const o of occupants) {
    const [sx, sy] = iso(o.seat.x, o.seat.y, 0);
    const e = o.employee;
    const isCeo = e == null;
    const label = isCeo ? `CEO 植村和也（承認待ち${pending}件）` : `${e.name}（${e.roleTitle}）: ${STATUS_LABEL[e.status]}`;
    const onClick = () => (isCeo ? onTarget('ceo') : onSelectEmployee(e.id));
    const isSel = !isCeo && selected === e.id;
    const base = o.seat.x + o.seat.y;
    layers.push({
      key: base - 0.02,
      node: (
        <g key={`chair-${o.key}`}>
          {isSel && <ellipse cx={sx} cy={sy} rx={30} ry={15} className="select-ring" />}
          {o.seat.facing === 'front' && <ChairBack x={o.seat.x} y={o.seat.y} facing="front" />}
          <ChairBase x={o.seat.x} y={o.seat.y} />
        </g>
      ),
    });
    layers.push({
      key: base,
      node: (
        <Hit key={`person-${o.key}`} label={label} onClick={onClick} testId={isCeo ? 'ceo' : `employee-${e.id}`}>
          <g className={`person status-${isCeo ? 'ceo' : e.status}`} data-employee={isCeo ? undefined : e.id} data-status={isCeo ? undefined : e.status}>
            <g transform={`translate(${sx} ${sy - SEAT_LIFT})`}>
              <ellipse cx={0} cy={-26} rx={22} ry={34} fill="transparent" />
              <Character look={o.look} facing={o.seat.facing} working={o.working} blinkDelay={(o.seat.x * 0.7) % 5} />
            </g>
          </g>
        </Hit>
      ),
    });
    if (o.seat.facing === 'back') {
      layers.push({ key: base + 0.02, node: <ChairBack key={`back-${o.key}`} x={o.seat.x} y={o.seat.y} facing="back" /> });
    }
  }
  layers.sort((a, b) => a.key - b.key);

  const floorItems = FURNITURE.filter((it) => floorKinds.has(it.kind));
  const ceoHead = headOf('ceo')!;
  const shelfTop = iso(0.35, 8.9, 2.6);

  return (
    <svg className="iso-scene" viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} role="group" aria-label="NIFTP本社のオフィス">
      <SceneDefs />
      <Room now={props.now} counts={counts} completedCount={props.completedCount} deliverableCount={props.deliverableCount} onTarget={onTarget} />
      {floorItems.map((it) =>
        it.target ? (
          <Hit key={it.id} label={TARGET_LABEL[it.target]} onClick={() => onTarget(it.target!)}>
            <FurniturePiece it={it} />
          </Hit>
        ) : (
          <g key={it.id}>
            <FurniturePiece it={it} />
          </g>
        ),
      )}
      {layers.map((l) => l.node)}

      {/* ---- 最前面: 名札・通知・演出 ---- */}
      <g className="overlay">
        {occupants.map((o) => {
          const [sx, sy] = iso(o.seat.x, o.seat.y, 0);
          const top = sy - SEAT_LIFT - HEAD_TOP;
          const e = o.employee;
          const name = e ? e.name : 'CEO 植村';
          const chip = e ? STATUS_CHIP[e.status] : null;
          const job = e?.currentJob ? snapshot.jobs.find((j) => j.id === e.currentJob!.id) : undefined;
          const progress = e?.status === 'working' && job ? `${job.currentStageIndex + 1}/${job.stages.length}` : '';
          const nameW = textWidth(name, 9.5) + (e ? 20 : 14);
          return (
            <g key={`tag-${o.key}`} className="name-tag" transform={`translate(${sx} ${top - 4})`} onClick={() => (e ? onSelectEmployee(e.id) : onTarget('ceo'))}>
              <rect x={-nameW / 2} y={-13} width={nameW} height={15} rx={4} className={`tag-bg ${e && selected === e.id ? 'is-selected' : ''}`} />
              {e && <circle cx={-nameW / 2 + 7.5} cy={-5.5} r={2.8} className={`tone-fill-${chip?.tone ?? 'idle'}`} />}
              <text x={e ? -nameW / 2 + 13.5 : 0} y={-2.3} textAnchor={e ? 'start' : 'middle'} className="tag-text">
                {name}
              </text>
              {chip && (
                <g transform={`translate(${nameW / 2 + 2} -12.5)`}>
                  {e?.status === 'working' ? (
                    <g className="chip">
                      <rect x={0} y={0} width={30} height={14} rx={4} className="tone-fill-working" />
                      <text x={15} y={10} textAnchor="middle" className="chip-text">
                        {progress || '作業中'}
                      </text>
                    </g>
                  ) : (
                    <g className="chip">
                      <rect x={0} y={0} width={14} height={14} rx={4} className={`tone-fill-${chip.tone}`} />
                      <text x={7} y={10.5} textAnchor="middle" className={`chip-text ${chip.tone === 'review' ? 'dark' : ''}`}>
                        {chip.icon}
                      </text>
                    </g>
                  )}
                </g>
              )}
            </g>
          );
        })}

        {/* CEOの席：承認待ちの通知（クリックで承認へ） */}
        {pending > 0 && (
          <Hit label={`CEOの承認待ち ${pending}件を確認する`} onClick={() => onTarget('ceo')} testId="ceo-notice">
            <g transform={`translate(${ceoHead[0] + 26} ${ceoHead[1] + 14})`}>
              <g className="notice notice-review">
                <rect x={-5} y={-5} width={96} height={34} rx={9} className="notice-halo" />
                <path d="M 0 8 L -9 13 L 0 18 Z" className="notice-bg" />
                <rect x={-2} y={-2} width={90} height={28} rx={7} className="notice-bg" />
                <rect x={4} y={4} width={17} height={17} rx={4} className="tone-fill-review" />
                <text x={12.5} y={16.5} textAnchor="middle" className="chip-text big dark">
                  {pending}
                </text>
                <text x={27} y={11} className="notice-title">
                  承認待ち
                </text>
                <text x={27} y={21.5} className="notice-sub">
                  クリックで確認
                </text>
              </g>
            </g>
          </Hit>
        )}

        {/* 資料棚：新着成果物 */}
        {unseenCount > 0 && (
          <Hit label={`新しい成果物 ${unseenCount}件（最新を開く）`} onClick={onOpenNewest} testId="shelf-notice">
            <g transform={`translate(${shelfTop[0] + 8} ${shelfTop[1] - 34})`}>
              <g className="notice notice-new">
                <rect x={-5} y={-5} width={96} height={30} rx={9} className="notice-halo" />
                <rect x={-2} y={-2} width={90} height={24} rx={7} className="notice-bg" />
                <text x={7} y={14} className="notice-title">
                  新着成果物 {unseenCount}
                </text>
                <path d="M 6 22 L 0 32 L 16 22 Z" className="notice-bg" />
              </g>
            </g>
          </Hit>
        )}

        {/* プロジェクトルームの案内 */}
        <Hit label="プロジェクトルームで仕事を依頼する" onClick={() => onTarget('meeting')} testId="meeting-sign">
          <g transform={`translate(${iso(13.9, 4.4, 2.3)[0] - 50} ${iso(13.9, 4.4, 2.3)[1]})`} className="sign">
            <rect x={0} y={0} width={100} height={19} rx={5} className="sign-bg" />
            <text x={50} y={13} textAnchor="middle" className="sign-text">
              プロジェクトルーム
            </text>
          </g>
        </Hit>

        {effects.map((fx) =>
          fx.kind === 'bubble' ? (
            <g key={fx.id} className={`fx-bubble tone-${fx.tone}`} transform={`translate(${fx.at[0]} ${fx.at[1] - 30})`}>
              <rect x={-(textWidth(fx.label, 9.5) + 14) / 2} y={-15} width={textWidth(fx.label, 9.5) + 14} height={17} rx={5} className="bubble-bg" />
              <path d="M -4 2 L 0 7 L 4 2 Z" className="bubble-bg" />
              <text x={0} y={-3.4} textAnchor="middle" className="bubble-text">
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
      <rect x={-6} y={-8} width={12} height={15} rx={1.5} fill="#fbfaf6" stroke="#141512" strokeWidth={0.7} />
      <path d="M -3 -4 L 3 -4 M -3 -1 L 3 -1 M -3 2 L 1 2" stroke="#a4a89d" strokeWidth={0.8} />
    </g>
  );
}
