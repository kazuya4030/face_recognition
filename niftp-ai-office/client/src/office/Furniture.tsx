// 家具の描画。素材は薄い木目・コンクリート・ガラス・マットブラックの金属を中心にし、
// 厚み（3面の陰影）と柔らかい影で奥行きを出す。
import type { ReactNode } from 'react';
import { boxFaces, iso, pts, shade, shadowPts, type BoxGeom } from './iso.ts';
import { BENCH, MATERIAL, type FurnitureItem } from './layout.ts';
import type { DeskProp } from './appearance.ts';

export function Box({ g, color, top, edge = true }: { g: BoxGeom; color: string; top?: string; edge?: boolean }) {
  const f = boxFaces(g);
  const stroke = edge ? { stroke: 'rgba(20,21,18,.16)', strokeWidth: 0.5, strokeLinejoin: 'round' as const } : {};
  return (
    <g>
      <polygon points={f.left} fill={shade(color, -0.08)} {...stroke} />
      <polygon points={f.right} fill={shade(color, -0.24)} {...stroke} />
      <polygon points={f.top} fill={top ?? shade(color, 0.08)} {...stroke} />
    </g>
  );
}

/** 柔らかい影（ぼかしフィルター #soft-shadow を使う）。 */
export function Shadow({ g, spread = 0.25, opacity = 0.16 }: { g: BoxGeom; spread?: number; opacity?: number }) {
  return <polygon points={shadowPts(g, spread)} fill="#141512" opacity={opacity} filter="url(#soft-shadow)" />;
}

const at = (x: number, y: number, z = 0) => {
  const [sx, sy] = iso(x, y, z);
  return `translate(${sx.toFixed(1)} ${sy.toFixed(1)})`;
};

export function Mug({ x, y, z, color = '#f2f0e7' }: { x: number; y: number; z: number; color?: string }) {
  return (
    <g transform={at(x, y, z)}>
      <rect x={-2.6} y={-6} width={5.2} height={6} rx={1} fill={color} stroke="rgba(20,21,18,.3)" strokeWidth={0.4} />
      <ellipse cx={0} cy={-6} rx={2.6} ry={1} fill="#4a3526" />
      <path d="M 2.6 -4.8 Q 4.8 -4 2.6 -1.8" fill="none" stroke={color} strokeWidth={1} />
      <path className="steam" d="M -0.8 -8.5 Q 0.4 -10.5 -0.4 -12.5 M 1.3 -8.5 Q 2.5 -10.5 1.7 -12.5" fill="none" stroke="#fff" strokeWidth={0.7} opacity={0.6} />
    </g>
  );
}

export function SmallPlant({ x, y, z, scale = 1 }: { x: number; y: number; z: number; scale?: number }) {
  return (
    <g transform={`${at(x, y, z)} scale(${scale})`}>
      <path d="M -3.6 0 L -4.2 -6 L 4.2 -6 L 3.6 0 Z" fill="#e9e6dc" stroke="rgba(20,21,18,.2)" strokeWidth={0.4} />
      <ellipse cx={-2.6} cy={-10} rx={2.6} ry={4.4} fill={MATERIAL.leaf} transform="rotate(-25 -2.6 -10)" />
      <ellipse cx={2.6} cy={-10} rx={2.6} ry={4.4} fill={MATERIAL.leafDark} transform="rotate(25 2.6 -10)" />
      <ellipse cx={0} cy={-12} rx={2.3} ry={4.8} fill={MATERIAL.leafLight} />
    </g>
  );
}

function Books({ x, y, z, count = 3 }: { x: number; y: number; z: number; count?: number }) {
  const colors = ['#2b2d27', '#f2f0e7', '#a4a89d', '#91b36a', '#d8c3a0'];
  return (
    <g transform={at(x, y, z)}>
      {Array.from({ length: count }, (_, i) => {
        const c = colors[i % colors.length];
        return (
          <g key={i} transform={`translate(0 ${-i * 2.3})`}>
            <path d="M -8 0 L 0 4 L 8 0 L 0 -4 Z" fill={c} stroke="rgba(20,21,18,.25)" strokeWidth={0.4} />
            <path d="M -8 0 L 0 4 L 0 6 L -8 2 Z" fill={shade(c, -0.2)} />
            <path d="M 0 4 L 8 0 L 8 2 L 0 6 Z" fill="#ebe8dd" />
          </g>
        );
      })}
    </g>
  );
}

