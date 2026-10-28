// 家具の描画。厚み（3面の陰影）・床の影・小物で奥行きと生活感を出す。
import type { ReactNode } from 'react';
import { boxFaces, iso, pts, shade, shadowPts, type BoxGeom } from './iso.ts';
import { PALETTE, type FurnitureItem } from './layout.ts';
import type { DeskProp } from './appearance.ts';

export function Box({ g, color, top, edge = true }: { g: BoxGeom; color: string; top?: string; edge?: boolean }) {
  const f = boxFaces(g);
  const stroke = edge ? { stroke: 'rgba(40,25,10,.22)', strokeWidth: 0.6, strokeLinejoin: 'round' as const } : {};
  return (
    <g>
      <polygon points={f.left} fill={shade(color, -0.1)} {...stroke} />
      <polygon points={f.right} fill={shade(color, -0.3)} {...stroke} />
      <polygon points={f.top} fill={top ?? shade(color, 0.1)} {...stroke} />
    </g>
  );
}

export function Shadow({ g, spread = 0.22, opacity = 0.18 }: { g: BoxGeom; spread?: number; opacity?: number }) {
  return <polygon points={shadowPts(g, spread)} fill="#3b2a18" opacity={opacity} />;
}

const at = (x: number, y: number, z = 0) => {
  const [sx, sy] = iso(x, y, z);
  return `translate(${sx.toFixed(1)} ${sy.toFixed(1)})`;
};

export function Mug({ x, y, z, color = '#f4efe6' }: { x: number; y: number; z: number; color?: string }) {
  return (
    <g transform={at(x, y, z)}>
      <rect x={-3} y={-7} width={6} height={7} rx={1.2} fill={color} stroke="rgba(0,0,0,.25)" strokeWidth={0.5} />
      <ellipse cx={0} cy={-7} rx={3} ry={1.2} fill="#5a3a22" />
      <path d="M 3 -5.5 Q 5.6 -4.5 3 -2" fill="none" stroke={color} strokeWidth={1.2} />
      <path className="steam" d="M -1 -10 Q 0.5 -12 -0.5 -14 M 1.5 -10 Q 3 -12 2 -14" fill="none" stroke="#fff" strokeWidth={0.8} opacity={0.6} />
    </g>
  );
}

export function SmallPlant({ x, y, z, scale = 1 }: { x: number; y: number; z: number; scale?: number }) {
  return (
    <g transform={`${at(x, y, z)} scale(${scale})`}>
      <path d="M -4 0 L -5 -7 L 5 -7 L 4 0 Z" fill="#c8754a" />
      <ellipse cx={-3} cy={-11} rx={3} ry={5} fill={PALETTE.green} transform="rotate(-25 -3 -11)" />
      <ellipse cx={3} cy={-11} rx={3} ry={5} fill={PALETTE.greenDark} transform="rotate(25 3 -11)" />
      <ellipse cx={0} cy={-13} rx={2.6} ry={5.5} fill="#6fa363" />
    </g>
  );
}

function Books({ x, y, z, count = 3 }: { x: number; y: number; z: number; count?: number }) {
  const colors = ['#2f4f7a', '#b5533c', '#d9a440', '#4f7a5a', '#7a5a8a'];
  return (
    <g transform={at(x, y, z)}>
      {Array.from({ length: count }, (_, i) => (
        <g key={i} transform={`translate(0 ${-i * 2.6})`}>
          <path d="M -9 0 L 0 4.5 L 9 0 L 0 -4.5 Z" fill={colors[i % colors.length]} />
          <path d="M -9 0 L 0 4.5 L 0 6.8 L -9 2.3 Z" fill={shade(colors[i % colors.length], -0.25)} />
          <path d="M 0 4.5 L 9 0 L 9 2.3 L 0 6.8 Z" fill="#f1e8d6" />
        </g>
      ))}
    </g>
  );
}

