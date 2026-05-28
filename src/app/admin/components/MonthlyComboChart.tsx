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
  showInsights?: boolean;
  insights?: ChartInsight[];
  insightEmptyText?: string;
};

export type ChartInsight = {
  key: string;
  tone: "up" | "down";
  message: string;
  detail?: string;
  label?: string;
  seriesLabel?: string;
  currentValue?: number;
  previousLabel?: string;
  previousValue?: number;
  changePercent?: number | null;
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
  showInsights = false,
  insights: providedInsights,
  insightEmptyText = "当前筛选期间内没有超过阈值的突然上升或下降。",
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
  const insights = showInsights
    ? providedInsights ?? buildChartInsights(safePoints, barLabel, lineLabel)
    : [];

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
      {showInsights ? (
        <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-slate-700">
            <span>图表数据分析</span>
            <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-500">
              {insights.length > 0 ? `${insights.length} 项提醒` : "无明显异常"} · 展开 / 收起
            </span>
          </summary>
          <div className="border-t border-slate-200 px-4 py-3">
            {insights.length === 0 ? (
              <p className="text-sm leading-6 text-slate-500">
                {insightEmptyText}
              </p>
            ) : (
              <div className="space-y-2">
                {insights.map((insight) => (
                  <div
                    key={insight.key}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      insight.tone === "up"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                        : "border-rose-200 bg-rose-50 text-rose-900"
                    }`}
                  >
                    <p className="font-semibold">{insight.message}</p>
                    {insight.detail ? (
                      <p className="mt-1 text-xs leading-5 opacity-75">
                        {insight.detail}
                      </p>
                    ) : insight.previousLabel && insight.label ? (
                      <p className="mt-1 text-xs opacity-75">
                        {insight.previousLabel}{" "}
                        {formatMonthlyNumber(insight.previousValue)} →{" "}
                        {insight.label} {formatMonthlyNumber(insight.currentValue)}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function buildChartInsights(
  points: Array<Required<MonthlyChartPoint>>,
  barLabel: string,
  lineLabel: string
): ChartInsight[] {
  const insights = [
    ...buildSeriesInsights(points, "barValue", barLabel, {
      up: 0.8,
      down: -0.6,
    }),
    ...buildSeriesInsights(points, "lineValue", lineLabel, {
      up: 0.5,
      down: -0.4,
    }),
  ];

  return insights
    .sort((left, right) => {
      const leftSeverity =
        left.changePercent === null || left.changePercent === undefined
          ? 10
          : Math.abs(left.changePercent);
      const rightSeverity =
        right.changePercent === null || right.changePercent === undefined
          ? 10
          : Math.abs(right.changePercent);

      return rightSeverity - leftSeverity;
    })
    .slice(0, 6);
}

function buildSeriesInsights(
  points: Array<Required<MonthlyChartPoint>>,
  key: "barValue" | "lineValue",
  seriesLabel: string,
  threshold: { up: number; down: number }
): ChartInsight[] {
  const insights: ChartInsight[] = [];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const previousValue = previous[key];
    const currentValue = current[key];

    if (previousValue <= 0 && currentValue <= 0) {
      continue;
    }

    if (previousValue > 0 && currentValue === 0) {
      insights.push({
        key: `${seriesLabel}-${current.label}-zero`,
        label: current.label,
        seriesLabel,
        currentValue,
        previousLabel: previous.label,
        previousValue,
        changePercent: null,
        tone: "down",
        message: `${current.label} 的 ${seriesLabel} 变为 0，建议确认是否漏录或平台数据缺失。`,
      });
      continue;
    }

    if (previousValue === 0 && currentValue > 0) {
      insights.push({
        key: `${seriesLabel}-${current.label}-from-zero`,
        label: current.label,
        seriesLabel,
        currentValue,
        previousLabel: previous.label,
        previousValue,
        changePercent: null,
        tone: "up",
        message: `${current.label} 的 ${seriesLabel} 从 0 恢复为有数据，建议确认是否为正常补录。`,
      });
      continue;
    }

    const changePercent = (currentValue - previousValue) / previousValue;

    if (changePercent >= threshold.up || changePercent <= threshold.down) {
      insights.push({
        key: `${seriesLabel}-${current.label}-${changePercent.toFixed(3)}`,
        label: current.label,
        seriesLabel,
        currentValue,
        previousLabel: previous.label,
        previousValue,
        changePercent,
        tone: changePercent > 0 ? "up" : "down",
        message: `${current.label} 的 ${seriesLabel} 较上月${
          changePercent > 0 ? "上升" : "下降"
        } ${formatSignedPercent(changePercent)}，建议人工确认原因。`,
      });
    }
  }

  return insights;
}

function formatSignedPercent(value: number) {
  const sign = value > 0 ? "+" : "";

  return `${sign}${(value * 100).toFixed(1)}%`;
}

function safeNumber(value: unknown) {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}