function Notes({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <g transform={at(x, y, z)}>
      <path d="M -7 0 L 0 3.5 L 7 0 L 0 -3.5 Z" fill="#fbfaf6" stroke="rgba(20,21,18,.25)" strokeWidth={0.4} />
      <path d="M -3.5 -0.2 L 1.5 2.3 M -1.8 -1.1 L 3.2 1.4" stroke="#a4a89d" strokeWidth={0.5} />
      <path d="M 3 -1 L 6.5 0.8" stroke="#1d1e1a" strokeWidth={0.9} strokeLinecap="round" />
    </g>
  );
}

function Tablet({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <g transform={at(x, y, z)}>
      <path d="M -6 0 L 0 3 L 6 0 L 0 -3 Z" fill="#1d1e1a" />
      <path d="M -4.6 0 L 0 2.3 L 4.6 0 L 0 -2.3 Z" fill="#3b4148" />
    </g>
  );
}

function Bottle({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <g transform={at(x, y, z)}>
      <rect x={-1.8} y={-9} width={3.6} height={9} rx={1.4} fill="#a4a89d" />
      <rect x={-1.3} y={-10.6} width={2.6} height={2} rx={0.6} fill="#1d1e1a" />
    </g>
  );
}

/** 大型モニター。screen='+y' は手前（画面が見える側）を向く。on のときだけ作業画面を表示する（中身は抽象的な画面で、実データではない）。 */
export function Monitor({ x, y, z, screen, on }: { x: number; y: number; z: number; screen: '+y' | '-y'; on: boolean }) {
  const half = 0.46;
  const z0 = z + 0.24;
  const z1 = z + 0.78;
  const panel = pts([[x - half, y, z0], [x + half, y, z0], [x + half, y, z1], [x - half, y, z1]]);
  const [bx, by] = iso(x, y, z);
  const inner = (a: number, b: number, za: number, zb: number) => pts([[x - half + a, y + 0.001, za], [x - half + b, y + 0.001, za], [x - half + b, y + 0.001, zb], [x - half + a, y + 0.001, zb]]);
  return (
    <g>
      <ellipse cx={bx} cy={by} rx={7} ry={3} fill="#1d1e1a" />
      <path d={`M ${bx} ${by} L ${bx} ${by - 9}`} stroke="#1d1e1a" strokeWidth={2.2} />
      <polygon points={panel} fill="#1d1e1a" stroke="#0e0f0c" strokeWidth={0.6} />
      {screen === '+y' && (
        <>
          <polygon points={inner(0.04, 2 * half - 0.04, z0 + 0.04, z1 - 0.04)} fill={on ? '#22303a' : '#2a2c27'} />
          {on && (
            <g className="screen-ui">
              <polygon points={inner(0.08, 2 * half - 0.08, z1 - 0.14, z1 - 0.08)} fill="#3f5566" />
              <polygon points={inner(0.08, 0.3, z0 + 0.08, z1 - 0.18)} fill="#33454f" />
              <polygon points={inner(0.36, 0.86, z1 - 0.26, z1 - 0.22)} fill="#cfe1ea" opacity={0.85} />
              <polygon points={inner(0.36, 0.74, z1 - 0.33, z1 - 0.29)} fill="#cfe1ea" opacity={0.6} />
              <polygon points={inner(0.36, 0.8, z1 - 0.4, z1 - 0.36)} fill="#cfe1ea" opacity={0.6} />
              <polygon points={inner(0.36, 0.56, z0 + 0.08, z0 + 0.14)} fill="#91b36a" />
            </g>
          )}
        </>
      )}
    </g>
  );
}