function Notes({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <g transform={at(x, y, z)}>
      <path d="M -6 0 L 0 3 L 6 0 L 0 -3 Z" fill="#fff6a8" />
      <path d="M -2 -2 L 4 1 L 10 -2 L 4 -5 Z" fill="#ffc2c2" />
      <path d="M -4 0.4 L 1 2.9" stroke="#b9a85a" strokeWidth={0.5} />
    </g>
  );
}

function Lamp({ x, y, z, on }: { x: number; y: number; z: number; on: boolean }) {
  return (
    <g transform={at(x, y, z)}>
      {on && <circle cx={4} cy={-14} r={12} fill="#ffd38a" opacity={0.28} />}
      <ellipse cx={0} cy={0} rx={4} ry={1.8} fill="#3a3a3a" />
      <path d="M 0 0 L -1 -12 L 6 -17" fill="none" stroke="#3a3a3a" strokeWidth={1.3} />
      <path d="M 3 -20 L 10 -16 L 7 -12 Z" fill="#2f4f7a" />
    </g>
  );
}

function Figure({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <g transform={at(x, y, z)}>
      <rect x={-3} y={-8} width={6} height={8} rx={2} fill="#e0603a" />
      <circle cx={0} cy={-10.5} r={3.2} fill="#f2c84b" />
      <circle cx={-1.1} cy={-10.8} r={0.5} fill="#222" />
      <circle cx={1.1} cy={-10.8} r={0.5} fill="#222" />
    </g>
  );
}

function Magnifier({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <g transform={at(x, y, z)}>
      <path d="M 2 -1 L 8 2" stroke="#6e4a2c" strokeWidth={1.8} strokeLinecap="round" />
      <ellipse cx={-1} cy={-2} rx={4} ry={2.4} fill="#cfe8f5" stroke="#555" strokeWidth={0.9} />
    </g>
  );
}

/** ノートPC。人物は机の奥に座るため、手前からは蓋の背面が見える。working のときだけ光る。 */
export function Laptop({ x, y, z, working, color = '#c9ccd2' }: { x: number; y: number; z: number; working: boolean; color?: string }) {
  const base = boxFaces({ x: x - 0.32, y, z, w: 0.64, d: 0.42, h: 0.03 });
  const lid = pts([[x - 0.32, y, z + 0.03], [x + 0.32, y, z + 0.03], [x + 0.32, y + 0.05, z + 0.48], [x - 0.32, y + 0.05, z + 0.48]]);
  const [lx, ly] = iso(x, y + 0.03, z + 0.28);
  return (
    <g className={working ? 'laptop is-on' : 'laptop'}>
      {working && <polygon points={pts([[x - 0.5, y - 0.6, z + 0.02], [x + 0.5, y - 0.6, z + 0.02], [x + 0.5, y, z + 0.02], [x - 0.5, y, z + 0.02]])} fill="#9fd4ff" opacity={0.3} />}
      <polygon points={base.top} fill={shade(color, -0.05)} />
      <polygon points={lid} fill={color} stroke="rgba(0,0,0,.25)" strokeWidth={0.5} />
      <circle cx={lx} cy={ly} r={1.6} fill={working ? '#8fd0ff' : '#e9ecf0'} className={working ? 'led' : ''} />
    </g>
  );
}

function SecondMonitor({ x, y, z, working }: { x: number; y: number; z: number; working: boolean }) {
  const screen = pts([[x - 0.05, y - 0.35, z + 0.25], [x - 0.05, y + 0.35, z + 0.25], [x - 0.05, y + 0.35, z + 0.75], [x - 0.05, y - 0.35, z + 0.75]]);
  const [sx, sy] = iso(x, y, z);
  return (
    <g>
      <path d={`M ${sx} ${sy} l 0 -8`} stroke="#333" strokeWidth={2} />
      <polygon points={screen} fill={working ? '#1e3b57' : '#2f3238'} stroke="#1c1d20" strokeWidth={1} />
      {working && (
        <g className="code-lines">
          {[0.35, 0.47, 0.59].map((zz, i) => (
            <polygon key={zz} points={pts([[x - 0.06, y - 0.25, z + zz], [x - 0.06, y + 0.1 + i * 0.07, z + zz], [x - 0.06, y + 0.1 + i * 0.07, z + zz + 0.04], [x - 0.06, y - 0.25, z + zz + 0.04]])} fill="#8fd0ff" />
          ))}
        </g>
      )}
    </g>
  );
}

