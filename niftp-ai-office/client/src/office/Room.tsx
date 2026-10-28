// 床・壁・窓・扉と、壁に掛かった掲示物（ロゴ、ホワイトボード、実績ボード、時計）。
// ホワイトボードと実績ボードは実際の案件の件数だけを表示する（架空の数値は出さない）。
import type { KeyboardEvent, ReactNode } from 'react';
import { ROOM, heightPx, iso, pts, wallLen, wallTransform } from './iso.ts';
import { LIGHT_POOLS, PALETTE, WALL, type Target } from './layout.ts';

export type DayPhase = 'day' | 'evening' | 'night';

export function dayPhase(d: Date): DayPhase {
  const h = d.getHours();
  if (h >= 7 && h < 16) return 'day';
  if (h >= 16 && h < 19) return 'evening';
  return 'night';
}

export function SceneDefs() {
  return (
    <defs>
      <linearGradient id="sky-day" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#9fd0ee" />
        <stop offset="1" stopColor="#e6f4fb" />
      </linearGradient>
      <linearGradient id="sky-evening" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#e98d5a" />
        <stop offset="1" stopColor="#f7d7a3" />
      </linearGradient>
      <linearGradient id="sky-night" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#141f3a" />
        <stop offset="1" stopColor="#2e4170" />
      </linearGradient>
      <linearGradient id="glass-fill" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#d6ecf5" stopOpacity="0.42" />
        <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.16" />
        <stop offset="1" stopColor="#bcdcea" stopOpacity="0.38" />
      </linearGradient>
      <linearGradient id="logo-wood" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f0d29e" />
        <stop offset="1" stopColor="#c9975c" />
      </linearGradient>
      <radialGradient id="lamp-glow">
        <stop offset="0" stopColor="#ffd38a" stopOpacity="0.55" />
        <stop offset="1" stopColor="#ffd38a" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="pool">
        <stop offset="0" stopColor="#ffffff" stopOpacity="1" />
        <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

type Counts = { todo: number; doing: number; review: number; done: number; error: number };

type Props = {
  now: Date;
  counts: Counts;
  completedCount: number;
  deliverableCount: number;
  onTarget: (t: Target) => void;
};

export function Hit({ label, onClick, children, testId }: { label: string; onClick: () => void; children: ReactNode; testId?: string }) {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };
  return (
    <g className="hit" role="button" tabIndex={0} aria-label={label} onClick={onClick} onKeyDown={onKey} data-testid={testId}>
      <title>{label}</title>
      {children}
    </g>
  );
}

const W = ROOM.w;
const D = ROOM.d;
const H = ROOM.wallH;

function WindowRight({ from, to, phase }: { from: number; to: number; phase: DayPhase }) {
  const z0 = 1.05;
  const z1 = 2.75;
  const mid = (from + to) / 2;
  return (
    <g>
      <polygon points={pts([[from - 0.08, 0, z0 - 0.08], [to + 0.08, 0, z0 - 0.08], [to + 0.08, 0, z1 + 0.08], [from - 0.08, 0, z1 + 0.08]])} fill={PALETTE.navy} />
      <polygon points={pts([[from, 0, z0], [to, 0, z1 > 0 ? z0 : z0], [to, 0, z1], [from, 0, z1]])} fill={`url(#sky-${phase})`} />
      {phase === 'night' &&
        [0.2, 0.55, 0.8].map((f, i) => {
          const [sx, sy] = iso(from + (to - from) * f, 0, z1 - 0.3 - i * 0.25);
          return <circle key={f} cx={sx} cy={sy} r={0.9} fill="#fff" opacity={0.8} />;
        })}
      {phase !== 'night' && <polygon points={pts([[from + 0.2, 0, z0 + 0.15], [from + 0.9, 0, z0 + 0.15], [from + 0.5, 0, z1 - 0.2], [from + 0.2, 0, z1 - 0.2]])} fill="#ffffff" opacity={0.25} />}
      <polygon points={pts([[mid - 0.03, 0, z0], [mid + 0.03, 0, z0], [mid + 0.03, 0, z1], [mid - 0.03, 0, z1]])} fill={PALETTE.navy} />
      <polygon points={pts([[from - 0.12, 0, z0 - 0.08], [to + 0.12, 0, z0 - 0.08], [to + 0.12, 0.18, z0 - 0.08], [from - 0.12, 0.18, z0 - 0.08]])} fill="#e9dcc5" />
    </g>
  );
}

function WindowLeft({ from, to, phase }: { from: number; to: number; phase: DayPhase }) {
  const z0 = 1.05;
  const z1 = 2.75;
  const mid = (from + to) / 2;
  return (
    <g>
      <polygon points={pts([[0, from - 0.08, z0 - 0.08], [0, to + 0.08, z0 - 0.08], [0, to + 0.08, z1 + 0.08], [0, from - 0.08, z1 + 0.08]])} fill={PALETTE.navy} />
      <polygon points={pts([[0, from, z0], [0, to, z0], [0, to, z1], [0, from, z1]])} fill={`url(#sky-${phase})`} />
      <polygon points={pts([[0, mid - 0.03, z0], [0, mid + 0.03, z0], [0, mid + 0.03, z1], [0, mid - 0.03, z1]])} fill={PALETTE.navy} />
      <polygon points={pts([[0, from - 0.12, z0 - 0.08], [0, to + 0.12, z0 - 0.08], [0.18, to + 0.12, z0 - 0.08], [0.18, from - 0.12, z0 - 0.08]])} fill="#e9dcc5" />
    </g>
  );
}

function Clock({ now }: { now: Date }) {
  const { at, z } = WALL.clock;
  const m = now.getMinutes();
  const h = (now.getHours() % 12) + m / 60;
  return (
    <g transform={wallTransform('back-right', at, z)}>
      <circle cx={0} cy={0} r={11} fill="#fffaf2" stroke={PALETTE.navy} strokeWidth={2.2} />
      <path d={`M 0 0 L ${6 * Math.sin((h / 12) * 2 * Math.PI)} ${-6 * Math.cos((h / 12) * 2 * Math.PI)}`} stroke="#2a2a2a" strokeWidth={1.8} strokeLinecap="round" />
      <path d={`M 0 0 L ${8.5 * Math.sin((m / 60) * 2 * Math.PI)} ${-8.5 * Math.cos((m / 60) * 2 * Math.PI)}`} stroke="#2a2a2a" strokeWidth={1.1} strokeLinecap="round" />
      <circle cx={0} cy={0} r={1.2} fill="#c2553b" />
    </g>
  );
}

export function Room({ now, counts, completedCount, deliverableCount, onTarget }: Props) {
  const phase = dayPhase(now);
  const plankLines = Array.from({ length: D * 2 - 1 }, (_, i) => (i + 1) / 2);
  const wb = WALL.whiteboard;
  const ach = WALL.achievements;
  const logo = WALL.logo;
  const tv = WALL.tv;
  const door = WALL.door;
  const rows: [string, number, string][] = [
    ['未着手', counts.todo, '#8a8378'],
    ['作業中', counts.doing, '#2f6fae'],
    ['確認待ち', counts.review, '#b57d12'],
    ['完了', counts.done, '#3f8a4f'],
    ['エラー', counts.error, '#b4483b'],
  ];
  const maxCount = Math.max(1, ...rows.map((r) => r[1]));
  const cards = Math.min(completedCount, 8);

  return (
    <g className="room">
      {/* 床の厚み（ドールハウスのような断面） */}
      <polygon points={pts([[0, D, 0], [W, D, 0], [W, D, -0.45], [0, D, -0.45]])} fill="#7a5532" />
      <polygon points={pts([[W, 0, 0], [W, D, 0], [W, D, -0.45], [W, 0, -0.45]])} fill="#5e3f22" />
      <polygon points={pts([[0, D, -0.45], [W, D, -0.45], [W, D, -0.55], [0, D, -0.55]])} fill={PALETTE.navy} />
      <polygon points={pts([[W, 0, -0.45], [W, D, -0.45], [W, D, -0.55], [W, 0, -0.55]])} fill={PALETTE.navyDeep} />
      <polygon points={pts([[0, 0, 0], [W, 0, 0], [W, D, 0], [0, D, 0]])} fill="#d7b68a" />
      {plankLines.map((y) => (
        <polyline key={y} points={pts([[0, y, 0], [W, y, 0]])} stroke="#9b7148" strokeOpacity={0.16} strokeWidth={0.8} />
      ))}

      {/* 壁 */}
      <polygon points={pts([[0, 0, 0], [0, D, 0], [0, D, H], [0, 0, H]])} fill="#e9dcc7" />
      <polygon points={pts([[0, 0, 0], [W, 0, 0], [W, 0, H], [0, 0, H]])} fill={PALETTE.wall} />
      <polygon points={pts([[0, 0, 0], [0, D, 0], [0, D, 0.85], [0, 0, 0.85]])} fill="#b98d5e" />
      <polygon points={pts([[0, 0, 0], [W, 0, 0], [W, 0, 0.85], [0, 0, 0.85]])} fill="#c69a69" />
      <polyline points={pts([[0, D, 0.85], [0, 0, 0.85], [W, 0, 0.85]])} fill="none" stroke="#8a6340" strokeWidth={2} />
      {Array.from({ length: Math.floor(W / 0.5) }, (_, i) => (
        <polyline key={`wr${i}`} points={pts([[(i + 1) * 0.5, 0, 0.05], [(i + 1) * 0.5, 0, 0.8]])} stroke="#8a6340" strokeOpacity={0.25} strokeWidth={0.6} />
      ))}
      {Array.from({ length: Math.floor(D / 0.5) }, (_, i) => (
        <polyline key={`wl${i}`} points={pts([[0, (i + 1) * 0.5, 0.05], [0, (i + 1) * 0.5, 0.8]])} stroke="#6e4a2c" strokeOpacity={0.25} strokeWidth={0.6} />
      ))}
      <polygon points={pts([[-0.25, -0.25, H], [W, -0.25, H], [W, 0, H], [0, 0, H]])} fill={PALETTE.navy} />
      <polygon points={pts([[-0.25, -0.25, H], [0, 0, H], [0, D, H], [-0.25, D, H]])} fill={PALETTE.navyDeep} />
      <polygon points={pts([[W, -0.25, 0], [W, 0, 0], [W, 0, H], [W, -0.25, H]])} fill="#c9b79c" />
      <polygon points={pts([[-0.25, D, 0], [0, D, 0], [0, D, H], [-0.25, D, H]])} fill="#d8c7ab" />

      {/* 窓と差し込む光 */}
      {WALL.windowsRight.map((w) => (
        <WindowRight key={w.from} from={w.from} to={w.to} phase={phase} />
      ))}
      {WALL.windowsLeft.map((w) => (
        <WindowLeft key={w.from} from={w.from} to={w.to} phase={phase} />
      ))}
      {phase !== 'night' && (
        <g opacity={phase === 'day' ? 0.22 : 0.18}>
          <polygon points={pts([[1.6, 0.4, 0.01], [4.1, 0.4, 0.01], [5.2, 2.6, 0.01], [2.7, 2.6, 0.01]])} fill={phase === 'day' ? '#fff8dc' : '#ffc27a'} />
          <polygon points={pts([[0.4, 1.6, 0.01], [0.4, 3.8, 0.01], [2.4, 4.6, 0.01], [2.4, 2.4, 0.01]])} fill={phase === 'day' ? '#fff8dc' : '#ffc27a'} />
        </g>
      )}

      {/* 照明が床に落とす暖かい光 */}
      {LIGHT_POOLS.map((p) => {
        const [cx, cy] = iso(p.x, p.y, 0);
        return <ellipse key={`${p.x}${p.y}`} cx={cx} cy={cy} rx={p.rx * 40} ry={p.ry * 22} fill={p.color} opacity={phase === 'night' ? p.opacity * 1.5 : p.opacity} style={{ mixBlendMode: 'screen' }} />;
      })}

      {/* 壁の照明 */}
      {[
        [0, 4.45, 2.6],
        [10.85, 0, 2.6],
      ].map(([x, y, z]) => {
        const [sx, sy] = iso(x, y, z);
        return (
          <g key={`${x}${y}`}>
            <circle cx={sx} cy={sy} r={26} fill="url(#lamp-glow)" />
            <rect x={sx - 3} y={sy - 4} width={6} height={8} rx={2} fill="#f4e3c1" stroke="#8a6340" strokeWidth={0.8} />
          </g>
        );
      })}

      {/* 左の壁の小さなポスター */}
      <g transform={wallTransform('back-left', 4.6, 2.2)}>
        <rect x={0} y={0} width={wallLen(0.55)} height={heightPx(0.7)} fill="#fffaf2" stroke={PALETTE.walnut} strokeWidth={1.5} />
        <circle cx={wallLen(0.275)} cy={heightPx(0.32)} r={5} fill={PALETTE.green} />
        <path d={`M ${wallLen(0.275)} ${heightPx(0.32) + 4} l 0 6`} stroke={PALETTE.greenDark} strokeWidth={1.2} />
      </g>

      {/* エントランス：扉とロゴ */}
      <Hit label="エントランス（会社情報）" onClick={() => onTarget('entrance')} testId="entrance">
        <polygon points={pts([[0, door.from - 0.1, 0], [0, door.to + 0.1, 0], [0, door.to + 0.1, 2.35], [0, door.from - 0.1, 2.35]])} fill={PALETTE.navy} />
        <polygon points={pts([[0, door.from, 0], [0, door.to, 0], [0, door.to, 2.25], [0, door.from, 2.25]])} fill={`url(#sky-${phase})`} opacity={0.75} />
        <polygon points={pts([[0, (door.from + door.to) / 2 - 0.03, 0], [0, (door.from + door.to) / 2 + 0.03, 0], [0, (door.from + door.to) / 2 + 0.03, 2.25], [0, (door.from + door.to) / 2 - 0.03, 2.25]])} fill={PALETTE.navy} />
        <g transform={wallTransform('back-left', logo.to, logo.z + logo.h)}>
          <rect x={0} y={0} width={wallLen(logo.to - logo.from)} height={heightPx(logo.h)} rx={3} fill={PALETTE.navy} />
          <rect x={3} y={3} width={wallLen(logo.to - logo.from) - 6} height={heightPx(logo.h) - 6} rx={2} fill="none" stroke="#c9975c" strokeOpacity={0.6} strokeWidth={1} />
          <text x={wallLen(logo.to - logo.from) / 2} y={heightPx(logo.h) * 0.62} className="logo-text" textAnchor="middle" fill="url(#logo-wood)">
            NIFTP
          </text>
          <text x={wallLen(logo.to - logo.from) / 2} y={heightPx(logo.h) * 0.88} className="logo-sub" textAnchor="middle">
            AI OFFICE
          </text>
        </g>
      </Hit>

      {/* ホワイトボード：実際の案件の件数 */}
      <Hit label={`ホワイトボード（案件ボードを開く）: 作業中${counts.doing}件、確認待ち${counts.review}件`} onClick={() => onTarget('whiteboard')} testId="whiteboard">
        <g transform={wallTransform('back-right', wb.from, wb.z)}>
          <rect x={-3} y={-3} width={wallLen(wb.to - wb.from) + 6} height={heightPx(wb.h) + 6} rx={2} fill="#9aa3ad" />
          <rect x={0} y={0} width={wallLen(wb.to - wb.from)} height={heightPx(wb.h)} fill="#fbfcfd" />
          <text x={7} y={12} className="wb-title">
            案件ボード
          </text>
          <text x={7} y={25} className="wb-line">
            <tspan fill="#2f6fae">作業中 {counts.doing}</tspan>
            <tspan dx={6} fill="#b57d12">
              確認待ち {counts.review}
            </tspan>
          </text>
          <text x={7} y={36} className="wb-line">
            <tspan fill="#5d564c">未着手 {counts.todo}</tspan>
            <tspan dx={6} fill="#3f8a4f">
              完了 {counts.done}
            </tspan>
            {counts.error > 0 && (
              <tspan dx={6} fill="#b4483b">
                エラー {counts.error}
              </tspan>
            )}
          </text>
          {rows.map(([label, n, color], i) => (
            <rect key={label} x={wallLen(wb.to - wb.from) - 22 + i * 4} y={heightPx(wb.h) - 6 - Math.min(26, (n / maxCount) * 26)} width={3} height={Math.min(26, (n / maxCount) * 26) + 0.5} fill={color} opacity={0.75} />
          ))}
          <rect x={wallLen(wb.to - wb.from) * 0.3} y={heightPx(wb.h)} width={wallLen(wb.to - wb.from) * 0.4} height={3} fill="#7d858f" />
          <rect x={wallLen(wb.to - wb.from) * 0.34} y={heightPx(wb.h) - 1.5} width={7} height={2} fill="#c2553b" />
          <rect x={wallLen(wb.to - wb.from) * 0.34 + 9} y={heightPx(wb.h) - 1.5} width={7} height={2} fill="#2f4f7a" />
        </g>
      </Hit>

      {/* 実績ボード：承認済みの案件を1件ごとにカードでピン留め */}
      <Hit label={`実績ボード: 完了した案件${completedCount}件、保存済み成果物${deliverableCount}件`} onClick={() => onTarget('achievements')} testId="achievements">
        <g transform={wallTransform('back-right', ach.from, ach.z)}>
          <rect x={-3} y={-3} width={wallLen(ach.to - ach.from) + 6} height={heightPx(ach.h) + 6} rx={2} fill={PALETTE.walnut} />
          <rect x={0} y={0} width={wallLen(ach.to - ach.from)} height={heightPx(ach.h)} fill="#c9a06a" />
          <text x={wallLen(ach.to - ach.from) / 2} y={11} className="ach-title" textAnchor="middle">
            実績 {completedCount}件
          </text>
          {Array.from({ length: cards }, (_, i) => (
            <g key={i} transform={`translate(${6 + (i % 4) * 14} ${17 + Math.floor(i / 4) * 11}) rotate(${(i % 3) - 1} 5 4)`}>
              <rect x={0} y={0} width={11} height={9} fill={i % 2 ? '#fffdf6' : '#fff4c9'} />
              <path d="M 2 3 L 9 3 M 2 5.5 L 7 5.5" stroke="#b0a58f" strokeWidth={0.6} />
              <circle cx={5.5} cy={0.8} r={1.1} fill="#c2553b" />
            </g>
          ))}
          {cards === 0 && (
            <text x={wallLen(ach.to - ach.from) / 2} y={heightPx(ach.h) / 2 + 6} className="ach-empty" textAnchor="middle">
              まだありません
            </text>
          )}
        </g>
      </Hit>

      <Clock now={now} />

      {/* 会議室のモニター */}
      <Hit label="会議室（仕事を依頼する）" onClick={() => onTarget('meeting')}>
        <g transform={wallTransform('back-right', tv.from, tv.z)}>
          <rect x={0} y={0} width={wallLen(tv.to - tv.from)} height={heightPx(tv.h)} rx={2} fill="#1f2430" />
          <rect x={3} y={3} width={wallLen(tv.to - tv.from) - 6} height={heightPx(tv.h) - 6} fill="#2a3346" />
          <text x={wallLen(tv.to - tv.from) / 2} y={heightPx(tv.h) / 2 + 3} className="tv-text" textAnchor="middle">
            MEETING ROOM
          </text>
        </g>
      </Hit>
    </g>
  );
}
