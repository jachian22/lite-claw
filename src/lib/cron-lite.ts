const DOW_NAME_TO_NUM: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6
};

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}

export function shouldRunCronNow(cron: string, timezone: string, now = new Date()): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    return false;
  }

  const [minuteExpr, hourExpr, , , dowExpr] = parts;
  let zoned: ZonedParts;
  try {
    zoned = getZonedParts(now, timezone);
  } catch {
    return false;
  }

  const minuteMatch = matchesExpr(minuteExpr ?? "", zoned.minute, 0, 59);
  const hourMatch = matchesExpr(hourExpr ?? "", zoned.hour, 0, 23);
  const dowMatch = matchesDow(dowExpr ?? "*", zoned.weekday);

  return minuteMatch && hourMatch && dowMatch;
}

export function heartbeatSlotKey(jobType: string, userId: string, timezone: string, now = new Date()): string {
  let zoned: ZonedParts;
  try {
    zoned = getZonedParts(now, timezone);
  } catch {
    zoned = getZonedParts(now, "UTC");
  }
  return [
    "heartbeat",
    jobType,
    userId,
    `${zoned.year}-${pad2(zoned.month)}-${pad2(zoned.day)}`,
    `${pad2(zoned.hour)}:${pad2(zoned.minute)}`
  ].join(":");
}

function getZonedParts(date: Date, timezone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short"
  });

  const map = new Map<string, string>();
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== "literal") {
      map.set(part.type, part.value);
    }
  }

  const year = Number.parseInt(map.get("year") ?? "0", 10);
  const month = Number.parseInt(map.get("month") ?? "0", 10);
  const day = Number.parseInt(map.get("day") ?? "0", 10);
  const hour = Number.parseInt(map.get("hour") ?? "0", 10);
  const minute = Number.parseInt(map.get("minute") ?? "0", 10);
  const weekdayRaw = (map.get("weekday") ?? "sun").toLowerCase().slice(0, 3);
  const weekday = DOW_NAME_TO_NUM[weekdayRaw] ?? 0;

  return { year, month, day, hour, minute, weekday };
}

function matchesExpr(expr: string, value: number, min: number, max: number): boolean {
  if (expr === "*") {
    return true;
  }

  return expr.split(",").some((token) => {
    const trimmed = token.trim();
    if (!trimmed) {
      return false;
    }

    if (trimmed.includes("-")) {
      const [startRaw, endRaw] = trimmed.split("-");
      const start = Number.parseInt(startRaw ?? "", 10);
      const end = Number.parseInt(endRaw ?? "", 10);
      if (!isInRange(start, min, max) || !isInRange(end, min, max)) {
        return false;
      }
      return value >= start && value <= end;
    }

    const num = Number.parseInt(trimmed, 10);
    return isInRange(num, min, max) && num === value;
  });
}

function matchesDow(expr: string, weekday: number): boolean {
  if (expr === "*") {
    return true;
  }

  return expr.split(",").some((token) => {
    const trimmed = token.trim();
    if (!trimmed) {
      return false;
    }

    const name = trimmed.toLowerCase().slice(0, 3);
    if (name in DOW_NAME_TO_NUM) {
      return DOW_NAME_TO_NUM[name] === weekday;
    }

    const num = Number.parseInt(trimmed, 10);
    if (Number.isNaN(num)) {
      return false;
    }

    return (num % 7 + 7) % 7 === weekday;
  });
}

function isInRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
