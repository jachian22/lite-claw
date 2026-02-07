import { GmailClient } from "../integrations/gmail-client.js";
import { GoogleCalendarClient } from "../integrations/google-calendar-client.js";
import { OpenWeatherClient } from "../integrations/openweather-client.js";
import { IntegrationService } from "../services/integration-service.js";

export interface ToolExecutionResult {
  tool: string;
  content: string;
}

export class ToolExecutor {
  constructor(
    private readonly integrations = new IntegrationService(),
    private readonly weather = new OpenWeatherClient(),
    private readonly calendar = new GoogleCalendarClient(),
    private readonly gmail = new GmailClient()
  ) {}

  async execute(userId: string, tool: string, payload: Record<string, unknown>): Promise<ToolExecutionResult> {
    switch (tool) {
      case "weather_forecast": {
        const location = toText(payload.location, await this.integrations.getWeatherLocation(userId));
        const days = toNumber(payload.days, 1);
        return {
          tool,
          content: await this.weather.forecast(location, days)
        };
      }
      case "calendar_read": {
        const range = toText(payload.range, "today") === "tomorrow" ? "tomorrow" : "today";
        const calendarId = await this.integrations.getCalendarId(userId);
        return {
          tool,
          content: await this.calendar.listEvents(userId, range, calendarId)
        };
      }
      case "email_read": {
        const enabled = await this.integrations.isGmailEnabled(userId);
        if (!enabled) {
          return {
            tool,
            content: "Gmail integration is disabled. Enable with /integrations gmail"
          };
        }

        return {
          tool,
          content: await this.gmail.importantSummary(userId, toNumber(payload.limit, 5))
        };
      }
      case "calendar_write_create": {
        const title = toText(payload.title, "Untitled event");
        const whenIso = toText(payload.when, "");
        const durationMinutes = toNumber(payload.durationMinutes, 60);
        const location = toOptionalText(payload.location);
        if (!whenIso || Number.isNaN(new Date(whenIso).valueOf())) {
          return {
            tool,
            content: "I need a date/time. Try 'tomorrow 2pm' or ISO like 2026-02-10T15:00:00-08:00."
          };
        }

        const calendarId = await this.integrations.getCalendarId(userId);
        return {
          tool,
          content: await this.calendar.createEvent(userId, title, whenIso, calendarId, {
            durationMinutes,
            ...(location ? { location } : {})
          })
        };
      }
      default:
        throw new Error(`Unsupported tool: ${tool}`);
    }
  }
}

function toText(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  return fallback;
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function toOptionalText(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return undefined;
}
