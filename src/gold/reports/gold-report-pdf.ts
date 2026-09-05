import PDFDocument from 'pdfkit';
import { layoutLineChart } from './gold-report-charts';
import {
  FOOTER_DISCLAIMER,
  FOOTER_PRODUCT,
  type GoldSnapshotReportData,
  type GoldStrategyReportData,
  type ReportKv,
  type ReportLineChart,
  type ReportPeriodStats,
  type ReportPriceRow,
  type ReportPurchaseRow,
} from './gold-report.types';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const FOOTER_Y = PAGE_H - 36;
const CONTENT_BOTTOM = PAGE_H - 58;
const CONTENT_W = PAGE_W - MARGIN * 2;
const TEXT = '#1F2937';
const MUTED = '#6B7280';
const RULE = '#D1D5DB';
const ACCENT = '#0F766E';

type ReportData = GoldSnapshotReportData | GoldStrategyReportData;

export async function renderGoldReportPdf(data: ReportData): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    bufferPages: true,
    compress: false,
    margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: 56 },
    info: {
      Title: data.title,
      Author: 'Finance App Gold Module',
      Creator: 'Finance App Gold Module',
    },
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const painter = new PdfPainter(doc);
  if (data.kind === 'SNAPSHOT') {
    paintSnapshot(painter, data);
  } else {
    paintStrategy(painter, data);
  }
  paintFooters(doc, data.title);
  doc.end();
  return done;
}

class PdfPainter {
  y: number;

  constructor(readonly doc: PDFKit.PDFDocument) {
    this.y = MARGIN;
  }

  get width(): number {
    return CONTENT_W;
  }

  ensure(height: number): boolean {
    if (this.y + height > CONTENT_BOTTOM) {
      this.doc.addPage();
      this.y = MARGIN;
      return true;
    }
    return false;
  }

  gap(size = 10): void {
    this.y += size;
  }

  rule(): void {
    this.ensure(8);
    this.doc.save();
    this.doc.strokeColor(RULE).lineWidth(0.6);
    this.doc
      .moveTo(MARGIN, this.y)
      .lineTo(MARGIN + CONTENT_W, this.y)
      .stroke();
    this.doc.restore();
    this.y += 8;
  }

  title(text: string): void {
    this.ensure(28);
    this.doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .fillColor(ACCENT)
      .text(text, MARGIN, this.y, {
        width: CONTENT_W,
      });
    this.y = this.doc.y + 6;
  }

  heading(text: string, keepWith = 0): void {
    this.ensure(22 + keepWith);
    this.y += 6;
    this.doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor(ACCENT)
      .text(text, MARGIN, this.y, {
        width: CONTENT_W,
      });
    this.y = this.doc.y + 4;
    this.rule();
  }

  body(text: string): void {
    this.ensure(24);
    this.doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(TEXT)
      .text(text, MARGIN, this.y, {
        width: CONTENT_W,
        lineGap: 2,
      });
    this.y = this.doc.y + 6;
  }

  muted(text: string): void {
    this.ensure(18);
    this.doc
      .font('Helvetica-Oblique')
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(text, MARGIN, this.y, {
        width: CONTENT_W,
        lineGap: 2,
      });
    this.y = this.doc.y + 6;
  }

  kvGrid(rows: ReportKv[], columns = 2): void {
    const colW = (CONTENT_W - 12) / columns;
    const rowH = 28;
    for (let i = 0; i < rows.length; i += columns) {
      this.ensure(rowH);
      for (let c = 0; c < columns; c += 1) {
        const row = rows[i + c];
        if (!row) {
          continue;
        }
        const x = MARGIN + c * (colW + 12);
        this.doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor(MUTED)
          .text(row.label, x, this.y, {
            width: colW,
          });
        this.doc
          .font('Helvetica-Bold')
          .fontSize(9)
          .fillColor(TEXT)
          .text(row.value, x, this.y + 11, {
            width: colW,
          });
      }
      this.y += rowH;
    }
  }
}

function paintSnapshot(
  painter: PdfPainter,
  data: GoldSnapshotReportData,
): void {
  painter.title(data.title);
  painter.kvGrid([
    { label: 'Generated', value: data.generatedAtLabel },
    { label: 'Portfolio data timestamp', value: data.portfolioAsOfLabel },
    { label: 'Latest Public Gold price', value: data.latestPriceAtLabel },
  ]);
  painter.heading('Current Portfolio');
  painter.kvGrid(data.currentPortfolio);
  painter.heading('Current Public Gold Price');
  painter.kvGrid(data.currentPrice, 1);
  painter.heading('Price Analytics Summary');
  if (data.priceAnalyticsNote) {
    painter.muted(data.priceAnalyticsNote);
  }
  painter.kvGrid(data.priceAnalytics, 1);
  painter.heading('Portfolio Analytics Summary');
  painter.kvGrid(data.portfolioAnalytics, 1);
  painter.heading('Important Note');
  painter.body(data.importantNote);
}