/** 社員の机。天板・脚・ノートPC・その社員らしい小物。 */
export function EmployeeDesk({
  desk,
  top,
  props,
  working,
}: {
  desk: { x: number; y: number; w: number; d: number };
  top: string;
  props: DeskProp[];
  working: boolean;
}) {
  const { x, y, w, d } = desk;
  const H = 0.74;
  const leg = '#6b5440';
  const spots: [number, number][] = [
    [x + 0.32, y + d - 0.3],
    [x + w - 0.3, y + d - 0.32],
    [x + w - 0.35, y + 0.35],
  ];
  const renderProp = (p: DeskProp, i: number): ReactNode => {
    const [px, py] = spots[i] ?? spots[0];
    switch (p) {
      case 'mug':
        return <Mug key={p} x={px} y={py} z={H} />;
      case 'plant':
        return <SmallPlant key={p} x={px} y={py} z={H} scale={0.9} />;
      case 'books':
        return <Books key={p} x={px} y={py} z={H} />;
      case 'notes':
        return <Notes key={p} x={px} y={py} z={H} />;
      case 'magnifier':
        return <Magnifier key={p} x={px} y={py} z={H} />;
      case 'figure':
        return <Figure key={p} x={px} y={py} z={H} />;
      case 'lamp':
        return <Lamp key={p} x={px} y={py} z={H} on={working} />;
      case 'second-monitor':
        return <SecondMonitor key={p} x={x + 0.25} y={y + 0.35} z={H} working={working} />;
    }
  };
  return (
    <g>
      <Shadow g={{ x, y, w, d, h: H }} />
      <Box g={{ x: x + 0.08, y: y + 0.1, z: 0, w: 0.1, d: d - 0.2, h: H - 0.06 }} color={leg} edge={false} />
      <Box g={{ x: x + w - 0.18, y: y + 0.1, z: 0, w: 0.1, d: d - 0.2, h: H - 0.06 }} color={leg} edge={false} />
      <Box g={{ x: x + 0.2, y: y + 0.12, z: 0.3, w: w - 0.4, d: 0.06, h: H - 0.36 }} color={shade(top, -0.2)} edge={false} />
      <Box g={{ x, y, z: H - 0.06, w, d, h: 0.06 }} color={top} />
      <Laptop x={x + w / 2} y={y + 0.12} z={H} working={working} />
      {props.map(renderProp)}
    </g>
  );
}

function Chair({ it }: { it: FurnitureItem }) {
  const c = it.color ?? PALETTE.navyDeep;
  const backFar = it.id.startsWith('mchair-3') || it.id.startsWith('mchair-4') ? false : true;
  const back = backFar
    ? { x: it.x, y: it.y - 0.02, z: 0.42, w: it.w, d: 0.12, h: 0.55 }
    : { x: it.x, y: it.y + it.d - 0.1, z: 0.42, w: it.w, d: 0.12, h: 0.5 };
  return (
    <g>
      <Shadow g={{ x: it.x, y: it.y, w: it.w, d: it.d, h: 0 }} opacity={0.12} />
      <Box g={{ x: it.x + it.w / 2 - 0.05, y: it.y + it.d / 2 - 0.05, w: 0.1, d: 0.1, h: 0.32 }} color="#3a3a3a" edge={false} />
      {backFar && <Box g={back} color={c} />}
      <Box g={{ x: it.x, y: it.y, z: 0.32, w: it.w, d: it.d, h: 0.1 }} color={c} />
      {!backFar && <Box g={back} color={c} />}
    </g>
  );
}