const renderProp = (p: DeskProp, x: number, y: number, z: number, accent: string): ReactNode => {
  switch (p) {
    case 'mug':
      return <Mug key={p} x={x} y={y} z={z} color={accent} />;
    case 'plant':
      return <SmallPlant key={p} x={x} y={y} z={z} scale={0.85} />;
    case 'books':
      return <Books key={p} x={x} y={y} z={z} count={2} />;
    case 'notes':
      return <Notes key={p} x={x} y={y} z={z} />;
    case 'tablet':
      return <Tablet key={p} x={x} y={y} z={z} />;
    case 'bottle':
      return <Bottle key={p} x={x} y={y} z={z} />;
    case 'headphones':
      return null;
  }
};

export interface BenchSide {
  working: boolean;
  props: DeskProp[];
  /** 社員の差し色（マグカップなどの小物に使う）。 */
  accent: string;
}

/** 共同デスクの1区画。奥の席（far）と手前の席（near）が背中合わせのモニターを共有する。 */
export function BenchSegment({ index, far, near }: { index: number; far: BenchSide | null; near: BenchSide | null }) {
  const segW = BENCH.w / BENCH.segments;
  const x = BENCH.x + segW * index;
  const { y, d, h } = BENCH;
  const cx = x + segW / 2;
  const mid = y + d / 2;
  const legs = [index === 0 ? x + 0.12 : null, index === BENCH.segments - 1 ? x + segW - 0.2 : x + segW - 0.04].filter((v): v is number => v != null);
  return (
    <g>
      <Shadow g={{ x, y, w: segW, d, h }} spread={0.35} opacity={0.14} />
      {legs.map((lx) => (
        <g key={lx}>
          <Box g={{ x: lx, y: y + 0.15, z: 0, w: 0.08, d: 0.08, h: h - 0.05 }} color={MATERIAL.metal} edge={false} />
          <Box g={{ x: lx, y: y + d - 0.23, z: 0, w: 0.08, d: 0.08, h: h - 0.05 }} color={MATERIAL.metal} edge={false} />
          <Box g={{ x: lx, y: y + 0.15, z: 0.08, w: 0.08, d: d - 0.3, h: 0.05 }} color={MATERIAL.metal} edge={false} />
        </g>
      ))}
      <Box g={{ x, y, z: h - 0.05, w: segW, d, h: 0.05 }} color={MATERIAL.oak} top={MATERIAL.laminate} />
      {/* キーボード */}
      {far && <polygon points={pts([[cx - 0.3, y + 0.25, h], [cx + 0.3, y + 0.25, h], [cx + 0.3, y + 0.45, h], [cx - 0.3, y + 0.45, h]])} fill="#d9d7ce" stroke="rgba(20,21,18,.25)" strokeWidth={0.4} />}
      {near && <polygon points={pts([[cx - 0.3, y + d - 0.45, h], [cx + 0.3, y + d - 0.45, h], [cx + 0.3, y + d - 0.25, h], [cx - 0.3, y + d - 0.25, h]])} fill="#d9d7ce" stroke="rgba(20,21,18,.25)" strokeWidth={0.4} />}
      {far?.props.map((p, i) => renderProp(p, cx + (i === 0 ? -0.7 : 0.72), y + 0.35, h, far.accent))}
      <Monitor x={cx} y={mid - 0.05} z={h} screen="-y" on={false} />
      <Monitor x={cx} y={mid + 0.05} z={h} screen="+y" on={near?.working ?? false} />
      {near?.props.map((p, i) => renderProp(p, cx + (i === 0 ? -0.72 : 0.7), y + d - 0.35, h, near.accent))}
    </g>
  );
}

/** 椅子の座面と脚（人物より先に描く）。背もたれは向きに応じて人物の前後に描き分ける。 */
export function ChairBase({ x, y, color = '#3a3d36' }: { x: number; y: number; color?: string }) {
  const [bx, by] = iso(x, y, 0);
  return (
    <g>
      <ellipse cx={bx} cy={by} rx={12} ry={5.5} fill="#141512" opacity={0.14} filter="url(#soft-shadow)" />
      {[-9, -3, 4, 9].map((dx, i) => (
        <path key={i} d={`M ${bx} ${by - 2} L ${bx + dx} ${by + (i % 2 ? 3 : 1)}`} stroke="#1d1e1a" strokeWidth={1.3} strokeLinecap="round" />
      ))}
      <path d={`M ${bx} ${by - 2} L ${bx} ${by - 10}`} stroke="#1d1e1a" strokeWidth={1.8} />
      <Box g={{ x: x - 0.28, y: y - 0.26, z: 0.36, w: 0.56, d: 0.52, h: 0.08 }} color={color} />
    </g>
  );
}

