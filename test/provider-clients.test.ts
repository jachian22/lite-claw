import { beforeEach, describe, expect, test } from "vitest";

import { resetEnvForTests } from "../src/config/env.js";
import { GmailClient } from "../src/integrations/gmail-client.js";
import { GoogleCalendarClient } from "../src/integrations/google-calendar-client.js";
import { OpenWeatherClient } from "../src/integrations/openweather-client.js";

function setEnv(): void {
  process.env.NODE_ENV = "test";
  process.env.TELEGRAM_BOT_TOKEN = "token";
  process.env.OPENROUTER_API_KEY = "or-key";
  process.env.OWNER_CLAIM_CODE = "super-secret-code";
  process.env.OWNER_CLAIM_PEPPER = "pepper-pepper-pepper";
  process.env.DATABASE_URL = "postgres://postgres:postgres@localhost:5432/liteclaw";
  process.env.UPSTASH_REDIS_REST_URL = "https://example.com";
  process.env.UPSTASH_REDIS_REST_TOKEN = "redis-token";
  process.env.DEFAULT_WEATHER_LOCATION = "San Francisco, CA";
  process.env.OPENWEATHER_API_KEY = "weather-key";
  process.env.GOOGLE_CALENDAR_ID = "primary";
  process.env.HEARTBEAT_MAX_EMAILS = "5";
}

describe("provider clients", () => {
  beforeEach(() => {
    setEnv();
    resetEnvForTests();
  });

  test("openweather client formats forecast", async () => {
    const client = new OpenWeatherClient(async () => {
      return new Response(
        JSON.stringify({
          city: { name: "San Francisco" },
          list: [
            {
              dt_txt: "2026-02-08 12:00:00",
              main: { temp: 65 },
              weather: [{ description: "sunny" }]
            }
          ]
        }),
        { status: 200 }
      );
    });

    const forecast = await client.forecast("San Francisco", 1);
    expect(forecast).toContain("San Francisco");
    expect(forecast).toContain("sunny");
  });

  test("google calendar client reads events with oauth token", async () => {
    const oauth = { getValidAccessToken: async () => "access-token" };
    const client = new GoogleCalendarClient(oauth, async () => {
      return new Response(
        JSON.stringify({
          items: [
            {
              summary: "Standup",
              start: { dateTime: "2026-02-08T17:00:00Z" }
            }
          ]
        }),
        { status: 200 }
      );
    });

    const result = await client.listEvents("user-1", "today", "primary");
    expect(result).toContain("Standup");
  });

  test("gmail client summarizes metadata", async () => {
    const oauth = { getValidAccessToken: async () => "access-token" };

    let callCount = 0;
    const client = new GmailClient(oauth, async () => {
      callCount += 1;
      if (callCount === 1) {
        return new Response(JSON.stringify({ messages: [{ id: "m1" }] }), { status: 200 });
      }

      return new Response(
        JSON.stringify({
          snippet: "Please review",
          payload: {
            headers: [
              { name: "Subject", value: "Design review" },
              { name: "From", value: "team@example.com" }
            ]
          }
        }),
        { status: 200 }
      );
    });

    const result = await client.importantSummary("user-1", 1);
    expect(result).toContain("Design review");
    expect(result).toContain("team@example.com");
  });
});
