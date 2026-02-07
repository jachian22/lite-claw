import { describe, expect, test } from "vitest";

import { requiresConfirmation, toolTier } from "../src/tools/policy.js";

describe("tool policy", () => {
  test("auto-approves Tier 0 and Tier 1 tools", () => {
    expect(toolTier("weather_forecast")).toBe(0);
    expect(toolTier("calendar_read")).toBe(1);
    expect(requiresConfirmation("weather_forecast")).toBe(false);
    expect(requiresConfirmation("calendar_read")).toBe(false);
  });

  test("requires confirmation for Tier 2 writes", () => {
    expect(toolTier("calendar_write_create")).toBe(2);
    expect(requiresConfirmation("calendar_write_create")).toBe(true);
  });
});