export function ChairBack({ x, y, facing, color = '#1d1e1a' }: { x: number; y: number; facing: 'front' | 'back'; color?: string }) {
  const by = facing === 'front' ? y - 0.32 : y + 0.24;
  return <Box g={{ x: x - 0.27, y: by, z: 0.5, w: 0.54, d: 0.08, h: 0.58 }} color={color} />;
}

function TaskChair({ it }: { it: FurnitureItem }) {
  const cx = it.x + it.w / 2;
  const cy = it.y + it.d / 2;
  return (
    <g>
      {it.facing !== 'back' && <ChairBack x={cx} y={cy} facing="front" />}
      <ChairBase x={cx} y={cy} color="#8f938a" />
      {it.facing === 'back' && <ChairBack x={cx} y={cy} facing="back" />}
    </g>
  );
}

function Shelf({ it }: { it: FurnitureItem }) {
  const metal = it.color ?? MATERIAL.metal;
  const fx = it.x + it.w;
  const levels = [0.08, 0.68, 1.28, 1.88];
  const binderColors = ['#f2f0e7', '#a4a89d', '#2b2d27', '#d8c3a0', '#e6e3d8'];
  const contents = (lz: number, li: number): ReactNode[] => {
    const out: ReactNode[] = [];
    let yy = it.y + 0.1;
    let k = 0;
    while (yy < it.y + it.d - 0.18) {
      const kind = (li * 5 + k) % 11;
      if (kind === 10 && li > 0) {
        out.push(<SmallPlant key={k} x={fx - 0.25} y={yy + 0.12} z={lz + 0.04} scale={0.8} />);
        yy += 0.3;
      } else if (kind === 3) {
        // 収納ボックス
        out.push(<polygon key={k} points={pts([[fx, yy, lz + 0.04], [fx, yy + 0.3, lz + 0.04], [fx, yy + 0.3, lz + 0.3], [fx, yy, lz + 0.3]])} fill={MATERIAL.oak} stroke="rgba(20,21,18,.2)" strokeWidth={0.4} />);
        yy += 0.33;
      } else {
        const bw = 0.075 + (k % 3) * 0.012;
        const bh = 0.42 + ((li + k) % 3) * 0.05;
        out.push(<polygon key={k} points={pts([[fx, yy, lz + 0.04], [fx, yy + bw, lz + 0.04], [fx, yy + bw, lz + 0.04 + bh], [fx, yy, lz + 0.04 + bh]])} fill={binderColors[(li * 2 + k) % binderColors.length]} stroke="rgba(20,21,18,.25)" strokeWidth={0.4} />);
        yy += bw + 0.006;
      }
      k++;
    }
    return out;
  };
  return (
    <g>
      <polygon points={pts([[fx, it.y, 0], [fx, it.y + it.d, 0], [fx, it.y + it.d, it.h], [fx, it.y, it.h]])} fill="#e3e1d8" opacity={0.55} />
      {levels.map((lz) => (
        <Box key={lz} g={{ x: it.x, y: it.y, z: lz, w: it.w, d: it.d, h: 0.04 }} color={MATERIAL.oak} edge={false} />
      ))}
      {levels.map((lz, li) => (
        <g key={`c${lz}`}>{contents(lz, li)}</g>
      ))}
      <Box g={{ x: it.x, y: it.y, z: it.h - 0.04, w: it.w, d: it.d, h: 0.04 }} color={MATERIAL.oak} edge={false} />
      {[it.y, it.y + it.d - 0.04].map((py) => (
        <Box key={py} g={{ x: fx - 0.04, y: py, z: 0, w: 0.04, d: 0.04, h: it.h }} color={metal} edge={false} />
      ))}
    </g>
  );
}