function paintStrategy(
  painter: PdfPainter,
  data: GoldStrategyReportData,
): void {
  painter.title(data.title);
  painter.muted(`Report range: ${rangeLabel(data.requestedRange)}`);
  painter.heading('1. Executive Summary');
  painter.kvGrid(data.executiveSummary);
  painter.heading('2. Current Portfolio');
  if (data.valuationNote) {
    painter.muted(data.valuationNote);
  }
  painter.kvGrid(data.currentPortfolio);
  painter.heading('3. Cost Basis & Break-even');
  painter.kvGrid(data.costBasis);
  if (data.breakEvenState) {
    painter.body(data.breakEvenState);
  }
  painter.heading('4. Public Gold Price Analytics');
  if (data.overlapNote) {
    painter.muted(data.overlapNote);
  }
  for (const period of data.periodStats) {
    paintPeriod(painter, period);
  }
  if (data.priceTrendChart) {
    painter.ensure(220);
    paintChart(painter, data.priceTrendChart);
  } else if (data.priceTrendTable) {
    painter.muted(
      'A line chart is not shown because fewer than two daily closing observations are available.',
    );
    painter.kvGrid(data.priceTrendTable);
  }
  if (data.portfolioValueChart) {
    painter.ensure(280);
  }
  painter.heading('5. Portfolio Value History');
  painter.muted(data.assumptions[1] ?? '');
  if (data.portfolioValueChart) {
    paintChart(painter, data.portfolioValueChart);
  } else {
    painter.muted(
      'More price history is needed for a portfolio value trend chart.',
    );
  }
  if (data.holdingsChart) {
    painter.ensure(280);
  }
  painter.heading('6. Holdings Growth');
  if (data.holdingsChart) {
    paintChart(painter, data.holdingsChart);
  } else if (data.holdingsSummary) {
    painter.muted(
      'A line chart is not shown because only one holdings observation is available.',
    );
    painter.kvGrid(data.holdingsSummary);
  } else {
    painter.muted('No Gold holdings growth to chart.');
  }
  painter.heading('7. Purchase Performance');
  paintPurchaseTable(painter, data.purchases);
  if (data.highestReturn) {
    painter.body('Highest return purchase');
    painter.kvGrid(data.highestReturn);
  }
  if (data.lowestReturn) {
    painter.body('Lowest return purchase');
    painter.kvGrid(data.lowestReturn);
  }
  painter.heading('8. Price History');
  if (data.priceHistoryTruncationNote) {
    painter.muted(data.priceHistoryTruncationNote);
  }
  paintPriceTable(painter, data.priceHistory);
  painter.heading('9. Data Quality & Assumptions');
  painter.kvGrid(data.dataQuality, 1);
  for (const note of data.assumptions) {
    painter.body(note);
  }
}

function rangeLabel(range: string): string {
  if (range === 'D7') {
    return '7D';
  }
  if (range === 'D30') {
    return '30D';
  }
  if (range === 'D90') {
    return '90D';
  }
  return 'ALL';
}

function paintPeriod(painter: PdfPainter, period: ReportPeriodStats): void {
  painter.body(`${rangeLabel(period.range)} statistics`);
  painter.kvGrid(
    [
      { label: 'Price change PG BUY', value: period.buyChange },
      { label: 'Price change PG SELL', value: period.sellChange },
      { label: 'PG BUY high', value: period.buyHigh },
      { label: 'PG BUY low', value: period.buyLow },
      { label: 'Average PG BUY', value: period.buyAverage },
      { label: 'PG SELL high', value: period.sellHigh },
      { label: 'PG SELL low', value: period.sellLow },
      { label: 'Average PG SELL', value: period.sellAverage },
      { label: 'Sample count', value: String(period.sampleCount) },
      {
        label: 'Date range',
        value:
          period.fromDate && period.toDate
            ? `${period.fromDate} to ${period.toDate}`
            : period.range === 'ALL'
              ? 'All available observations'
              : 'Unavailable',
      },
    ],
    1,
  );
  if (!period.hasSufficientHistory) {
    painter.muted('Limited price history is currently available.');
  }
}

