// 床・壁・窓・扉と、壁の掲示物。空間の主役は入口から見える黒い壁の NIFTP ロゴ。
// ロゴは提供された画像（背景だけ透過にしたもの）を、縦横比を保ったまま壁面に沿わせて配置する。
// ホワイトボードとプロジェクトボードは実際の案件だけを表示する（架空の数値・実績は出さない）。
import type { KeyboardEvent, ReactNode } from 'react';
import { ROOM, heightPx, iso, pts, wallLen, wallTransform } from './iso.ts';
import { LIGHT_POOLS, MATERIAL, WALL, type Target } from './layout.ts';

export type DayPhase = 'day' | 'evening' | 'night';

export function dayPhase(d: Date): DayPhase {
  // 表示確認用: URL に ?sky=day|evening|night を付けると窓の外の時間帯を固定できる
  const forced = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('sky') : null;
  if (forced === 'day' || forced === 'evening' || forced === 'night') return forced;
  const h = d.getHours();
  if (h >= 7 && h < 16) return 'day';
  if (h >= 16 && h < 19) return 'evening';
  return 'night';
}

/** 提供ロゴ（背景を透過にした版）。元画像の縦横比 1087:381。 */
export const LOGO_SRC = '/brand/niftp-logo-alpha.png';
export const LOGO_RATIO = 1087 / 381;

export function SceneDefs() {
  return (
    <defs>
      <linearGradient id="sky-day" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#bcd4df" />
        <stop offset="1" stopColor="#eef2ee" />
      </linearGradient>
      <linearGradient id="sky-evening" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#c9a98b" />
        <stop offset="1" stopColor="#efd9bb" />
      </linearGradient>
      <linearGradient id="sky-night" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#151a22" />
        <stop offset="1" stopColor="#2a3340" />
      </linearGradient>
      <linearGradient id="glass-fill" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#dfe9ea" stopOpacity="0.4" />
        <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.12" />
        <stop offset="1" stopColor="#cfdcdd" stopOpacity="0.34" />
      </linearGradient>
      <radialGradient id="lamp-glow">
        <stop offset="0" stopColor="#fff1d0" stopOpacity="0.55" />
        <stop offset="1" stopColor="#fff1d0" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="downlight" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff4dc" stopOpacity="0.32" />
        <stop offset="1" stopColor="#fff4dc" stopOpacity="0" />
      </linearGradient>
      <filter id="soft-shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="2.4" />
      </filter>
      <filter id="soft-light" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="6" />
      </filter>
    </defs>
  );
}

type Counts = { todo: number; doing: number; review: number; done: number; error: number };