function CoffeeCounter({ it }: { it: FurnitureItem }) {
  const fx = it.x + it.w;
  const H = it.h;
  return (
    <g>
      <Shadow g={{ x: it.x, y: it.y, w: it.w, d: it.d, h: H }} />
      <Box g={{ x: it.x, y: it.y, w: it.w, d: it.d, h: H - 0.06 }} color={it.color ?? MATERIAL.oak} />
      {Array.from({ length: 9 }, (_, i) => (
        <polyline key={i} points={pts([[fx, it.y + 0.1 + i * 0.2, 0.06], [fx, it.y + 0.1 + i * 0.2, H - 0.1]])} stroke={MATERIAL.oakDark} strokeWidth={0.6} opacity={0.7} />
      ))}
      <Box g={{ x: it.x - 0.02, y: it.y - 0.02, z: H - 0.06, w: it.w + 0.06, d: it.d + 0.04, h: 0.06 }} color={MATERIAL.concrete} />
      {/* エスプレッソマシン（ステンレスの本体・黒い天板・抽出口）とグラインダー */}
      <Box g={{ x: it.x + 0.15, y: it.y + 0.2, z: H, w: 0.42, d: 0.5, h: 0.4 }} color="#c9cbc4" />
      <Box g={{ x: it.x + 0.15, y: it.y + 0.2, z: H + 0.4, w: 0.42, d: 0.5, h: 0.05 }} color="#1d1e1a" edge={false} />
      <Box g={{ x: it.x + 0.57, y: it.y + 0.32, z: H + 0.2, w: 0.1, d: 0.08, h: 0.06 }} color="#1d1e1a" edge={false} />
      <Box g={{ x: it.x + 0.57, y: it.y + 0.52, z: H + 0.2, w: 0.1, d: 0.08, h: 0.06 }} color="#1d1e1a" edge={false} />
      <Mug x={it.x + 0.62} y={it.y + 0.38} z={H} />
      <Box g={{ x: it.x + 0.22, y: it.y + 0.95, z: H, w: 0.22, d: 0.22, h: 0.32 }} color="#1d1e1a" />
      <Box g={{ x: it.x + 0.25, y: it.y + 0.98, z: H + 0.32, w: 0.16, d: 0.16, h: 0.14 }} color="#6b5440" edge={false} />
      <Mug x={it.x + 0.45} y={it.y + 1.35} z={H} />
      <Mug x={it.x + 0.55} y={it.y + 1.55} z={H} color="#1d1e1a" />
      <SmallPlant x={it.x + 0.4} y={it.y + 1.72} z={H} scale={0.8} />
    </g>
  );
}

function Plant({ it, tall }: { it: FurnitureItem; tall: boolean }) {
  const [bx, by] = iso(it.x + it.w / 2, it.y + it.d / 2, 0);
  const s = it.w * 30;
  const potH = tall ? s * 0.8 : s * 0.6;
  const leaves = tall
    ? [[-0.5, -2.3, 0.42, -30, MATERIAL.leafDark], [0.5, -2.1, 0.42, 30, MATERIAL.leaf], [0, -3.0, 0.4, 0, MATERIAL.leafLight], [-0.35, -3.6, 0.36, -18, MATERIAL.leaf], [0.4, -3.4, 0.36, 22, MATERIAL.leafDark], [0.05, -4.2, 0.32, 5, MATERIAL.leafLight]]
    : [[-0.45, -1.4, 0.36, -32, MATERIAL.leafDark], [0.45, -1.4, 0.36, 32, MATERIAL.leaf], [0, -1.9, 0.34, 0, MATERIAL.leafLight]];
  return (
    <g>
      <ellipse cx={bx + 3} cy={by + 2} rx={s * 0.6} ry={s * 0.28} fill="#141512" opacity={0.14} filter="url(#soft-shadow)" />
      {tall && <path d={`M ${bx} ${by - potH} L ${bx} ${by - s * 3.4}`} stroke="#4d4a36" strokeWidth={1.4} />}
      <path d={`M ${bx - s * 0.4} ${by - potH} L ${bx - s * 0.34} ${by} L ${bx + s * 0.34} ${by} L ${bx + s * 0.4} ${by - potH} Z`} fill={tall ? MATERIAL.concrete : '#e9e6dc'} stroke="rgba(20,21,18,.15)" strokeWidth={0.5} />
      <ellipse cx={bx} cy={by - potH} rx={s * 0.4} ry={s * 0.13} fill={tall ? MATERIAL.concreteDark : '#d6d3c8'} />
      {leaves.map(([lx, ly, r, rot, col], i) => (
        <ellipse
          key={i}
          cx={bx + (lx as number) * s}
          cy={by + (ly as number) * s}
          rx={(r as number) * s * 0.75}
          ry={(r as number) * s * 1.35}
          fill={col as string}
          transform={`rotate(${rot} ${bx + (lx as number) * s} ${by + (ly as number) * s})`}
        />
      ))}
    </g>
  );
}