function paintChart(painter: PdfPainter, chart: ReportLineChart): void {
  const height = 168;
  painter.ensure(height + 28);
  painter.doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(TEXT)
    .text(chart.title, MARGIN, painter.y, {
      width: CONTENT_W,
    });
  painter.y = painter.doc.y + 4;
  const layout = layoutLineChart({
    x: MARGIN,
    y: painter.y,
    width: CONTENT_W,
    height,
    xLabels: chart.xLabels,
    series: chart.series,
    yKind: chart.yKind,
  });
  if (!layout) {
    painter.muted('Chart data is not available.');
    return;
  }
  const doc = painter.doc;
  doc.save();
  doc.strokeColor(RULE).lineWidth(0.7);
  doc
    .moveTo(layout.axis.x1, layout.axis.y1)
    .lineTo(layout.axis.x2, layout.axis.y1)
    .stroke();
  doc
    .moveTo(layout.axis.x1, layout.axis.y1)
    .lineTo(layout.axis.x1, layout.axis.y2)
    .stroke();
  doc.font('Helvetica').fontSize(7).fillColor(MUTED);
  for (const tick of layout.yTicks) {
    doc.text(tick.label, MARGIN, tick.y - 4, { width: 46, align: 'right' });
  }
  for (const tick of layout.xTicks) {
    doc.text(tick.label, tick.x - 30, layout.axis.y1 + 4, {
      width: 60,
      align: 'center',
    });
  }
  for (const series of layout.series) {
    if (series.points.length === 0) {
      continue;
    }
    doc.strokeColor(series.color).lineWidth(1.6);
    doc.moveTo(series.points[0].x, series.points[0].y);
    for (let i = 1; i < series.points.length; i += 1) {
      doc.lineTo(series.points[i].x, series.points[i].y);
    }
    doc.stroke();
  }
  doc.restore();
  let legendX = MARGIN;
  const legendY = painter.y + height + 4;
  for (const series of layout.series) {
    doc.save();
    doc.rect(legendX, legendY, 8, 8).fill(series.color);
    doc.restore();
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(TEXT)
      .text(series.name, legendX + 12, legendY - 1);
    legendX += 110;
  }
  painter.y = legendY + 18;
}

function paintPurchaseTable(
  painter: PdfPainter,
  rows: ReportPurchaseRow[],
): void {
  if (rows.length === 0) {
    painter.muted('No active Gold holdings.');
    return;
  }
  const cols = [
    { key: 'purchaseDate' as const, label: 'Date', w: 62 },
    { key: 'weightGrams' as const, label: 'Weight (g)', w: 58 },
    { key: 'invested' as const, label: 'Invested', w: 58 },
    { key: 'buyPricePerGram' as const, label: 'Buy/g', w: 58 },
    { key: 'currentValue' as const, label: 'Current', w: 58 },
    { key: 'plRm' as const, label: 'P/L RM', w: 58 },
    { key: 'plPercent' as const, label: 'P/L %', w: 42 },
    { key: 'source' as const, label: 'Source', w: 55 },
  ];
  paintTableHeader(painter, cols);
  for (const row of rows) {
    const values = cols.map((col) => row[col.key]);
    if (painter.ensure(16)) {
      paintTableHeader(painter, cols);
    }
    paintTableRow(painter, cols, values);
  }
}

function paintPriceTable(painter: PdfPainter, rows: ReportPriceRow[]): void {
  if (rows.length === 0) {
    painter.muted('No confirmed price history available.');
    return;
  }
  const cols = [
    { key: 'when' as const, label: 'Date/Time', w: 130 },
    { key: 'pgSell' as const, label: 'PG SELL', w: 85 },
    { key: 'pgBuy' as const, label: 'PG BUY', w: 85 },
    { key: 'spread' as const, label: 'Spread', w: 75 },
    { key: 'source' as const, label: 'Source', w: 80 },
  ];
  paintTableHeader(painter, cols);
  for (const row of rows) {
    const values = cols.map((col) => row[col.key]);
    if (painter.ensure(16)) {
      paintTableHeader(painter, cols);
    }
    paintTableRow(painter, cols, values);
  }
}

function paintTableHeader(
  painter: PdfPainter,
  cols: { label: string; w: number }[],
): void {
  painter.ensure(18);
  let x = MARGIN;
  painter.doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED);
  for (const col of cols) {
    painter.doc.text(col.label, x, painter.y, { width: col.w });
    x += col.w;
  }
  painter.y += 12;
  painter.rule();
}

function paintTableRow(
  painter: PdfPainter,
  cols: { w: number }[],
  values: string[],
): void {
  let x = MARGIN;
  painter.doc.font('Helvetica').fontSize(7.5).fillColor(TEXT);
  for (let i = 0; i < cols.length; i += 1) {
    painter.doc.text(values[i] ?? '', x, painter.y, {
      width: cols[i].w - 4,
      ellipsis: true,
    });
    x += cols[i].w;
  }
  painter.y += 14;
}

function paintFooters(doc: PDFKit.PDFDocument, title: string): void {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    const previousBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.save();
    doc.strokeColor(RULE).lineWidth(0.5);
    doc
      .moveTo(MARGIN, FOOTER_Y - 10)
      .lineTo(PAGE_W - MARGIN, FOOTER_Y - 10)
      .stroke();
    doc.font('Helvetica').fontSize(7).fillColor(MUTED);
    doc.text(title, MARGIN, FOOTER_Y - 8, { width: 180, lineBreak: false });
    doc.text(FOOTER_PRODUCT, MARGIN, FOOTER_Y + 2, {
      width: CONTENT_W - 90,
      lineBreak: false,
    });
    doc.text(
      `Page ${i + 1} of ${range.count}`,
      PAGE_W - MARGIN - 80,
      FOOTER_Y + 2,
      {
        width: 80,
        align: 'right',
        lineBreak: false,
      },
    );
    doc.text(FOOTER_DISCLAIMER, MARGIN, FOOTER_Y + 12, {
      width: CONTENT_W,
      lineBreak: false,
    });
    doc.restore();
    doc.page.margins.bottom = previousBottom;
  }
}
