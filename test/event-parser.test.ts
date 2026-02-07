import { describe, expect, test } from "vitest";

import { parseCalendarEventRequest } from "../src/lib/event-parser.js";

describe("parseCalendarEventRequest", () => {
  test("extracts title, datetime, duration, and location", () => {
    const base = new Date("2026-02-07T10:00:00Z");
    const parsed = parseCalendarEventRequest(
      "Schedule dentist appointment tomorrow 2pm for 90 minutes at Mission Clinic",
      base
    );

    expect(parsed.title.toLowerCase()).toContain("dentist appointment");
    expect(parsed.whenIso).toBeTruthy();
    expect(parsed.durationMinutes).toBe(90);
    expect(parsed.location).toBe("Mission Clinic");
  });

  test("falls back to defaults", () => {
    const parsed = parseCalendarEventRequest("create event");
    expect(parsed.title).toBeTruthy();
    expect(parsed.durationMinutes).toBe(60);
  });
});
