const MYT = 'Asia/Kuala_Lumpur';

export function formatReportMoney(
  cents: number | null | undefined,
  options?: { signed?: boolean },
): string {
  if (cents == null || !Number.isFinite(cents)) {
    return 'Unavailable';
  }
  const absolute = (Math.abs(cents) / 100).toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (options?.signed) {
    if (cents > 0) {
      return `+MYR ${absolute}`;
    }
    if (cents < 0) {
      return `-MYR ${absolute}`;
    }
  }
  const prefix = cents < 0 ? '-' : '';
  return `${prefix}MYR ${absolute}`;
}

export function formatReportPerGram(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) {
    return 'Unavailable';
  }
  return `${formatReportMoney(cents)}/g`;
}

export function formatReportPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return 'Unavailable';
  }
  const abs = Math.abs(value).toFixed(2);
  if (value > 0) {
    return `+${abs}%`;
  }
  if (value < 0) {
    return `-${abs}%`;
  }
  return '0.00%';
}

export function formatReportGrams(weight: string | null | undefined): string {
  if (weight == null || weight === '') {
    return '0.0000 g';
  }
  return `${weight} g`;
}

export function formatReportDate(ymd: string | null | undefined): string {
  if (!ymd) {
    return 'Unavailable';
  }
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) {
    return ymd;
  }
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${String(d).padStart(2, '0')} ${months[m - 1]} ${y}`;
}

export function formatReportDateTime(
  value: Date | string | null | undefined,
): string {
  if (value == null || value === '') {
    return 'Unavailable';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return 'Unavailable';
  }
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: MYT,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  return `${formatted} MYT`;
}

export function malaysiaCalendarYmd(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MYT,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function malaysiaHourMinute(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: MYT,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(value);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('hour')}${get('minute')}`;
}

export function goldSnapshotFileName(generatedAt: Date): string {
  return `Gold-Snapshot-${malaysiaCalendarYmd(generatedAt)}.pdf`;
}

export function goldStrategyFileName(generatedAt: Date): string {
  return `Gold-Strategy-${malaysiaCalendarYmd(generatedAt)}.pdf`;
}

export function formatChangeLine(
  change: {
    fromCents: number;
    toCents: number;
    changeCents: number;
    changePercent: number | null;
  } | null,
): string {
  if (!change) {
    return 'Unavailable';
  }
  const amount = formatReportMoney(change.changeCents, { signed: true });
  const percent = formatReportPercent(change.changePercent);
  return percent === 'Unavailable' ? amount : `${amount} (${percent})`;
}
