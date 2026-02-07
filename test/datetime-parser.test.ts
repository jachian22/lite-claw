import { describe, expect, test } from "vitest";

import { parseDateTimeFromText } from "../src/lib/datetime-parser.js";

describe("parseDateTimeFromText", () => {
  test("parses tomorrow with 12-hour time", () => {
    const base = new Date("2026-02-07T10:00:00Z");
    const parsed = parseDateTimeFromText("Schedule dentist tomorrow at 2pm", base);
    const expected = new Date(base);
    expected.setDate(expected.getDate() + 1);
    expected.setHours(14, 0, 0, 0);

    expect(parsed).toBe(expected.toISOString());
  });

  test("parses next weekday", () => {
    const base = new Date("2026-02-07T10:00:00Z"); // Saturday
    const parsed = parseDateTimeFromText("Set a meeting Friday 09:30", base);
    const expected = new Date(base);
    expected.setDate(expected.getDate() + 6);
    expected.setHours(9, 30, 0, 0);

    expect(parsed).toBe(expected.toISOString());
  });

  test("returns iso from explicit timestamp", () => {
    const parsed = parseDateTimeFromText("at 2026-03-01T16:45:00Z");
    expect(parsed).toBe("2026-03-01T16:45:00.000Z");
  });

  test("returns null if date or time missing", () => {
    expect(parseDateTimeFromText("schedule a meeting soon")).toBeNull();
    expect(parseDateTimeFromText("meeting tomorrow")).toBeNull();
  });
});
