import { getEnv } from "../config/env.js";
import { GoogleOAuthService } from "../services/google-oauth-service.js";

type FetchLike = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;

interface GoogleOAuthLike {
  getValidAccessToken(userId: string, kind: "gmail"): Promise<string>;
}

interface GmailMessageRef {
  id: string;
}

interface GmailListResponse {
  messages?: GmailMessageRef[];
}

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailMessagePayload {
  headers?: GmailHeader[];
}

interface GmailMessage {
  snippet?: string;
  payload?: GmailMessagePayload;
}

export class GmailClient {
  private readonly env = getEnv();

  constructor(
    private readonly oauth: GoogleOAuthLike = new GoogleOAuthService(),
    private readonly fetcher: FetchLike = fetch
  ) {}

  async importantSummary(userId: string, maxItems?: number): Promise<string> {
    const token = await this.resolveAccessToken(userId);
    if (!token) {
      throw new Error("Gmail not configured");
    }

    const limit = maxItems ?? this.env.HEARTBEAT_MAX_EMAILS;
    const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    listUrl.searchParams.set("maxResults", String(limit));
    listUrl.searchParams.set("q", "is:inbox newer_than:2d");

    const listResponse = await this.fetcher(listUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!listResponse.ok) {
      throw new Error(`Gmail list failed (${listResponse.status})`);
    }

    const listData = (await listResponse.json()) as GmailListResponse;
    const ids = (listData.messages ?? []).slice(0, limit);

    if (ids.length === 0) {
      return "No recent inbox messages.";
    }

    const summaries: string[] = [];
    for (const ref of ids) {
      const messageUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${ref.id}`);
      messageUrl.searchParams.set("format", "metadata");
      messageUrl.searchParams.set("metadataHeaders", "Subject");
      messageUrl.searchParams.set("metadataHeaders", "From");

      const messageResponse = await this.fetcher(messageUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!messageResponse.ok) {
        continue;
      }

      const message = (await messageResponse.json()) as GmailMessage;
      const headers = message.payload?.headers ?? [];
      const subject = headers.find((h) => h.name.toLowerCase() === "subject")?.value ?? "(no subject)";
      const from = headers.find((h) => h.name.toLowerCase() === "from")?.value ?? "unknown sender";
      const snippet = message.snippet ?? "";

      summaries.push(`- ${subject} — ${from}${snippet ? ` (${snippet})` : ""}`);
    }

    return ["Recent inbox summary:", ...summaries].join("\n");
  }

  private async resolveAccessToken(userId: string): Promise<string | null> {
    try {
      return await this.oauth.getValidAccessToken(userId, "gmail");
    } catch {
      return this.env.GMAIL_ACCESS_TOKEN ?? null;
    }
  }
}