function Shelf({ it }: { it: FurnitureItem }) {
  const c = it.color ?? PALETTE.woodDark;
  const levels = [0.12, 0.72, 1.32, 1.92];
  const bookColors = ['#2f4f7a', '#b5533c', '#d9a440', '#4f7a5a', '#e9dcc2', '#7a5a8a', '#9fb7cc', '#c8754a'];
  const fx = it.x + it.w;
  return (
    <g>
      <Box g={{ x: it.x, y: it.y, w: it.w, d: it.d, h: it.h }} color={c} />
      {/* 正面（x 側）を開口部として描く */}
      <polygon points={pts([[fx, it.y + 0.08, 0.08], [fx, it.y + it.d - 0.08, 0.08], [fx, it.y + it.d - 0.08, it.h - 0.1], [fx, it.y + 0.08, it.h - 0.1]])} fill={shade(c, -0.45)} />
      {levels.map((lz, li) => {
        let yy = it.y + 0.14;
        const books: ReactNode[] = [];
        let k = 0;
        while (yy < it.y + it.d - 0.25) {
          const bw = 0.09 + ((li * 7 + k * 3) % 4) * 0.025;
          const bh = 0.38 + ((li * 5 + k * 11) % 5) * 0.03;
          const tilt = (li + k) % 9 === 4;
          const col = bookColors[(li * 3 + k) % bookColors.length];
          books.push(
            <polygon
              key={k}
              points={pts([[fx, yy, lz], [fx, yy + bw, lz], [fx, yy + bw + (tilt ? 0.12 : 0), lz + bh], [fx, yy + (tilt ? 0.12 : 0), lz + bh]])}
              fill={col}
              stroke="rgba(0,0,0,.18)"
              strokeWidth={0.4}
            />,
          );
          yy += bw + 0.015 + (k % 6 === 5 ? 0.18 : 0);
          k++;
        }
        return (
          <g key={lz}>
            {books}
            <polygon points={pts([[fx, it.y + 0.05, lz - 0.02], [fx, it.y + it.d - 0.05, lz - 0.02], [fx, it.y + it.d - 0.05, lz + 0.03], [fx, it.y + 0.05, lz + 0.03]])} fill={shade(c, 0.12)} />
          </g>
        );
      })}
    </g>
  );
}