type Props = {
  now: Date;
  counts: Counts;
  /** プロジェクトボードに貼る最近の案件（実データ）。 */
  projects: { id: number; title: string; tone: string; label: string }[];
  projectCount: number;
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

/** 窓の外の街並み（左の壁のローカル座標で描く）。 */
function Skyline({ width, height, phase }: { width: number; height: number; phase: DayPhase }) {
  const far = phase === 'night' ? '#2f3946' : phase === 'evening' ? '#b5a496' : '#a9b6bb';
  const near = phase === 'night' ? '#20262f' : phase === 'evening' ? '#8f8379' : '#8c999e';
  const towersFar = [[0, 34], [9, 46], [20, 30], [28, 52], [40, 38], [50, 58], [61, 33]];
  const towersNear = [[2, 18], [13, 26], [24, 14], [33, 22], [46, 28], [56, 17]];
  return (
    <g>
      {towersFar.map(([x, h]) => (
        <rect key={`f${x}`} x={(x / 64) * width} y={height - (h / 64) * height} width={width * 0.13} height={height} fill={far} />
      ))}
      {towersNear.map(([x, h]) => (
        <rect key={`n${x}`} x={(x / 64) * width} y={height - (h / 64) * height} width={width * 0.16} height={height} fill={near} />
      ))}
      {phase === 'night' &&
        towersNear.flatMap(([x, h], i) =>
          [0, 1, 2].map((k) => (
            <rect key={`w${x}${k}`} x={(x / 64) * width + 2 + (k % 2) * 4} y={height - (h / 64) * height + 3 + k * 4 + (i % 2) * 2} width={1.6} height={1.6} fill="#e9d9a8" opacity={0.7} />
          )),
        )}
    </g>
  );
}

function WindowLeft({ from, to, phase }: { from: number; to: number; phase: DayPhase }) {
  const z0 = 0.25;
  const z1 = 3.0;
  const width = wallLen(to - from);
  const height = heightPx(z1 - z0);
  const clip = `win-${from}`;
  return (
    <g>
      <g transform={wallTransform('back-left', to, z1)}>
        <clipPath id={clip}>
          <rect x={0} y={0} width={width} height={height} />
        </clipPath>
        <g clipPath={`url(#${clip})`}>
          <rect x={0} y={0} width={width} height={height} fill={`url(#sky-${phase})`} />
          <Skyline width={width} height={height} phase={phase} />
          {phase !== 'night' && <path d={`M ${width * 0.15} 0 L ${width * 0.45} 0 L ${width * 0.1} ${height} L ${-width * 0.2} ${height} Z`} fill="#ffffff" opacity={0.18} />}
        </g>
        <rect x={0} y={0} width={width} height={height} fill="none" stroke={MATERIAL.metal} strokeWidth={2.2} />
        <path d={`M 0 ${height * 0.62} L ${width} ${height * 0.62}`} stroke={MATERIAL.metal} strokeWidth={1.4} />
      </g>
      <polygon points={pts([[0, from - 0.05, z0 - 0.04], [0, to + 0.05, z0 - 0.04], [0.14, to + 0.05, z0 - 0.04], [0.14, from - 0.05, z0 - 0.04]])} fill={MATERIAL.metal} />
    </g>
  );
}

function Clock({ now }: { now: Date }) {
  const { at, z } = WALL.clock;
  const m = now.getMinutes();
  const h = (now.getHours() % 12) + m / 60;
  return (
    <g transform={wallTransform('back-left', at, z)}>
      <circle cx={-9} cy={0} r={8.5} fill={MATERIAL.offwhite} stroke={MATERIAL.metal} strokeWidth={1.6} />
      <path d={`M -9 0 L ${-9 + 4.5 * Math.sin((h / 12) * 2 * Math.PI)} ${-4.5 * Math.cos((h / 12) * 2 * Math.PI)}`} stroke="#141512" strokeWidth={1.4} strokeLinecap="round" />
      <path d={`M -9 0 L ${-9 + 6.5 * Math.sin((m / 60) * 2 * Math.PI)} ${-6.5 * Math.cos((m / 60) * 2 * Math.PI)}`} stroke="#141512" strokeWidth={0.9} strokeLinecap="round" />
      <circle cx={-9} cy={0} r={1} fill={MATERIAL.green} />
    </g>
  );
}

/** コンクリート壁のセパレーター（型枠の継ぎ目と小さな穴）。 */
function ConcreteMarks({ wall, from, to }: { wall: 'back-right' | 'back-left'; from: number; to: number }) {
  const panels: number[] = [];
  for (let u = from + 1.6; u < to - 0.2; u += 1.6) panels.push(u);
  const line = (u: number) => (wall === 'back-right' ? pts([[u, 0, 0.12], [u, 0, H]]) : pts([[0, u, 0.12], [0, u, H]]));
  return (
    <g opacity={0.5}>
      {panels.map((u) => (
        <polyline key={u} points={line(u)} stroke="#b4b2a9" strokeWidth={0.7} />
      ))}
      {panels.flatMap((u) =>
        [1.1, 2.3].flatMap((z) =>
          [-0.45, 0.45].map((du) => {
            const [sx, sy] = wall === 'back-right' ? iso(u + du, 0, z) : iso(0, u + du, z);
            return <circle key={`${u}${z}${du}`} cx={sx} cy={sy} r={0.9} fill="#aeaca3" />;
          }),
        ),
      )}
    </g>
  );
}

export function Room({ now, counts, projects, projectCount, onTarget }: Props) {
  const phase = dayPhase(now);
  const plankLines = Array.from({ length: D * 3 - 1 }, (_, i) => (i + 1) / 3);
  const bw = WALL.brandWall;
  const wb = WALL.whiteboard;
  const pb = WALL.projectBoard;
  const scr = WALL.projectScreen;
  const door = WALL.door;
  const brandLen = wallLen(bw.to - bw.from);
  const logoW = brandLen * 0.78;
  const logoH = logoW / LOGO_RATIO;

  return (
    <g className="room">
      {/* 床の厚み */}
      <polygon points={pts([[0, D, 0], [W, D, 0], [W, D, -0.35], [0, D, -0.35]])} fill="#2a2b26" />
      <polygon points={pts([[W, 0, 0], [W, D, 0], [W, D, -0.35], [W, 0, -0.35]])} fill="#1f201b" />
      {/* 薄い木目の床 */}
      <polygon points={pts([[0, 0, 0], [W, 0, 0], [W, D, 0], [0, D, 0]])} fill="#ddd0b8" />
      {plankLines.map((y) => (
        <polyline key={y} points={pts([[0, y, 0], [W, y, 0]])} stroke="#b9a582" strokeOpacity={0.22} strokeWidth={0.6} />
      ))}

      {/* 壁（コンクリート） */}
      <polygon points={pts([[0, 0, 0], [0, D, 0], [0, D, H], [0, 0, H]])} fill="#cdcbc3" />
      <polygon points={pts([[0, 0, 0], [W, 0, 0], [W, 0, H], [0, 0, H]])} fill="#dcdad2" />
      <ConcreteMarks wall="back-left" from={0} to={D} />
      <ConcreteMarks wall="back-right" from={0} to={W} />
      <polyline points={pts([[0, D, 0.05], [0, 0, 0.05], [W, 0, 0.05]])} fill="none" stroke={MATERIAL.metal} strokeWidth={1.6} />
      <polygon points={pts([[-0.2, -0.2, H], [W, -0.2, H], [W, 0, H], [0, 0, H]])} fill="#2a2b26" />
      <polygon points={pts([[-0.2, -0.2, H], [0, 0, H], [0, D, H], [-0.2, D, H]])} fill="#1f201b" />
      <polygon points={pts([[W, -0.2, 0], [W, 0, 0], [W, 0, H], [W, -0.2, H]])} fill="#b9b7ae" />
      <polygon points={pts([[-0.2, D, 0], [0, D, 0], [0, D, H], [-0.2, D, H]])} fill="#aeaca3" />

      {/* 左の壁：大きな窓と街並み、差し込む光 */}
      {WALL.windowsLeft.map((w) => (
        <WindowLeft key={w.from} from={w.from} to={w.to} phase={phase} />
      ))}
      {phase !== 'night' && (
        <g filter="url(#soft-light)" opacity={phase === 'day' ? 0.5 : 0.4}>
          {WALL.windowsLeft.map((w) => (
            <polygon key={w.from} points={pts([[0.05, w.from + 0.2, 0.01], [0.05, w.to - 0.1, 0.01], [3.0, w.to + 0.9, 0.01], [3.0, w.from + 1.1, 0.01]])} fill={phase === 'day' ? '#fffaeb' : '#ffe2b8'} />
          ))}
        </g>
      )}

      {/* 照明が床に落とす柔らかい明るさ */}
      <g filter="url(#soft-light)">
        {LIGHT_POOLS.map((p) => {
          const [cx, cy] = iso(p.x, p.y, 0);
          return <ellipse key={`${p.x}${p.y}`} cx={cx} cy={cy} rx={p.rx * 38} ry={p.ry * 20} fill={p.color} opacity={phase === 'night' ? p.opacity * 1.5 : p.opacity} />;
        })}
      </g>

      {/* 左の壁：プロジェクトボード（コーヒーカウンターの上）。最近の案件を状態ごとの色と記号で貼る */}
      <Hit
        label={projectCount === 0 ? 'プロジェクトボード：まだ案件はありません（最初のプロジェクトを始める）' : `プロジェクトボード：案件${projectCount}件`}
        onClick={() => onTarget('achievements')}
        testId="project-board"
      >
        <g transform={wallTransform('back-left', pb.to, pb.z)}>
          <rect x={-1.5} y={-1.5} width={wallLen(pb.to - pb.from) + 3} height={heightPx(pb.h) + 3} rx={2} fill={MATERIAL.metal} />
          <rect x={0} y={0} width={wallLen(pb.to - pb.from)} height={heightPx(pb.h)} rx={1.5} fill="#26281f" />
          <text x={4} y={7.5} className="pb-title">
            PROJECTS
          </text>
          <text x={wallLen(pb.to - pb.from) - 4} y={7.5} textAnchor="end" className="pb-count">
            {projectCount}
          </text>
          {projects.length === 0 ? (
            <g>
              <circle cx={9} cy={22} r={4.5} fill="#91b36a" />
              <path d="M 9 19.6 L 9 24.4 M 6.6 22 L 11.4 22" stroke="#141512" strokeWidth={1.2} />
              <text x={16} y={20.5} className="pb-empty">
                最初のプロジェクトを
              </text>
              <text x={16} y={27} className="pb-empty">
                始める
              </text>
            </g>
          ) : (
            projects.map((p, i) => (
              <g key={p.id} transform={`translate(3 ${11 + i * 7.6})`}>
                <rect x={0} y={0} width={wallLen(pb.to - pb.from) - 6} height={6.4} rx={1} fill="#f2f0e7" />
                <rect x={0} y={0} width={2} height={6.4} className={`tone-fill-${p.tone}`} />
                <text x={4} y={4.6} className="pb-card">
                  {p.label} #{p.id} {p.title.length > 9 ? `${p.title.slice(0, 9)}…` : p.title}
                </text>
              </g>
            ))
          )}
        </g>
      </Hit>
      <Clock now={now} />

      {/* ① エントランス：ガラス扉 */}
      <Hit label="エントランス（会社情報）" onClick={() => onTarget('entrance')} testId="entrance">
        <polygon points={pts([[door.from - 0.08, 0, 0], [door.to + 0.08, 0, 0], [door.to + 0.08, 0, 2.5], [door.from - 0.08, 0, 2.5]])} fill={MATERIAL.metal} />
        <polygon points={pts([[door.from, 0, 0.04], [door.to, 0, 0.04], [door.to, 0, 2.42], [door.from, 0, 2.42]])} fill={`url(#sky-${phase})`} />
        <polygon points={pts([[door.from, 0, 0.04], [door.to, 0, 0.04], [door.to, 0, 2.42], [door.from, 0, 2.42]])} fill="#e9eeec" opacity={0.35} />
        <polygon points={pts([[(door.from + door.to) / 2 - 0.02, 0, 0.04], [(door.from + door.to) / 2 + 0.02, 0, 0.04], [(door.from + door.to) / 2 + 0.02, 0, 2.42], [(door.from + door.to) / 2 - 0.02, 0, 2.42]])} fill={MATERIAL.metal} />
        <polyline points={pts([[(door.from + door.to) / 2 - 0.15, 0, 0.9], [(door.from + door.to) / 2 - 0.15, 0, 1.4]])} stroke={MATERIAL.offwhite} strokeWidth={1.4} />

        {/* ブランドウォール：黒い壁に提供ロゴ */}
        <polygon points={pts([[bw.from, 0.1, 0], [bw.to, 0.1, 0], [bw.to, 0.1, H], [bw.from, 0.1, H]])} fill={MATERIAL.ink} />
        <polygon points={pts([[bw.to, 0, 0], [bw.to, 0.1, 0], [bw.to, 0.1, H], [bw.to, 0, H]])} fill="#0b0c0a" />
        <polygon points={pts([[bw.from, 0, H], [bw.to, 0, H], [bw.to, 0.1, H], [bw.from, 0.1, H]])} fill="#2a2b26" />
        {/* 天井のダウンライトが黒い壁を照らす */}
        <g transform={wallTransform('back-right', bw.from, H, 0.1)}>
          {[0.2, 0.8].map((f) => (
            <g key={f}>
              <path d={`M ${brandLen * f - 3} 0 L ${brandLen * f + 3} 0 L ${brandLen * f + 26} ${heightPx(H) * 0.85} L ${brandLen * f - 26} ${heightPx(H) * 0.85} Z`} fill="url(#downlight)" />
              <rect x={brandLen * f - 4} y={0} width={8} height={2} rx={1} fill="#3a3d36" />
            </g>
          ))}
        </g>
        {/* ロゴの周りの柔らかい間接照明（天井と床際のコーブ照明、ロゴの背後のほのかな明かり） */}
        <g transform={wallTransform('back-right', bw.from, H, 0.1)} filter="url(#soft-light)" className="cove">
          <rect x={6} y={2} width={brandLen - 12} height={7} fill="#ffd9a3" opacity={0.42} />
          <rect x={6} y={heightPx(H) - 9} width={brandLen - 12} height={7} fill="#ffd9a3" opacity={0.3} />
          <ellipse cx={brandLen / 2} cy={heightPx(0.75) + logoH / 2} rx={logoW * 0.55} ry={logoH * 0.85} fill="#f7e3c0" opacity={0.07} />
        </g>
        <polygon points={pts([[bw.from + 0.2, 0.12, 0.01], [bw.to - 0.2, 0.12, 0.01], [bw.to - 0.4, 1.3, 0.01], [bw.from + 0.4, 1.3, 0.01]])} fill="#ffe2b3" opacity={0.28} filter="url(#soft-light)" />
        <g transform={wallTransform('back-right', bw.from, H - 0.75, 0.1)}>
          <image href={LOGO_SRC} x={(brandLen - logoW) / 2} y={0} width={logoW} height={logoH} preserveAspectRatio="xMidYMid meet" data-testid="brand-logo" />
        </g>
      </Hit>

      {/* ホワイトボード：実際の案件の件数 */}
      <Hit label={`ホワイトボード（案件ボードを開く）: 作業中${counts.doing}件、確認待ち${counts.review}件`} onClick={() => onTarget('whiteboard')} testId="whiteboard">
        <g transform={wallTransform('back-right', wb.from, wb.z)}>
          <rect x={-2} y={-2} width={wallLen(wb.to - wb.from) + 4} height={heightPx(wb.h) + 4} rx={1.5} fill={MATERIAL.metal} />
          <rect x={0} y={0} width={wallLen(wb.to - wb.from)} height={heightPx(wb.h)} fill="#fbfaf6" />
          <text x={5} y={10} className="wb-title">
            案件ボード
          </text>
          <text x={5} y={21} className="wb-line">
            <tspan fill="#4f7590">作業中 {counts.doing}</tspan>
            <tspan dx={4} fill="#9a6a12">
              確認 {counts.review}
            </tspan>
          </text>
          <text x={5} y={31} className="wb-line">
            <tspan fill="#141512">完了 {counts.done}</tspan>
            {counts.error > 0 && (
              <tspan dx={4} fill="#b9483a">
                エラー {counts.error}
              </tspan>
            )}
          </text>
        </g>
      </Hit>

      {/* プロジェクトルームの壁面モニター */}
      <Hit label="プロジェクトルーム（仕事を依頼する）" onClick={() => onTarget('meeting')}>
        <g transform={wallTransform('back-right', scr.from, scr.z)}>
          <rect x={0} y={0} width={wallLen(scr.to - scr.from)} height={heightPx(scr.h)} rx={1.5} fill="#1d1e1a" />
          <rect x={2.5} y={2.5} width={wallLen(scr.to - scr.from) - 5} height={heightPx(scr.h) - 5} fill="#2a2c27" />
          <text x={wallLen(scr.to - scr.from) / 2} y={heightPx(scr.h) / 2 + 2.5} className="screen-text" textAnchor="middle">
            PROJECT ROOM
          </text>
        </g>
      </Hit>
    </g>
  );
}
