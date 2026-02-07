export type ToolTier = 0 | 1 | 2 | 3;

export interface ToolDefinition {
  name: string;
  tier: ToolTier;
  description: string;
}

export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  weather_forecast: {
    name: "weather_forecast",
    tier: 0,
    description: "Fetch weather forecast"
  },
  calendar_read: {
    name: "calendar_read",
    tier: 1,
    description: "Read calendar data"
  },
  email_read: {
    name: "email_read",
    tier: 1,
    description: "Read email summaries"
  },
  calendar_write_create: {
    name: "calendar_write_create",
    tier: 2,
    description: "Create calendar event"
  }
};

export function toolTier(toolName: string): ToolTier {
  return TOOL_REGISTRY[toolName]?.tier ?? 3;
}

export function requiresConfirmation(toolName: string): boolean {
  return toolTier(toolName) >= 2;
}
