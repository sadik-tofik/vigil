'use client';

import React, { useState, useMemo } from 'react';
import { BatchOrder } from '@/lib/types';
import { ChartLineUp, Crosshair, Sparkle, ShieldCheck, Info } from '@phosphor-icons/react';

interface Props {
  orders: BatchOrder[];
  clearingPrice?: number;
  matchedVolume?: number;
  oraclePrice: number;
  oracleMin: number;
  oracleMax: number;
  baseSymbol: string;
  quoteSymbol: string;
  isSettled?: boolean;
}

interface StepPoint {
  price: number;
  demand: number;
  supply: number;
  crossed: number;
}

export const CrossedAuctionCurve: React.FC<Props> = ({
  orders,
  clearingPrice = 0,
  matchedVolume = 0,
  oraclePrice,
  oracleMin,
  oracleMax,
  baseSymbol,
  quoteSymbol,
  isSettled = false,
}) => {
  const [hoveredPoint, setHoveredPoint] = useState<StepPoint | null>(null);

  // Filter active submitted orders
  const activeOrders = useMemo(() => orders.filter((o) => o.lotSize > 0), [orders]);

  // Calculate discrete cumulative demand D(p) and supply S(p)
  const { curveData, minPrice, maxPrice, maxVolume, pStar, qStar } = useMemo(() => {
    if (activeOrders.length === 0) {
      // Default placeholder curve based on oracle band
      const p1 = Number((oracleMin * 0.998).toFixed(2));
      const p2 = Number((oracleMin).toFixed(2));
      const p3 = Number((oraclePrice).toFixed(2));
      const p4 = Number((oracleMax).toFixed(2));
      const p5 = Number((oracleMax * 1.002).toFixed(2));
      return {
        curveData: [
          { price: p1, demand: 20, supply: 0, crossed: 0 },
          { price: p2, demand: 18, supply: 5, crossed: 5 },
          { price: p3, demand: 12, supply: 12, crossed: 12 },
          { price: p4, demand: 5, supply: 18, crossed: 5 },
          { price: p5, demand: 0, supply: 22, crossed: 0 },
        ],
        minPrice: p1,
        maxPrice: p5,
        maxVolume: 25,
        pStar: oraclePrice,
        qStar: 0,
      };
    }

    // Extract all unique candidate limit prices submitted in the auction ring
    const rawPrices = new Set<number>();
    activeOrders.forEach((o) => rawPrices.add(Number(o.limitPrice.toFixed(2))));
    rawPrices.add(Number(oracleMin.toFixed(2)));
    rawPrices.add(Number(oracleMax.toFixed(2)));
    rawPrices.add(Number(oraclePrice.toFixed(2)));

    const sortedPrices = Array.from(rawPrices).sort((a, b) => a - b);
    const pMin = Math.min(...sortedPrices) * 0.998;
    const pMax = Math.max(...sortedPrices) * 1.002;

    const allPrices = [pMin, ...sortedPrices, pMax].sort((a, b) => a - b);

    let calculatedMaxVolume = 0;
    let bestP = oraclePrice;
    let bestQ = 0;

    const data: StepPoint[] = allPrices.map((p) => {
      // D(p) = sum of bids with limit_price >= p
      const demand = activeOrders
        .filter((o) => o.side === 'bid' && o.limitPrice >= p - 0.0001)
        .reduce((sum, o) => sum + o.lotSize, 0);

      // S(p) = sum of asks with limit_price <= p
      const supply = activeOrders
        .filter((o) => o.side === 'ask' && o.limitPrice <= p + 0.0001)
        .reduce((sum, o) => sum + o.lotSize, 0);

      const crossed = Math.min(demand, supply);
      calculatedMaxVolume = Math.max(calculatedMaxVolume, demand, supply);

      if (crossed > bestQ) {
        bestQ = crossed;
        bestP = p;
      } else if (crossed === bestQ && crossed > 0) {
        // Tie-breaker: choose price closest to oracle reference price
        if (Math.abs(p - oraclePrice) < Math.abs(bestP - oraclePrice)) {
          bestP = p;
        }
      }

      return { price: p, demand, supply, crossed };
    });

    return {
      curveData: data,
      minPrice: pMin,
      maxPrice: pMax,
      maxVolume: Math.max(10, calculatedMaxVolume * 1.15),
      pStar: clearingPrice > 0 ? clearingPrice : bestP,
      qStar: matchedVolume > 0 ? matchedVolume : bestQ,
    };
  }, [activeOrders, clearingPrice, matchedVolume, oraclePrice, oracleMin, oracleMax]);

  // SVG dimensions
  const width = 640;
  const height = 260;
  const padding = { top: 24, right: 24, bottom: 36, left: 44 };

  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  // Scales
  const scaleX = (p: number) => {
    if (maxPrice <= minPrice) return padding.left + plotWidth / 2;
    return padding.left + ((p - minPrice) / (maxPrice - minPrice)) * plotWidth;
  };

  const scaleY = (v: number) => {
    if (maxVolume <= 0) return padding.top + plotHeight;
    return padding.top + plotHeight - (v / maxVolume) * plotHeight;
  };

  // Generate staircase path for Demand D(p)
  const demandPath = useMemo(() => {
    if (curveData.length === 0) return '';
    let d = '';
    for (let i = 0; i < curveData.length; i++) {
      const pt = curveData[i];
      const x = scaleX(pt.price);
      const y = scaleY(pt.demand);
      if (i === 0) {
        d += `M ${x} ${y}`;
      } else {
        const prevPt = curveData[i - 1];
        const prevY = scaleY(prevPt.demand);
        // Step horizontal then vertical
        d += ` L ${x} ${prevY} L ${x} ${y}`;
      }
    }
    return d;
  }, [curveData]);

  // Generate staircase path for Supply S(p)
  const supplyPath = useMemo(() => {
    if (curveData.length === 0) return '';
    let d = '';
    for (let i = 0; i < curveData.length; i++) {
      const pt = curveData[i];
      const x = scaleX(pt.price);
      const y = scaleY(pt.supply);
      if (i === 0) {
        d += `M ${x} ${y}`;
      } else {
        const prevPt = curveData[i - 1];
        const prevY = scaleY(prevPt.supply);
        // Step horizontal then vertical
        d += ` L ${x} ${prevY} L ${x} ${y}`;
      }
    }
    return d;
  }, [curveData]);

  // Coordinates of P* intersection
  const pStarX = scaleX(pStar);
  const qStarY = scaleY(qStar);

  // Confidence band boundary x coordinates
  const bandMinX = Math.max(padding.left, scaleX(oracleMin));
  const bandMaxX = Math.min(width - padding.right, scaleX(oracleMax));
  const oracleX = scaleX(oraclePrice);

  return (
    <div className="bg-neutral-100 border border-neutral-200 rounded-xl p-4 sm:p-5 flex flex-col justify-between shadow-2xl relative overflow-hidden transition-colors">
      {/* Top Header & Metrics */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-neutral-200 gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-signal-amber/10 border border-signal-amber/30 flex items-center justify-center text-signal-amber">
            <Crosshair size={14} weight="bold" />
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-[0.08em] text-neutral-900 font-bold font-sans flex items-center gap-2">
              <span>Uniform Clearing Crossing Board</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-150 border border-neutral-200 text-neutral-500 font-mono normal-case">
                Itayose Protocol
              </span>
            </h3>
            <span className="text-[10px] text-neutral-500/80 font-mono block">
              Cumulative Supply $S(p)$ vs Demand $D(p)$ · Zero Toxic MEV
            </span>
          </div>
        </div>

        {/* Real-time equilibrium badges */}
        <div className="flex items-center gap-2.5 font-mono text-xs">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-neutral-150 border border-neutral-200">
            <span className="text-neutral-500/80 text-[10px] uppercase">Clearing Price (P*):</span>
            <span className="font-bold text-signal-amber text-sm tabular-nums">
              ${pStar.toFixed(2)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-neutral-150 border border-neutral-200">
            <span className="text-neutral-500/80 text-[10px] uppercase">Matched (Q*):</span>
            <span className="font-bold text-signal-green text-sm tabular-nums">
              {qStar} {baseSymbol}
            </span>
          </div>
        </div>
      </div>

      {/* SVG Interactive Chart Canvas */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto select-none"
          style={{ maxHeight: '280px' }}
        >
          <defs>
            {/* Shaded clearing volume gradient */}
            <linearGradient id="clearingVolumeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.02" />
            </linearGradient>

            {/* Oracle Confidence Band Fill */}
            <linearGradient id="oracleBandGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Background grid lines */}
          {[0.25, 0.5, 0.75, 1.0].map((frac) => {
            const y = padding.top + plotHeight * (1 - frac);
            const val = Math.round(maxVolume * frac);
            return (
              <g key={frac}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="#1F2430"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <text
                  x={padding.left - 6}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="9"
                  fill="#6B7280"
                  fontFamily="monospace"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Pyth Confidence Band [P_min, P_max] Shaded Envelope */}
          {bandMaxX > bandMinX && (
            <rect
              x={bandMinX}
              y={padding.top}
              width={bandMaxX - bandMinX}
              height={plotHeight}
              fill="url(#oracleBandGradient)"
              stroke="#8B5CF6"
              strokeWidth="0.75"
              strokeDasharray="2 2"
            />
          )}

          {/* Pyth Reference Price Anchor Line */}
          {oracleX >= padding.left && oracleX <= width - padding.right && (
            <g>
              <line
                x1={oracleX}
                y1={padding.top}
                x2={oracleX}
                y2={padding.top + plotHeight}
                stroke="#8B5CF6"
                strokeWidth="1.2"
                strokeDasharray="4 2"
              />
              <text
                x={oracleX}
                y={padding.top - 6}
                textAnchor="middle"
                fontSize="9"
                fill="#8B5CF6"
                fontFamily="monospace"
                fontWeight="bold"
              >
                P_ref ${oraclePrice.toFixed(2)}
              </text>
            </g>
          )}

          {/* Shaded Cleared Volume Area below P* and Q* */}
          {qStar > 0 && (
            <rect
              x={padding.left}
              y={qStarY}
              width={Math.max(0, pStarX - padding.left)}
              height={padding.top + plotHeight - qStarY}
              fill="url(#clearingVolumeGradient)"
            />
          )}

          {/* Cumulative Demand Curve (Emerald staircase) */}
          <path
            d={demandPath}
            fill="none"
            stroke="#10B981"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />

          {/* Cumulative Supply Curve (Crimson staircase) */}
          <path
            d={supplyPath}
            fill="none"
            stroke="#EF4444"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />

          {/* Clearing Price Equilibrium P* Vertical Beacon */}
          {qStar > 0 && (
            <g>
              <line
                x1={pStarX}
                y1={padding.top}
                x2={pStarX}
                y2={padding.top + plotHeight}
                stroke="#F59E0B"
                strokeWidth="2"
                strokeDasharray="5 3"
              />
              {/* Intersection circle */}
              <circle
                cx={pStarX}
                cy={qStarY}
                r="6"
                fill="#F59E0B"
                stroke="#0E1117"
                strokeWidth="2"
              />
              <circle
                cx={pStarX}
                cy={qStarY}
                r="10"
                fill="none"
                stroke="#F59E0B"
                strokeWidth="1"
                className="animate-ping opacity-75"
              />
            </g>
          )}

          {/* X Axis Baseline */}
          <line
            x1={padding.left}
            y1={padding.top + plotHeight}
            x2={width - padding.right}
            y2={padding.top + plotHeight}
            stroke="#2E3444"
            strokeWidth="1"
          />

          {/* Price X-Axis Ticks */}
          {curveData
            .filter((_, idx) => idx % Math.max(1, Math.floor(curveData.length / 5)) === 0)
            .map((pt, i) => {
              const x = scaleX(pt.price);
              if (x < padding.left || x > width - padding.right) return null;
              return (
                <g key={i}>
                  <line
                    x1={x}
                    y1={padding.top + plotHeight}
                    x2={x}
                    y2={padding.top + plotHeight + 4}
                    stroke="#4B5563"
                    strokeWidth="1"
                  />
                  <text
                    x={x}
                    y={padding.top + plotHeight + 16}
                    textAnchor="middle"
                    fontSize="9"
                    fill="#9CA3AF"
                    fontFamily="monospace"
                  >
                    ${pt.price.toFixed(2)}
                  </text>
                </g>
              );
            })}

          {/* Interactive Hover Hit Zones */}
          {curveData.map((pt, i) => {
            const x = scaleX(pt.price);
            return (
              <rect
                key={i}
                x={x - 10}
                y={padding.top}
                width="20"
                height={plotHeight}
                fill="transparent"
                className="cursor-crosshair"
                onMouseEnter={() => setHoveredPoint(pt)}
                onMouseLeave={() => setHoveredPoint(null)}
              />
            );
          })}
        </svg>

        {/* Hover Inspector Tooltip */}
        {hoveredPoint && (
          <div className="absolute top-2 right-2 bg-neutral-150/95 border border-neutral-200 p-2.5 rounded-lg text-xs font-mono shadow-xl backdrop-blur-sm z-20 pointer-events-none">
            <div className="text-neutral-900 font-bold border-b border-neutral-200 pb-1 mb-1">
              Candidate: ${hoveredPoint.price.toFixed(2)}
            </div>
            <div className="text-signal-green flex justify-between gap-3">
              <span>Demand D(p):</span>
              <span className="font-bold">{hoveredPoint.demand} {baseSymbol}</span>
            </div>
            <div className="text-signal-red flex justify-between gap-3">
              <span>Supply S(p):</span>
              <span className="font-bold">{hoveredPoint.supply} {baseSymbol}</span>
            </div>
            <div className="text-signal-amber flex justify-between gap-3 pt-1 border-t border-neutral-200 mt-1 font-bold">
              <span>Crossed Q(p):</span>
              <span>{hoveredPoint.crossed} {baseSymbol}</span>
            </div>
          </div>
        )}
      </div>

      {/* Legend & Theoretical Invariant Explainers */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-neutral-200 text-[11px] font-mono mt-2">
        <div className="flex items-center gap-1.5 text-signal-green">
          <span className="w-2.5 h-1 bg-signal-green rounded-full inline-block" />
          <span>Demand Curve D(p)</span>
        </div>

        <div className="flex items-center gap-1.5 text-signal-red">
          <span className="w-2.5 h-1 bg-signal-red rounded-full inline-block" />
          <span>Supply Curve S(p)</span>
        </div>

        <div className="flex items-center gap-1.5 text-signal-amber">
          <span className="w-2 h-2 rounded-full border border-signal-amber bg-signal-amber/30 inline-block" />
          <span>Equilibrium (P*, Q*)</span>
        </div>

        <div className="flex items-center gap-1.5 text-signal-violet">
          <span className="w-2.5 h-2 rounded-sm border border-signal-violet bg-signal-violet/20 inline-block" />
          <span>Pyth Band [P_min, P_max]</span>
        </div>
      </div>

      {/* Novelty callout note */}
      <div className="mt-2.5 p-2 rounded bg-neutral-50 border border-neutral-200 text-[10px] text-neutral-500 font-mono flex items-center justify-between">
        <span className="flex items-center gap-1">
          <Info size={13} className="text-signal-amber" />
          <span>Uniform Price Mechanism: All participants clear at the identical price $P^*$, neutralizing front-running priority.</span>
        </span>
        <span className="text-signal-cyan font-semibold hidden md:inline">
          Tie-Break Anchor: Pyth $P_ref
        </span>
      </div>
    </div>
  );
};
