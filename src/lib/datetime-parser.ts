const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
};

export function parseDateTimeFromText(text: string, baseDate = new Date()): string | null {
  const isoMatch = text.match(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})\b/);
  if (isoMatch) {
    const date = new Date(isoMatch[0]);
    if (!Number.isNaN(date.valueOf())) {
      return date.toISOString();
    }
  }

  const dayTarget = resolveDay(text, baseDate);
  if (!dayTarget) {
    return null;
  }

  const time = resolveTime(text);
  if (!time) {
    return null;
  }

  dayTarget.setHours(time.hour, time.minute, 0, 0);
  return dayTarget.toISOString();
}

function resolveDay(text: string, baseDate: Date): Date | null {
  const lower = text.toLowerCase();

  if (/\btoday\b/.test(lower)) {
    return new Date(baseDate);
  }

  if (/\btomorrow\b/.test(lower)) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + 1);
    return date;
  }

  const weekdayMatch = lower.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (weekdayMatch) {
    const weekdayName = weekdayMatch[1];
    if (!weekdayName) {
      return null;
    }

    const targetDay = WEEKDAYS[weekdayName];
    if (targetDay === undefined) {
      return null;
    }

    const date = new Date(baseDate);
    const current = date.getDay();
    const delta = (targetDay - current + 7) % 7 || 7;
    date.setDate(date.getDate() + delta);
    return date;
  }

  const ymdMatch = lower.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (ymdMatch) {
    const year = Number.parseInt(ymdMatch[1] ?? "", 10);
    const month = Number.parseInt(ymdMatch[2] ?? "", 10);
    const day = Number.parseInt(ymdMatch[3] ?? "", 10);

    if (!Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day)) {
      return new Date(year, month - 1, day);
    }
  }

  return null;
}

function resolveTime(text: string): { hour: number; minute: number } | null {
  const lower = text.toLowerCase();

  const ampm = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (ampm) {
    const rawHour = Number.parseInt(ampm[1] ?? "", 10);
    const minute = Number.parseInt(ampm[2] ?? "0", 10);
    const meridiem = ampm[3];

    if (!Number.isFinite(rawHour) || !Number.isFinite(minute) || !meridiem) {
      return null;
    }

    if (rawHour < 1 || rawHour > 12 || minute < 0 || minute > 59) {
      return null;
    }

    let hour = rawHour % 12;
    if (meridiem === "pm") {
      hour += 12;
    }

    return { hour, minute };
  }

  const twentyFourHour = lower.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (twentyFourHour) {
    const hour = Number.parseInt(twentyFourHour[1] ?? "", 10);
    const minute = Number.parseInt(twentyFourHour[2] ?? "", 10);
    if (Number.isFinite(hour) && Number.isFinite(minute)) {
      return { hour, minute };
    }
  }

  return null;
}
