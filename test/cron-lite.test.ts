import { describe, expect, test } from "vitest";

import { heartbeatSlotKey, shouldRunCronNow } from "../src/lib/cron-lite.js";

describe("cron-lite", () => {
  test("matches UTC daily schedule", () => {
    const now = new Date("2026-02-08T07:00:00Z");
    expect(shouldRunCronNow("0 7 * * *", "UTC", now)).toBe(true);
    expect(shouldRunCronNow("1 7 * * *", "UTC", now)).toBe(false);
  });

  test("matches weekly schedule with weekday names", () => {
    const sunday = new Date("2026-02-08T18:00:00Z");
    expect(shouldRunCronNow("0 18 * * SUN", "UTC", sunday)).toBe(true);
  });

  test("creates slot key in timezone", () => {
    const now = new Date("2026-02-08T07:00:00Z");
    const key = heartbeatSlotKey("morning_briefing", "123", "UTC", now);
    expect(key).toContain("morning_briefing:123");
    expect(key.endsWith("07:00")).toBe(true);
  });
});
