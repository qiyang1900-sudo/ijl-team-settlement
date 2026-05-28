import { formatMonthlyNumber } from "@/lib/monthly-data";

export type MonthlyChartPoint = {
  label: string;
  barValue?: number;
  lineValue?: number;
};

type MonthlyComboChartProps = {
  points: MonthlyChartPoint[];
  title: string;
  barLabel?: string;
  lineLabel?: string;
  barColor?: string;
  lineColor?: string;
};

const width = 720;
const height = 360;
const padding = {
  top: 42,
  right: 82,
  bottom: 78,
  left: 72,
};

export default function MonthlyComboChart({
  points,
  title,
  barLabel = "数値",
  lineLabel = "推移",
  barColor = "#3b82f6",
  lineColor = "#ef4444",
}: MonthlyComboChartProps) {
  const safePoints = points.map((point) => ({
    label: point.label,
    barValue: safeNumber(point.barValue),
    lineValue: safeNumber(point.lineValue),
  }));
  const hasBars = safePoints.some((point) => point.barValue > 0);
  const hasLine = safePoints.some((point) => point.lineValue > 0);
  const barMax = Math.max(...safePoints.map((point) => point.barValue), 1);
  const lineMax = Math.max(...safePoints.map((point) => point.lineValue), 1);
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const slotWidth = safePoints.length > 0 ? plotWidth / safePoints.length : plotWidth;
  const barWidth = Math.min(20, Math.max(8, slotWidth * 0.48));
  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const lineCoords = safePoints.map((point, index) => {
    const x = padding.left + slotWidth * index + slotWidth / 2;
    const y = padding.top + (1 - point.lineValue / lineMax) * plotHeight;

    return { x, y, label: point.label, value: point.lineValue };
  });
  const linePath = lineCoords
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const xLabelEvery = Math.max(1, Math.ceil(safePoints.length / 12));

  if (safePoints.length === 0) {
    return (
      <section className="rounded-lg bg-white p-5 text-slate-600">
        <h3 className="text-center text-2xl font-bold text-slate-500">{title}</h3>
        <div className="mt-6 flex h-56 items-center justify-center text-sm">
          暂无月数据。
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg bg-white p-4 text-slate-900">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" className="w-full">
        <rect width={width} height={height} fill="#ffffff" />
        <text
          x={width / 2}
          y="30"
          textAnchor="middle"
          fill="#737373"
          fontSize="28"
          fontWeight="700"
        >
          {title}
        </text>

        {yTicks.map((tick) => {
          const y = padding.top + (1 - tick) * plotHeight;

          return (
            <g key={`grid-${tick}`}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="#d4d4d4"
                strokeWidth="1"
              />
              <text
                x={padding.left - 10}
                y={y + 4}
                textAnchor="end"
                fill="#262626"
                fontSize="12"
              >
                {formatMonthlyNumber(Math.round(barMax * tick))}
              </text>
              {hasLine ? (
                <text
                  x={width - padding.right + 10}
                  y={y + 4}
                  textAnchor="start"
                  fill="#262626"
                  fontSize="12"
                >
                  {formatMonthlyNumber(Math.round(lineMax * tick))}
                </text>
              ) : null}
            </g>
          );
        })}

        <line
          x1={padding.left}
          x2={padding.left}
          y1={padding.top}
          y2={height - padding.bottom}
          stroke="#a3a3a3"
        />
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={height - padding.bottom}
          y2={height - padding.bottom}
          stroke="#a3a3a3"
        />

        {hasBars
          ? safePoints.map((point, index) => {
              const x = padding.left + slotWidth * index + slotWidth / 2 - barWidth / 2;
              const barHeight = (point.barValue / barMax) * plotHeight;
              const y = padding.top + plotHeight - barHeight;

              return (
                <rect
                  key={`bar-${point.label}-${index}`}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  fill={barColor}
                  stroke="#111827"
                  strokeWidth="1"
                />
              );
            })
          : null}

        {hasLine && linePath ? (
          <path
            d={linePath}
            fill="none"
            stroke={lineColor}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {safePoints.map((point, index) =>
          index % xLabelEvery === 0 || index === safePoints.length - 1 ? (
            <text
              key={`label-${point.label}-${index}`}
              x={padding.left + slotWidth * index + slotWidth / 2}
              y={height - padding.bottom + 24}
              textAnchor="end"
              fill="#262626"
              fontSize="12"
              transform={`rotate(-60 ${padding.left + slotWidth * index + slotWidth / 2} ${height - padding.bottom + 24})`}
            >
              {point.label}
            </text>
          ) : null
        )}

        <g transform={`translate(${width / 2 - 120}, ${height - 20})`}>
          {hasBars ? (
            <>
              <rect x="0" y="-10" width="28" height="10" fill={barColor} stroke="#111827" />
              <text x="36" y="0" fill="#525252" fontSize="13">
                {barLabel}
              </text>
            </>
          ) : null}
          {hasLine ? (
            <>
              <line x1={hasBars ? 150 : 0} x2={hasBars ? 178 : 28} y1="-5" y2="-5" stroke={lineColor} strokeWidth="3" />
              <text x={hasBars ? 186 : 36} y="0" fill="#525252" fontSize="13">
                {lineLabel}
              </text>
            </>
          ) : null}
        </g>
      </svg>
    </section>
  );
}

function safeNumber(value: unknown) {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}
