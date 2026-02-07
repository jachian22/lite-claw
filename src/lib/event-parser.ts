import { parseDateTimeFromText } from "./datetime-parser.js";

export interface ParsedCalendarEvent {
  title: string;
  whenIso: string | null;
  durationMinutes: number;
  location?: string;
}

export function parseCalendarEventRequest(text: string, now = new Date()): ParsedCalendarEvent {
  const whenIso = parseDateTimeFromText(text, now);
  const durationMinutes = parseDurationMinutes(text) ?? 60;
  const location = parseLocation(text);
  const title = parseTitle(text);

  return {
    title,
    whenIso,
    durationMinutes,
    ...(location ? { location } : {})
  };
}

function parseDurationMinutes(text: string): number | null {
  const match = text.match(/\bfor\s+(\d{1,3})\s*(minutes?|mins?|hours?|hrs?)\b/i);
  if (!match) {
    return null;
  }

  const count = Number.parseInt(match[1] ?? "", 10);
  const unit = (match[2] ?? "").toLowerCase();
  if (!Number.isFinite(count) || count <= 0) {
    return null;
  }

  if (unit.startsWith("hour") || unit.startsWith("hr")) {
    return count * 60;
  }

  return count;
}

function parseLocation(text: string): string | undefined {
  const locationMatch = text.match(/\b(?:at|in)\s+([a-z0-9][\w\s.'-]{1,80})$/i);
  if (!locationMatch) {
    return undefined;
  }

  const value = (locationMatch[1] ?? "").trim();
  if (!value || /\b(am|pm)$/.test(value.toLowerCase())) {
    return undefined;
  }

  return value;
}

function parseTitle(text: string): string {
  let title = text
    .replace(/^\s*(add|create|schedule)\s+/i, "")
    .replace(/\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b.*$/i, "")
    .replace(/\bfor\s+\d{1,3}\s*(minutes?|mins?|hours?|hrs?)\b/i, "")
    .trim();

  if (!title) {
    title = "Calendar event";
  }

  return title;
}