function FloorLamp({ it }: { it: FurnitureItem }) {
  const [bx, by] = iso(it.x + it.w / 2, it.y + it.d / 2, 0);
  const topY = by - it.h * 30;
  return (
    <g>
      <ellipse cx={bx} cy={by} rx={6} ry={2.6} fill="#1d1e1a" />
      <path d={`M ${bx} ${by} L ${bx} ${topY + 4}`} stroke="#1d1e1a" strokeWidth={1.4} />
      <circle cx={bx} cy={topY + 6} r={20} fill="url(#lamp-glow)" />
      <path d={`M ${bx - 8} ${topY + 6} L ${bx - 5} ${topY - 5} L ${bx + 5} ${topY - 5} L ${bx + 8} ${topY + 6} Z`} fill="#f2f0e7" stroke="#c4c6bb" strokeWidth={0.6} />
    </g>
  );
}

function Glass({ it, axis }: { it: FurnitureItem; axis: 'x' | 'y' }) {
  const len = axis === 'x' ? it.w : it.d;
  const seg = (a: number, b: number, z0: number, z1: number) =>
    axis === 'x'
      ? pts([[it.x + a, it.y, z0], [it.x + b, it.y, z0], [it.x + b, it.y, z1], [it.x + a, it.y, z1]])
      : pts([[it.x, it.y + a, z0], [it.x, it.y + b, z0], [it.x, it.y + b, z1], [it.x, it.y + a, z1]]);
  const n = Math.max(1, Math.round(len / 1.3));
  const mullions = Array.from({ length: n + 1 }, (_, i) => (i * len) / n);
  return (
    <g className="glass">
      <polygon points={seg(0, len, 0, it.h)} fill="url(#glass-fill)" />
      <polygon points={seg(0, len, it.h - 0.05, it.h)} fill={MATERIAL.metal} />
      <polygon points={seg(0, len, 0, 0.05)} fill={MATERIAL.metal} />
      {mullions.map((m) => (
        <polygon key={m} points={seg(Math.max(0, m - 0.02), Math.min(len, m + 0.02), 0, it.h)} fill={MATERIAL.metal} />
      ))}
      <polygon points={seg(0.2, 0.9, 0.3, 2.3)} fill="#ffffff" opacity={0.12} />
    </g>
  );
}

function Sofa({ it }: { it: FurnitureItem }) {
  const c = it.color ?? MATERIAL.fabric;
  return (
    <g>
      <Shadow g={{ x: it.x, y: it.y, w: it.w, d: it.d, h: 0 }} spread={0.3} />
      <Box g={{ x: it.x, y: it.y, w: it.w, d: 0.26, h: 0.78 }} color={c} />
      <Box g={{ x: it.x, y: it.y + 0.15, z: 0.08, w: it.w, d: it.d - 0.15, h: 0.3 }} color={c} />
      {[0, 1, 2].map((i) => (
        <Box key={i} g={{ x: it.x + 0.08 + i * ((it.w - 0.16) / 3), y: it.y + 0.26, z: 0.38, w: (it.w - 0.16) / 3 - 0.04, d: it.d - 0.32, h: 0.1 }} color={shade(c, 0.06)} />
      ))}
      <Box g={{ x: it.x + 0.35, y: it.y + 0.24, z: 0.46, w: 0.42, d: 0.14, h: 0.32 }} color={MATERIAL.green} />
      <Box g={{ x: it.x + it.w - 0.75, y: it.y + 0.24, z: 0.46, w: 0.4, d: 0.14, h: 0.3 }} color={MATERIAL.offwhite} />
      {[it.x + 0.1, it.x + it.w - 0.15].map((lx) => (
        <Box key={lx} g={{ x: lx, y: it.y + it.d - 0.12, z: 0, w: 0.05, d: 0.05, h: 0.08 }} color={MATERIAL.metal} edge={false} />
      ))}
    </g>
  );
}