function Plant({ it, tall }: { it: FurnitureItem; tall: boolean }) {
  const [bx, by] = iso(it.x + it.w / 2, it.y + it.d / 2, 0);
  const s = it.w * 30;
  const potH = tall ? s * 0.75 : s * 0.6;
  const leaves = tall
    ? [[-0.5, -2.3, 0.42, -30, PALETTE.greenDark], [0.5, -2.1, 0.42, 30, PALETTE.green], [0, -3.0, 0.4, 0, '#6fa363'], [-0.35, -3.6, 0.36, -18, PALETTE.green], [0.4, -3.4, 0.36, 22, PALETTE.greenDark], [0.05, -4.2, 0.32, 5, '#7bb06c']]
    : [[-0.45, -1.4, 0.36, -32, PALETTE.greenDark], [0.45, -1.4, 0.36, 32, PALETTE.green], [0, -1.9, 0.34, 0, '#6fa363']];
  return (
    <g>
      <ellipse cx={bx + 3} cy={by + 2} rx={s * 0.6} ry={s * 0.28} fill="#3b2a18" opacity={0.16} />
      {tall && <path d={`M ${bx} ${by - potH} L ${bx} ${by - s * 3.4}`} stroke="#5a4a2a" strokeWidth={1.5} />}
      <path d={`M ${bx - s * 0.42} ${by - potH} L ${bx - s * 0.32} ${by} L ${bx + s * 0.32} ${by} L ${bx + s * 0.42} ${by - potH} Z`} fill={tall ? '#e9e2d4' : '#c8754a'} stroke="rgba(0,0,0,.15)" strokeWidth={0.6} />
      <ellipse cx={bx} cy={by - potH} rx={s * 0.42} ry={s * 0.14} fill={tall ? '#d6cdbb' : '#a85e38'} />
      {leaves.map(([lx, ly, r, rot, col], i) => (
        <ellipse
          key={i}
          className="leaf"
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
      <ellipse cx={bx} cy={by} rx={7} ry={3} fill="#2e2e2e" />
      <path d={`M ${bx} ${by} L ${bx} ${topY + 6}`} stroke="#2e2e2e" strokeWidth={1.6} />
      <circle cx={bx} cy={topY + 6} r={22} fill="url(#lamp-glow)" />
      <path d={`M ${bx - 10} ${topY + 8} L ${bx - 6} ${topY - 6} L ${bx + 6} ${topY - 6} L ${bx + 10} ${topY + 8} Z`} fill="#f4e3c1" stroke="#c9a77c" strokeWidth={0.8} />
    </g>
  );
}

function Glass({ it, axis }: { it: FurnitureItem; axis: 'x' | 'y' }) {
  const len = axis === 'x' ? it.w : it.d;
  const seg = (a: number, b: number, z0: number, z1: number) =>
    axis === 'x'
      ? pts([[it.x + a, it.y, z0], [it.x + b, it.y, z0], [it.x + b, it.y, z1], [it.x + a, it.y, z1]])
      : pts([[it.x, it.y + a, z0], [it.x, it.y + b, z0], [it.x, it.y + b, z1], [it.x, it.y + a, z1]]);
  const mullions = Array.from({ length: Math.floor(len) + 1 }, (_, i) => Math.min(i * (len / Math.round(len)), len));
  return (
    <g className="glass">
      <polygon points={seg(0, len, 0, it.h)} fill="url(#glass-fill)" />
      <polygon points={seg(0, len, it.h - 0.08, it.h)} fill={PALETTE.navy} />
      <polygon points={seg(0, len, 0, 0.1)} fill={PALETTE.navy} />
      <polygon points={seg(0, len, 1.05, 1.18)} fill="#ffffff" opacity={0.35} />
      {mullions.map((m) => (
        <polygon key={m} points={seg(Math.max(0, m - 0.03), Math.min(len, m + 0.03), 0, it.h)} fill={PALETTE.navy} />
      ))}
    </g>
  );
}

function Sofa({ it }: { it: FurnitureItem }) {
  const c = it.color ?? PALETTE.navy;
  return (
    <g>
      <Shadow g={{ x: it.x, y: it.y, w: it.w, d: it.d, h: 0 }} />
      <Box g={{ x: it.x, y: it.y, w: it.w, d: 0.28, h: 0.95 }} color={c} />
      <Box g={{ x: it.x, y: it.y + 0.2, w: it.w, d: it.d - 0.2, h: 0.42 }} color={c} />
      {[0, 1, 2].map((i) => (
        <Box key={i} g={{ x: it.x + 0.12 + i * ((it.w - 0.24) / 3), y: it.y + 0.3, z: 0.42, w: (it.w - 0.24) / 3 - 0.06, d: it.d - 0.42, h: 0.12 }} color={shade(c, 0.12)} />
      ))}
      <Box g={{ x: it.x - 0.05, y: it.y, w: 0.25, d: it.d, h: 0.62 }} color={shade(c, -0.05)} />
      <Box g={{ x: it.x + it.w - 0.2, y: it.y, w: 0.25, d: it.d, h: 0.62 }} color={shade(c, -0.05)} />
      <Box g={{ x: it.x + 0.4, y: it.y + 0.25, z: 0.5, w: 0.45, d: 0.18, h: 0.38 }} color="#e0b25a" />
    </g>
  );
}

function Pouf({ it }: { it: FurnitureItem }) {
  const [cx, cy] = iso(it.x + it.w / 2, it.y + it.d / 2, 0);
  const rx = it.w * 26;
  const h = it.h * 30;
  const c = it.color ?? '#d48a4a';
  return (
    <g>
      <ellipse cx={cx + 3} cy={cy + 2} rx={rx} ry={rx * 0.5} fill="#3b2a18" opacity={0.15} />
      <path d={`M ${cx - rx} ${cy - h} L ${cx - rx} ${cy} A ${rx} ${rx * 0.5} 0 0 0 ${cx + rx} ${cy} L ${cx + rx} ${cy - h} Z`} fill={shade(c, -0.2)} />
      <ellipse cx={cx} cy={cy - h} rx={rx} ry={rx * 0.5} fill={c} />
    </g>
  );
}

function RoundTable({ it }: { it: FurnitureItem }) {
  const [cx, cy] = iso(it.x + it.w / 2, it.y + it.d / 2, 0);
  const rx = it.w * 24;
  const top = cy - it.h * 30;
  const c = it.color ?? PALETTE.wood;
  return (
    <g>
      <ellipse cx={cx + 3} cy={cy + 2} rx={rx * 0.8} ry={rx * 0.4} fill="#3b2a18" opacity={0.16} />
      <ellipse cx={cx} cy={cy} rx={8} ry={3.5} fill="#2e2e2e" />
      <path d={`M ${cx} ${cy} L ${cx} ${top}`} stroke="#2e2e2e" strokeWidth={2.4} />
      <path d={`M ${cx - rx} ${top} L ${cx - rx} ${top + 3} A ${rx} ${rx * 0.5} 0 0 0 ${cx + rx} ${top + 3} L ${cx + rx} ${top} Z`} fill={shade(c, -0.25)} />
      <ellipse cx={cx} cy={top} rx={rx} ry={rx * 0.5} fill={c} stroke="rgba(40,25,10,.22)" strokeWidth={0.6} />
      <Mug x={it.x + 0.3} y={it.y + 0.45} z={it.h} color="#c2553b" />
      <Mug x={it.x + 0.6} y={it.y + 0.35} z={it.h} />
    </g>
  );
}

function CoffeeTable({ it }: { it: FurnitureItem }) {
  const c = it.color ?? PALETTE.wood;
  return (
    <g>
      <Shadow g={{ x: it.x, y: it.y, w: it.w, d: it.d, h: 0 }} />
      <Box g={{ x: it.x + 0.15, y: it.y + 0.15, w: it.w - 0.3, d: it.d - 0.3, h: it.h - 0.06 }} color={shade(c, -0.25)} edge={false} />
      <Box g={{ x: it.x, y: it.y, z: it.h - 0.06, w: it.w, d: it.d, h: 0.06 }} color={c} />
      <Mug x={it.x + 0.45} y={it.y + 0.45} z={it.h} />
      <Mug x={it.x + 1.2} y={it.y + 0.6} z={it.h} color="#2f4f7a" />
      <Books x={it.x + 0.9} y={it.y + 0.3} z={it.h} count={2} />
    </g>
  );
}

function CoffeeCart({ it }: { it: FurnitureItem }) {
  const c = it.color ?? PALETTE.walnut;
  return (
    <g>
      <Shadow g={{ x: it.x, y: it.y, w: it.w, d: it.d, h: 0 }} />
      <Box g={{ x: it.x, y: it.y, w: it.w, d: it.d, h: it.h }} color={c} />
      <Box g={{ x: it.x + 0.15, y: it.y + 0.12, z: it.h, w: 0.45, d: 0.4, h: 0.55 }} color="#b9bec6" />
      <Box g={{ x: it.x + 0.2, y: it.y + 0.15, z: it.h + 0.55, w: 0.35, d: 0.3, h: 0.08 }} color="#2e2e2e" edge={false} />
      <Mug x={it.x + 0.6} y={it.y + 0.62} z={it.h} />
      <Mug x={it.x + 0.35} y={it.y + 0.66} z={it.h} color="#c2553b" />
    </g>
  );
}

function CeoDesk({ it, pending }: { it: FurnitureItem; pending: number }) {
  const c = it.color ?? PALETTE.walnut;
  const H = it.h;
  const [tx, ty] = iso(it.x + 0.55, it.y + it.d - 0.4, H);
  return (
    <g>
      <Shadow g={{ x: it.x, y: it.y, w: it.w, d: it.d, h: H }} spread={0.3} />
      <Box g={{ x: it.x + 0.05, y: it.y + 0.05, w: 0.35, d: it.d - 0.1, h: H - 0.06 }} color={shade(c, -0.1)} />
      <Box g={{ x: it.x + it.w - 0.75, y: it.y + 0.05, w: 0.7, d: it.d - 0.1, h: H - 0.06 }} color={shade(c, -0.1)} />
      <Box g={{ x: it.x + 0.4, y: it.y + it.d - 0.12, z: 0.18, w: it.w - 1.15, d: 0.06, h: H - 0.24 }} color={shade(c, -0.15)} edge={false} />
      <Box g={{ x: it.x, y: it.y, z: H - 0.08, w: it.w, d: it.d, h: 0.08 }} color={c} />
      <Laptop x={it.x + it.w / 2} y={it.y + 0.15} z={H} working={false} color="#2f3238" />
      {/* 書類トレイ：実際の承認待ちの件数だけ書類が積まれる（最大6枚） */}
      <g transform={`translate(${tx.toFixed(1)} ${ty.toFixed(1)})`}>
        <path d="M -10 0 L 0 5 L 10 0 L 0 -5 Z" fill="#3b3f4a" />
        {Array.from({ length: Math.min(pending, 6) }, (_, i) => (
          <path key={i} d={`M -8 ${-1.6 - i * 1.4} L 0 ${2.4 - i * 1.4} L 8 ${-1.6 - i * 1.4} L 0 ${-5.6 - i * 1.4} Z`} fill={i % 2 ? '#fffdf6' : '#f6efe0'} stroke="#d8cdb8" strokeWidth={0.4} />
        ))}
      </g>
      <Mug x={it.x + it.w - 0.45} y={it.y + it.d - 0.35} z={H} color="#24345a" />
      <SmallPlant x={it.x + it.w - 0.4} y={it.y + 0.3} z={H} scale={0.8} />
    </g>
  );
}

function Credenza({ it }: { it: FurnitureItem }) {
  const c = it.color ?? PALETTE.walnut;
  return (
    <g>
      <Box g={{ x: it.x, y: it.y, w: it.w, d: it.d, h: it.h }} color={c} />
      {[0.25, 1.05, 1.85].map((dx) => (
        <polygon key={dx} points={pts([[it.x + dx, it.y + it.d, 0.1], [it.x + dx + 0.7, it.y + it.d, 0.1], [it.x + dx + 0.7, it.y + it.d, it.h - 0.1], [it.x + dx, it.y + it.d, it.h - 0.1]])} fill={shade(c, -0.05)} stroke={shade(c, -0.35)} strokeWidth={0.6} />
      ))}
      <Books x={it.x + 0.6} y={it.y + 0.28} z={it.h} count={3} />
      <SmallPlant x={it.x + 2.5} y={it.y + 0.28} z={it.h} />
    </g>
  );
}

function Cabinet({ it }: { it: FurnitureItem }) {
  return (
    <g>
      <Shadow g={{ x: it.x, y: it.y, w: it.w, d: it.d, h: 0 }} />
      <Box g={{ x: it.x, y: it.y, w: it.w, d: it.d, h: it.h }} color={it.color ?? '#d9c3a0'} />
      <Box g={{ x: it.x + 0.15, y: it.y + 0.1, z: it.h, w: 0.75, d: 0.42, h: 0.22 }} color="#e8e8e8" />
      <Box g={{ x: it.x + 0.25, y: it.y + 0.15, z: it.h + 0.22, w: 0.5, d: 0.3, h: 0.03 }} color="#fffdf6" edge={false} />
    </g>
  );
}

function CoatRack({ it }: { it: FurnitureItem }) {
  const [bx, by] = iso(it.x + it.w / 2, it.y + it.d / 2, 0);
  const top = by - it.h * 30;
  return (
    <g>
      <ellipse cx={bx} cy={by} rx={8} ry={3.5} fill="#5a3a22" />
      <path d={`M ${bx} ${by} L ${bx} ${top}`} stroke="#5a3a22" strokeWidth={2} />
      <path d={`M ${bx - 7} ${top + 6} L ${bx} ${top + 2} L ${bx + 7} ${top + 6}`} fill="none" stroke="#5a3a22" strokeWidth={1.5} />
      <path d={`M ${bx + 6} ${top + 6} q 5 2 4 22 l -9 0 q -1 -14 5 -22 Z`} fill="#c2553b" />
      <path d={`M ${bx - 6} ${top + 6} q -4 4 -3 14 l 6 0 q 1 -8 -3 -14 Z`} fill="#2f4f7a" />
    </g>
  );
}

function FloorPatch({ it, inset = 0.12 }: { it: FurnitureItem; inset?: number }) {
  const c = it.color ?? PALETTE.navy;
  const outer = pts([[it.x, it.y, 0.01], [it.x + it.w, it.y, 0.01], [it.x + it.w, it.y + it.d, 0.01], [it.x, it.y + it.d, 0.01]]);
  const inner = pts([[it.x + inset, it.y + inset, 0.01], [it.x + it.w - inset, it.y + inset, 0.01], [it.x + it.w - inset, it.y + it.d - inset, 0.01], [it.x + inset, it.y + it.d - inset, 0.01]]);
  return (
    <g>
      <polygon points={outer} fill={c} />
      <polygon points={inner} fill="none" stroke={shade(c, 0.3)} strokeWidth={1.2} strokeDasharray="5 3" opacity={0.7} />
    </g>
  );
}

function Doormat({ it }: { it: FurnitureItem }) {
  const [ex, ey] = iso(it.x + 0.4, it.y + it.d - 0.2, 0.01);
  return (
    <g>
      <FloorPatch it={it} inset={0.1} />
      <text transform={`matrix(0.9 -0.45 0.9 0.45 ${ex.toFixed(1)} ${ey.toFixed(1)})`} className="mat-text">
        WELCOME
      </text>
    </g>
  );
}

function MeetingTable({ it }: { it: FurnitureItem }) {
  const c = it.color ?? '#d8bb92';
  return (
    <g>
      <Shadow g={{ x: it.x, y: it.y, w: it.w, d: it.d, h: 0 }} />
      <Box g={{ x: it.x + it.w / 2 - 0.25, y: it.y + it.d / 2 - 0.2, w: 0.5, d: 0.4, h: it.h - 0.06 }} color="#4a4a4a" edge={false} />
      <Box g={{ x: it.x, y: it.y, z: it.h - 0.06, w: it.w, d: it.d, h: 0.06 }} color={c} />
      <Notes x={it.x + 0.6} y={it.y + 0.9} z={it.h} />
      <Mug x={it.x + 1.9} y={it.y + 0.5} z={it.h} />
    </g>
  );
}

export function FurniturePiece({ it, pending }: { it: FurnitureItem; pending: number }) {
  switch (it.kind) {
    case 'rug':
      return <FloorPatch it={it} />;
    case 'doormat':
      return <Doormat it={it} />;
    case 'chair':
      return <Chair it={it} />;
    case 'ceo-desk':
      return <CeoDesk it={it} pending={pending} />;
    case 'credenza':
      return <Credenza it={it} />;
    case 'shelf':
      return <Shelf it={it} />;
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
    case 'pouf':
      return <Pouf it={it} />;
    case 'coffee-table':
      return <CoffeeTable it={it} />;
    case 'coffee-cart':
      return <CoffeeCart it={it} />;
    case 'coat-rack':
      return <CoatRack it={it} />;
    case 'cabinet':
      return <Cabinet it={it} />;
    case 'round-table':
      return <RoundTable it={it} />;
  }
}
