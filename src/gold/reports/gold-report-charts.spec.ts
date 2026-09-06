import { layoutLineChart } from './gold-report-charts';

describe('layoutLineChart', () => {
  it('expands a constant money domain instead of dividing by zero', () => {
    const layout = layoutLineChart({
      x: 48,
      y: 48,
      width: 400,
      height: 168,
      xLabels: ['30 Aug', '31 Aug', '01 Sep'],
      series: [
        { name: 'Invested capital', values: [879, 879, 879] },
        { name: 'Portfolio value', values: [879, 879, 879] },
      ],
      yKind: 'money',
    });
    expect(layout).not.toBeNull();
    for (const series of layout!.series) {
      expect(series.points).toHaveLength(3);
      for (const point of series.points) {
        expect(Number.isFinite(point.x)).toBe(true);
        expect(Number.isFinite(point.y)).toBe(true);
      }
    }
  });

  it('skips NaN/Infinity points and still lays out finite values', () => {
    const layout = layoutLineChart({
      x: 48,
      y: 48,
      width: 400,
      height: 168,
      xLabels: ['A', 'B', 'C'],
      series: [
        { name: 'PG BUY', values: [573, Number.NaN, 578] },
        { name: 'PG SELL', values: [625, Number.POSITIVE_INFINITY, 631] },
      ],
      yKind: 'money',
    });
    expect(layout).not.toBeNull();
    expect(layout!.series[0].points).toHaveLength(2);
    expect(
      layout!.series.every((row) =>
        row.points.every(
          (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
        ),
      ),
    ).toBe(true);
  });

  it('returns null for a one-point series', () => {
    expect(
      layoutLineChart({
        x: 48,
        y: 48,
        width: 400,
        height: 168,
        xLabels: ['26 Aug'],
        series: [{ name: 'Gold grams', values: [1.3215] }],
        yKind: 'grams',
      }),
    ).toBeNull();
  });
});