function Ottoman({ it }: { it: FurnitureItem }) {
  const [cx, cy] = iso(it.x + it.w / 2, it.y + it.d / 2, 0);
  const rx = it.w * 25;
  const h = it.h * 30;
  const c = it.color ?? MATERIAL.fabricDark;
  return (
    <g>
      <ellipse cx={cx + 3} cy={cy + 2} rx={rx} ry={rx * 0.5} fill="#141512" opacity={0.14} filter="url(#soft-shadow)" />
      <path d={`M ${cx - rx} ${cy - h} L ${cx - rx} ${cy} A ${rx} ${rx * 0.5} 0 0 0 ${cx + rx} ${cy} L ${cx + rx} ${cy - h} Z`} fill={shade(c, -0.18)} />
      <ellipse cx={cx} cy={cy - h} rx={rx} ry={rx * 0.5} fill={shade(c, 0.06)} />
    </g>
  );
}

function LowTable({ it }: { it: FurnitureItem }) {
  const c = it.color ?? MATERIAL.oak;
  return (
    <g>
      <Shadow g={{ x: it.x, y: it.y, w: it.w, d: it.d, h: 0 }} />
      {[[it.x + 0.06, it.y + 0.06], [it.x + it.w - 0.1, it.y + 0.06], [it.x + 0.06, it.y + it.d - 0.1], [it.x + it.w - 0.1, it.y + it.d - 0.1]].map(([lx, ly]) => (
        <Box key={`${lx}${ly}`} g={{ x: lx, y: ly, w: 0.04, d: 0.04, h: it.h - 0.05 }} color={MATERIAL.metal} edge={false} />
      ))}
      <Box g={{ x: it.x, y: it.y, z: it.h - 0.05, w: it.w, d: it.d, h: 0.05 }} color={c} />
      <Books x={it.x + 0.45} y={it.y + 0.4} z={it.h} count={2} />
      <Mug x={it.x + 1.25} y={it.y + 0.5} z={it.h} />
    </g>
  );
}

function HighTable({ it }: { it: FurnitureItem }) {
  const [cx, cy] = iso(it.x + it.w / 2, it.y + it.d / 2, 0);
  const rx = it.w * 24;
  const top = cy - it.h * 30;
  return (
    <g>
      <ellipse cx={cx + 3} cy={cy + 2} rx={rx * 0.7} ry={rx * 0.35} fill="#141512" opacity={0.14} filter="url(#soft-shadow)" />
      <ellipse cx={cx} cy={cy} rx={7} ry={3} fill="#1d1e1a" />
      <path d={`M ${cx} ${cy} L ${cx} ${top}`} stroke="#1d1e1a" strokeWidth={2} />
      <path d={`M ${cx - rx} ${top} L ${cx - rx} ${top + 2.5} A ${rx} ${rx * 0.5} 0 0 0 ${cx + rx} ${top + 2.5} L ${cx + rx} ${top} Z`} fill={MATERIAL.oakDark} />
      <ellipse cx={cx} cy={top} rx={rx} ry={rx * 0.5} fill={it.color ?? MATERIAL.oak} stroke="rgba(20,21,18,.18)" strokeWidth={0.5} />
      <Mug x={it.x + 0.3} y={it.y + 0.45} z={it.h} />
    </g>
  );
}

function Stool({ it }: { it: FurnitureItem }) {
  const [cx, cy] = iso(it.x + it.w / 2, it.y + it.d / 2, 0);
  const top = cy - it.h * 30;
  return (
    <g>
      <path d={`M ${cx - 6} ${cy} L ${cx - 2} ${top} M ${cx + 6} ${cy} L ${cx + 2} ${top} M ${cx} ${cy + 2} L ${cx} ${top}`} stroke="#1d1e1a" strokeWidth={1.2} />
      <ellipse cx={cx} cy={top} rx={8} ry={4} fill={MATERIAL.oak} stroke="rgba(20,21,18,.2)" strokeWidth={0.5} />
    </g>
  );
}

