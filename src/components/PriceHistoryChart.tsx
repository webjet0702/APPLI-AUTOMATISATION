"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatDate, formatEuro } from "@/lib/format";

// Évolution du prix unitaire d'un produit, en marches d'escalier : le prix reste
// le même jusqu'à l'achat suivant. Survol (ou flèches du clavier) = détail d'un achat.

type Point = { date: string; value: number };

const HEIGHT = 240;
const MARGIN = { top: 20, right: 20, bottom: 28, left: 64 };
const SERIES = "#2a78d6";
const GRID = "#e2e8f0";
const TEXT_MUTED = "#64748b";
const TEXT_PRIMARY = "#0f172a";
const SURFACE = "#ffffff";

/** Graduations « rondes » (1, 2, 2,5 ou 5 × 10ⁿ). */
function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const rough = (max - min) / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? rough;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

export function PriceHistoryChart({ points, unitLabel }: { points: Point[]; unitLabel: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const times = points.map((p) => Date.parse(p.date));
  const values = points.map((p) => p.value);
  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const plotW = width - MARGIN.left - MARGIN.right;
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;

  const x = (t: number) => MARGIN.left + (tMax === tMin ? plotW / 2 : ((t - tMin) / (tMax - tMin)) * plotW);
  const y = (v: number) => MARGIN.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  const coords = points.map((p, i) => ({ x: x(times[i]), y: y(p.value) }));
  const path = coords.map((c, i) => (i === 0 ? `M${c.x},${c.y}` : `H${c.x}V${c.y}`)).join("");
  const last = coords[coords.length - 1];
  const xLabels = points.length > 2 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : points.map((_, i) => i);

  function nearest(clientX: number, rect: DOMRect): number {
    const px = clientX - rect.left;
    let best = 0;
    coords.forEach((c, i) => {
      if (Math.abs(c.x - px) < Math.abs(coords[best].x - px)) best = i;
    });
    return best;
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    setActive(nearest(event.clientX, event.currentTarget.getBoundingClientRect()));
  }

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? points.length) - 1));
    if (event.key === "ArrowRight") setActive((a) => Math.min(points.length - 1, (a ?? -1) + 1));
  }

  const activePoint = active === null ? null : points[active];
  const activeCoord = active === null ? null : coords[active];

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={`Prix unitaire de ${formatEuro(values[0])} à ${formatEuro(values[values.length - 1])} par ${unitLabel}, ${points.length} achats. Flèches gauche et droite pour parcourir.`}
        tabIndex={0}
        className="touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        onPointerMove={onPointerMove}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive(points.length - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={onKeyDown}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={MARGIN.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={TEXT_MUTED} className="tabular-nums">
              {formatEuro(t)}
            </text>
          </g>
        ))}
        {xLabels.map((i) => (
          <text
            key={i}
            x={coords[i].x}
            y={HEIGHT - 8}
            textAnchor={i === 0 && points.length > 1 ? "start" : i === points.length - 1 && points.length > 1 ? "end" : "middle"}
            fontSize={11}
            fill={TEXT_MUTED}
          >
            {formatDate(points[i].date).slice(0, 5)}
          </text>
        ))}

        {activeCoord && (
          <line x1={activeCoord.x} x2={activeCoord.x} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} stroke="#94a3b8" strokeWidth={1} />
        )}

        <path d={path} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={active === i ? 5 : 4} fill={SERIES} stroke={SURFACE} strokeWidth={2} />
        ))}

        {active === null && (
          <text x={last.x} y={last.y - 12} textAnchor="end" fontSize={12} fontWeight={600} fill={TEXT_PRIMARY}>
            {formatEuro(values[values.length - 1])}
          </text>
        )}
      </svg>

      {activePoint && activeCoord && (
        <div
          className="pointer-events-none absolute rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-md"
          style={{
            left: Math.min(Math.max(activeCoord.x, 70), width - 70),
            top: Math.max(activeCoord.y - 64, 0),
            transform: "translateX(-50%)",
          }}
        >
          <p className="font-semibold text-slate-900 tabular-nums">
            {formatEuro(activePoint.value)}/{unitLabel}
          </p>
          <p className="text-xs text-slate-500">{formatDate(activePoint.date)}</p>
        </div>
      )}
    </div>
  );
}
