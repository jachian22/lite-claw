import type { HeartbeatType } from "../db/repositories/heartbeat-repository.js";
import { GmailClient } from "../integrations/gmail-client.js";
import { GoogleCalendarClient } from "../integrations/google-calendar-client.js";
import { OpenWeatherClient } from "../integrations/openweather-client.js";
import { IntegrationService } from "../services/integration-service.js";

export class BriefingService {
  constructor(
    private readonly integrations = new IntegrationService(),
    private readonly weather = new OpenWeatherClient(),
    private readonly calendar = new GoogleCalendarClient(),
    private readonly gmail = new GmailClient()
  ) {}

  async build(userId: string, jobType: HeartbeatType): Promise<string> {
    const lines: string[] = [];

    const title =
      jobType === "morning_briefing"
        ? `Good morning. Briefing for ${new Date().toLocaleDateString("en-US")}`
        : `Weekly review for ${new Date().toLocaleDateString("en-US")}`;
    lines.push(title);

    const weatherLocation = await this.integrations.getWeatherLocation(userId);
    try {
      const weatherText = await this.weather.forecast(weatherLocation, 1);
      lines.push("", weatherText);
    } catch {
      lines.push("", "Weather unavailable.");
    }

    try {
      const calendarId = await this.integrations.getCalendarId(userId);
      const range = jobType === "morning_briefing" ? "today" : "tomorrow";
      const calendarText = await this.calendar.listEvents(userId, range, calendarId);
      lines.push("", calendarText);
    } catch {
      lines.push("", "Calendar unavailable.");
    }

    const gmailEnabled = await this.integrations.isGmailEnabled(userId);
    if (gmailEnabled) {
      try {
        const email = await this.gmail.importantSummary(userId);
        lines.push("", email);
      } catch {
        lines.push("", "Gmail unavailable.");
      }
    }

    return lines.join("\n");
  }
}
