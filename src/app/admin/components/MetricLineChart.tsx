import { formatMonthlyNumber } from "@/lib/monthly-data";

export type MetricLinePoint = {
  label: string;
  value: number;
};

type MetricLineChartProps = {
  points: MetricLinePoint[];
  color?: string;
  valueFormatter?: (value: number) => string;
};

const chartWidth = 640;
const chartHeight = 220;
const padding = {
  top: 20,
  right: 28,
  bottom: 42,
  left: 62,
};

export default function MetricLineChart({
  points,
  color = "#38bdf8",
  valueFormatter = formatMonthlyNumber,
}: MetricLineChartProps) {
  const safePoints = points.map((point) => ({
    label: point.label,
    value: Number.isFinite(point.value) ? point.value : 0,
  }));
  const values = safePoints.map((point) => point.value);
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values, 0);
  const range = Math.max(maxValue - minValue, 1);
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;
  const xStep = safePoints.length > 1 ? plotWidth / (safePoints.length - 1) : 0;
  const coords = safePoints.map((point, index) => ({
    ...point,
    x: padding.left + index * xStep,
    y: padding.top + ((maxValue - point.value) / range) * plotHeight,
  }));
  const pathData = coords
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const xLabelEvery = Math.max(1, Math.ceil(safePoints.length / 6));
  const yTicks = [0, 0.5, 1].map((ratio) => {
    const value = minValue + range * ratio;
    return {
      value,
      y: padding.top + (1 - ratio) * plotHeight,
    };
  });

  if (safePoints.length === 0) {
    return (
      <div className="flex h-52 items-center justify-center rounded-lg bg-slate-950 text-sm text-slate-500">
        暂无月数据。
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg bg-slate-950 p-2">
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        role="img"
        className="h-56 w-full"
      >
        <rect width={chartWidth} height={chartHeight} rx="12" fill="#020617" />
        {yTicks.map((tick) => (
          <g key={`y-${tick.y}`}>
            <line
              x1={padding.left}
              x2={chartWidth - padding.right}
              y1={tick.y}
              y2={tick.y}
              stroke="#1e293b"
              strokeWidth="1"
            />
            <text
              x={padding.left - 10}
              y={tick.y + 4}
              textAnchor="end"
              fill="#94a3b8"
              fontSize="11"
            >
              {valueFormatter(Math.round(tick.value))}
            </text>
          </g>
        ))}
        <line
          x1={padding.left}
          x2={padding.left}
          y1={padding.top}
          y2={chartHeight - padding.bottom}
          stroke="#334155"
          strokeWidth="1"
        />
        <line
          x1={padding.left}
          x2={chartWidth - padding.right}
          y1={chartHeight - padding.bottom}
          y2={chartHeight - padding.bottom}
          stroke="#334155"
          strokeWidth="1"
        />
        {pathData ? (
          <path
            d={pathData}
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        {coords.map((point) => (
          <circle
            key={`${point.label}-${point.x}`}
            cx={point.x}
            cy={point.y}
            r="4"
            fill="#020617"
            stroke={color}
            strokeWidth="3"
          />
        ))}
        {coords.map((point, index) =>
          index % xLabelEvery === 0 || index === coords.length - 1 ? (
            <text
              key={`x-${point.label}-${index}`}
              x={point.x}
              y={chartHeight - 16}
              textAnchor="middle"
              fill="#94a3b8"
              fontSize="11"
            >
              {point.label}
            </text>
          ) : null
        )}
      </svg>
    </div>
  );
}
