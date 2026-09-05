export type ChartSeriesLayout = {
  name: string;
  color: string;
  points: { x: number; y: number }[];
};

export type ChartLayout = {
  axis: { x1: number; y1: number; x2: number; y2: number };
  yTicks: { y: number; label: string }[];
  xTicks: { x: number; label: string }[];
  series: ChartSeriesLayout[];
};

const COLORS = ['#0F766E', '#2563EB', '#B45309'];

function pickXLabels(labels: string[]): { index: number; label: string }[] {
  if (labels.length <= 4) {
    return labels.map((label, index) => ({ index, label }));
  }
  const last = labels.length - 1;
  const mid = Math.round(last / 2);
  return [
    { index: 0, label: labels[0] },
    { index: mid, label: labels[mid] },
    { index: last, label: labels[last] },
  ];
}

function formatTick(value: number, kind: 'money' | 'grams'): string {
  if (kind === 'grams') {
    return value.toFixed(4);
  }
  return value.toLocaleString('en-MY', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function layoutLineChart(input: {
  x: number;
  y: number;
  width: number;
  height: number;
  xLabels: string[];
  series: { name: string; values: number[] }[];
  yKind: 'money' | 'grams';
}): ChartLayout | null {
  const values = input.series.flatMap((row) => row.values);
  if (input.xLabels.length < 2 || values.length === 0) {
    return null;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, input.yKind === 'grams' ? 0.0001 : 1);
  const pad = 8;
  const left = input.x + 48;
  const right = input.x + input.width - pad;
  const top = input.y + pad;
  const bottom = input.y + input.height - 22;
  const innerW = Math.max(1, right - left);
  const innerH = Math.max(1, bottom - top);
  const count = input.xLabels.length;
  const xAt = (index: number) =>
    count === 1 ? left + innerW / 2 : left + (index / (count - 1)) * innerW;
  const yAt = (value: number) => top + innerH - ((value - min) / span) * innerH;

  const yTicks = [0, 1, 2, 3].map((step) => {
    const value = min + (span * step) / 3;
    return { y: yAt(value), label: formatTick(value, input.yKind) };
  });

  return {
    axis: { x1: left, y1: bottom, x2: right, y2: top },
    yTicks,
    xTicks: pickXLabels(input.xLabels).map((item) => ({
      x: xAt(item.index),
      label: item.label,
    })),
    series: input.series.map((row, index) => ({
      name: row.name,
      color: COLORS[index % COLORS.length],
      points: row.values.map((value, i) => ({ x: xAt(i), y: yAt(value) })),
    })),
  };
}
