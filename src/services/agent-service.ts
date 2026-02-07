import { AuditRepository } from "../db/repositories/audit-repository.js";
import { parseCalendarEventRequest } from "../lib/event-parser.js";
import { ConfirmationService } from "./confirmation-service.js";
import { ConversationMemoryService } from "./conversation-memory-service.js";
import { OpenRouterService } from "./openrouter-service.js";
import { requiresConfirmation } from "../tools/policy.js";
import { ToolExecutor } from "../tools/executor.js";

interface InferredAction {
  tool: string;
  payload: Record<string, unknown>;
  preview: string;
}

export class AgentService {
  constructor(
    private readonly confirmations = new ConfirmationService(),
    private readonly memory = new ConversationMemoryService(),
    private readonly openRouter = new OpenRouterService(),
    private readonly toolExecutor = new ToolExecutor(),
    private readonly audit = new AuditRepository()
  ) {}

  async handleMessage(userId: string, text: string): Promise<string> {
    await this.memory.append(userId, "user", text);

    const pending = await this.confirmations.get(userId);
    if (pending) {
      const confirmMatch = text.trim().match(/^YES\s+(\d{6})$/i);
      const rejectMatch = text.trim().match(/^NO$/i);

      if (rejectMatch) {
        await this.confirmations.consume(userId);
        await this.audit.log({
          actorTelegramId: userId,
          eventType: "confirmation_rejected",
          metadata: { tool: pending.tool }
        });
        const cancelled = "Cancelled. No changes were made.";
        await this.memory.append(userId, "assistant", cancelled);
        return cancelled;
      }

      if (confirmMatch) {
        const nonce = confirmMatch[1];
        if (nonce !== pending.nonce) {
          return "Confirmation code mismatch. Reply exactly with the latest YES code or NO.";
        }

        if (!requiresConfirmation(pending.tool)) {
          return "No confirmation is required for that action.";
        }

        const result = await this.toolExecutor.execute(userId, pending.tool, pending.payload);
        await this.confirmations.consume(userId);
        await this.audit.log({
          actorTelegramId: userId,
          eventType: "tool_executed_after_confirmation",
          metadata: { tool: pending.tool }
        });
        await this.memory.append(userId, "assistant", result.content);
        return result.content;
      }

      return "You have a pending action. Reply YES <code> to continue or NO to cancel.";
    }

    const action = inferAction(text);
    if (action) {
      if (requiresConfirmation(action.tool)) {
        const pendingConfirmation = await this.confirmations.create(userId, action.tool, action.payload);
        await this.audit.log({
          actorTelegramId: userId,
          eventType: "confirmation_requested",
          metadata: { tool: action.tool }
        });

        const confirmationMessage = `${action.preview}\n\nReply YES ${pendingConfirmation.nonce} to confirm, or NO to cancel.`;
        await this.memory.append(userId, "assistant", confirmationMessage);
        return confirmationMessage;
      }

      const result = await this.toolExecutor.execute(userId, action.tool, action.payload);
      await this.audit.log({
        actorTelegramId: userId,
        eventType: "tool_executed_auto",
        metadata: { tool: action.tool }
      });
      await this.memory.append(userId, "assistant", result.content);
      return result.content;
    }

    const prior = await this.memory.read(userId);
    const systemPrompt = [
      "You are a concise personal assistant.",
      "Do not claim actions were executed unless explicitly confirmed.",
      "If user asks for sensitive changes, tell them to use explicit commands."
    ].join(" ");

    const response = await this.openRouter.chat([
      { role: "system", content: systemPrompt },
      ...prior.slice(-12),
      { role: "user", content: text }
    ]);

    await this.memory.append(userId, "assistant", response);
    return response;
  }
}

function inferAction(text: string): InferredAction | null {
  const normalized = text.toLowerCase();

  if (normalized.includes("weather")) {
    return {
      tool: "weather_forecast",
      payload: { location: "default", days: 1 },
      preview: "Fetching weather forecast."
    };
  }

  if (normalized.includes("calendar") && (normalized.includes("today") || normalized.includes("tomorrow"))) {
    return {
      tool: "calendar_read",
      payload: { range: normalized.includes("tomorrow") ? "tomorrow" : "today" },
      preview: "Reading your calendar."
    };
  }

  if (normalized.includes("email") || normalized.includes("inbox")) {
    return {
      tool: "email_read",
      payload: { since: "24h", limit: 5 },
      preview: "Checking email summaries."
    };
  }

  const wantsCreate = /\b(add|create|schedule)\b/.test(normalized);
  const mentionsEvent = /\b(event|appointment|meeting|calendar)\b/.test(normalized);
  if (wantsCreate && mentionsEvent) {
    const parsedEvent = parseCalendarEventRequest(text);

    return {
      tool: "calendar_write_create",
      payload: {
        title: parsedEvent.title,
        when: parsedEvent.whenIso ?? "",
        durationMinutes: parsedEvent.durationMinutes,
        ...(parsedEvent.location ? { location: parsedEvent.location } : {})
      },
      preview: [
        "I will create this calendar event.",
        `Title: ${parsedEvent.title}`,
        `Duration: ${parsedEvent.durationMinutes} minutes`,
        parsedEvent.location ? `Location: ${parsedEvent.location}` : "Location: (none)",
        parsedEvent.whenIso
          ? `Detected time: ${parsedEvent.whenIso}`
          : "No date/time detected. Include one like 'tomorrow 2pm' or an ISO time."
      ].join("\n")
    };
  }

  return null;
}