function Bench({ it }: { it: FurnitureItem }) {
  return (
    <g>
      <Shadow g={{ x: it.x, y: it.y, w: it.w, d: it.d, h: 0 }} />
      {[it.x + 0.1, it.x + it.w - 0.16].map((lx) => (
        <Box key={lx} g={{ x: lx, y: it.y + 0.06, w: 0.06, d: it.d - 0.12, h: it.h - 0.06 }} color={MATERIAL.metal} edge={false} />
      ))}
      <Box g={{ x: it.x, y: it.y, z: it.h - 0.06, w: it.w, d: it.d, h: 0.06 }} color={it.color ?? MATERIAL.oak} />
    </g>
  );
}

function MeetingTable({ it }: { it: FurnitureItem }) {
  return (
    <g>
      <Shadow g={{ x: it.x, y: it.y, w: it.w, d: it.d, h: 0 }} />
      {[it.x + 0.15, it.x + it.w - 0.21].map((lx) => (
        <Box key={lx} g={{ x: lx, y: it.y + 0.15, w: 0.06, d: it.d - 0.3, h: it.h - 0.05 }} color={MATERIAL.metal} edge={false} />
      ))}
      <Box g={{ x: it.x, y: it.y, z: it.h - 0.05, w: it.w, d: it.d, h: 0.05 }} color={MATERIAL.oak} top={it.color ?? MATERIAL.laminate} />
      <Notes x={it.x + 0.6} y={it.y + 0.85} z={it.h} />
      <Tablet x={it.x + 1.7} y={it.y + 0.55} z={it.h} />
      <Mug x={it.x + 2.1} y={it.y + 1.0} z={it.h} />
    </g>
  );
}

function FloorPatch({ it }: { it: FurnitureItem }) {
  return <polygon points={pts([[it.x, it.y, 0.005], [it.x + it.w, it.y, 0.005], [it.x + it.w, it.y + it.d, 0.005], [it.x, it.y + it.d, 0.005]])} fill={it.color ?? MATERIAL.concrete} />;
}

function Rug({ it }: { it: FurnitureItem }) {
  const c = it.color ?? '#c3c6ba';
  const r = 0.12;
  return (
    <g>
      <polygon points={pts([[it.x, it.y, 0.01], [it.x + it.w, it.y, 0.01], [it.x + it.w, it.y + it.d, 0.01], [it.x, it.y + it.d, 0.01]])} fill={c} />
      <polygon points={pts([[it.x + r, it.y + r, 0.01], [it.x + it.w - r, it.y + r, 0.01], [it.x + it.w - r, it.y + it.d - r, 0.01], [it.x + r, it.y + it.d - r, 0.01]])} fill="none" stroke={shade(c, -0.12)} strokeWidth={1} />
    </g>
  );
}

export function FurniturePiece({ it }: { it: FurnitureItem }) {
  switch (it.kind) {
    case 'floor-patch':
      return <FloorPatch it={it} />;
    case 'rug':
    case 'doormat':
      return <Rug it={it} />;
    case 'bench':
      return <Bench it={it} />;
    case 'task-chair':
      return <TaskChair it={it} />;
    case 'shelf':
      return <Shelf it={it} />;
    case 'coffee-counter':
      return <CoffeeCounter it={it} />;
    case 'plant':
      return <Plant it={it} tall={false} />;
    case 'tall-plant':
      return <Plant it={it} tall />;
    case 'floor-lamp':
      return <FloorLamp it={it} />;
    case 'meeting-table':
      return <MeetingTable it={it} />;
    case 'glass-x':
      return <Glass it={it} axis="x" />;
    case 'glass-y':
      return <Glass it={it} axis="y" />;
    case 'sofa':
      return <Sofa it={it} />;
    case 'low-table':
      return <LowTable it={it} />;
    case 'ottoman':
      return <Ottoman it={it} />;
    case 'high-table':
      return <HighTable it={it} />;
    case 'stool':
      return <Stool it={it} />;
  }
}
