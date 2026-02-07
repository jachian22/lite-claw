import { getEnv } from "../config/env.js";
import { GoogleOAuthService } from "../services/google-oauth-service.js";

type FetchLike = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;

interface GoogleOAuthLike {
  getValidAccessToken(userId: string, kind: "calendar"): Promise<string>;
}

interface CalendarEventDateTime {
  dateTime?: string;
  date?: string;
}

interface CalendarEvent {
  id?: string;
  summary?: string;
  start?: CalendarEventDateTime;
}

interface CalendarEventsResponse {
  items?: CalendarEvent[];
}

function formatTime(value?: CalendarEventDateTime): string {
  const raw = value?.dateTime ?? value?.date;
  if (!raw) {
    return "unspecified time";
  }

  const date = new Date(raw);
  if (Number.isNaN(date.valueOf())) {
    return raw;
  }

  return date.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric"
  });
}

export class GoogleCalendarClient {
  private readonly env = getEnv();

  constructor(
    private readonly oauth: GoogleOAuthLike = new GoogleOAuthService(),
    private readonly fetcher: FetchLike = fetch
  ) {}

  async listEvents(userId: string, range: "today" | "tomorrow", calendarId?: string): Promise<string> {
    const token = await this.resolveAccessToken(userId);
    if (!token) {
      throw new Error("Google Calendar not configured");
    }

    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    if (range === "tomorrow") {
      start.setDate(start.getDate() + 1);
    }

    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const selectedCalendarId = calendarId ?? this.env.GOOGLE_CALENDAR_ID;
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(selectedCalendarId)}/events`
    );
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("timeMin", start.toISOString());
    url.searchParams.set("timeMax", end.toISOString());

    const response = await this.fetcher(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(`Google Calendar request failed (${response.status})`);
    }

    const body = (await response.json()) as CalendarEventsResponse;
    const items = body.items ?? [];
    if (items.length === 0) {
      return `No calendar events ${range}.`;
    }

    const lines = items.map((event) => `- ${formatTime(event.start)}: ${event.summary ?? "Untitled"}`);
    return [`Calendar ${range}:`, ...lines].join("\n");
  }

  async createEvent(
    userId: string,
    title: string,
    whenIso: string,
    calendarId?: string,
    options?: { durationMinutes?: number; location?: string; description?: string }
  ): Promise<string> {
    const token = await this.resolveAccessToken(userId);
    if (!token) {
      throw new Error("Google Calendar not configured");
    }

    const start = new Date(whenIso);
    if (Number.isNaN(start.valueOf())) {
      throw new Error("Invalid event time. Use an ISO timestamp.");
    }

    const end = new Date(start);
    end.setMinutes(end.getMinutes() + (options?.durationMinutes ?? 60));

    const selectedCalendarId = calendarId ?? this.env.GOOGLE_CALENDAR_ID;
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(selectedCalendarId)}/events`
    );

    const response = await this.fetcher(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        summary: title,
        ...(options?.location ? { location: options.location } : {}),
        ...(options?.description ? { description: options.description } : {}),
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() }
      })
    });

    if (!response.ok) {
      throw new Error(`Google Calendar create failed (${response.status})`);
    }

    const event = (await response.json()) as CalendarEvent;
    return `Created event "${event.summary ?? title}" at ${formatTime(event.start)}.`;
  }

  private async resolveAccessToken(userId: string): Promise<string | null> {
    try {
      return await this.oauth.getValidAccessToken(userId, "calendar");
    } catch {
      return this.env.GOOGLE_CALENDAR_ACCESS_TOKEN ?? null;
    }
  }
}
