import http from "node:http";

import { getEnv } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { GoogleOAuthService } from "../services/google-oauth-service.js";
import { TelegramClient } from "../telegram/telegram-client.js";

export class OAuthServer {
  private server: http.Server | null = null;

  constructor(
    private readonly oauthService = new GoogleOAuthService(),
    private readonly telegram = new TelegramClient()
  ) {}

  start(): void {
    const env = getEnv();
    if (!this.oauthService.isConfigured()) {
      logger.warn("OAuth server disabled; missing OAuth config env vars");
      return;
    }

    this.server = http.createServer((req, res) => {
      void this.handle(req, res);
    });

    this.server.listen(env.OAUTH_HTTP_PORT, () => {
      logger.info("OAuth callback server listening", { port: env.OAUTH_HTTP_PORT });
    });
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.server?.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });

    this.server = null;
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      if (req.method !== "GET") {
        this.respondText(res, 405, "Method Not Allowed");
        return;
      }

      const host = req.headers.host ?? "localhost";
      const url = new URL(req.url ?? "/", `http://${host}`);

      if (url.pathname === "/oauth/google/start") {
        await this.handleStart(url, res);
        return;
      }

      if (url.pathname === "/oauth/google/callback") {
        await this.handleCallback(url, res);
        return;
      }

      this.respondText(res, 404, "Not Found");
    } catch (error) {
      logger.error("OAuth request failed", {
        error: error instanceof Error ? error.message : String(error)
      });
      this.respondHtml(
        res,
        500,
        "<h1>OAuth failed</h1><p>Unexpected error occurred. Return to Telegram and try again.</p>"
      );
    }
  }

  private async handleStart(url: URL, res: http.ServerResponse): Promise<void> {
    const state = url.searchParams.get("state");
    if (!state) {
      this.respondText(res, 400, "Missing state");
      return;
    }

    const authUrl = await this.oauthService.buildAuthUrlForState(state);
    if (!authUrl) {
      this.respondText(res, 400, "Invalid or expired OAuth state");
      return;
    }

    res.statusCode = 302;
    res.setHeader("Location", authUrl);
    res.end();
  }

  private async handleCallback(url: URL, res: http.ServerResponse): Promise<void> {
    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (error) {
      this.respondHtml(res, 400, `<h1>OAuth denied</h1><p>${escapeHtml(error)}</p>`);
      return;
    }

    if (!state || !code) {
      this.respondText(res, 400, "Missing state or code");
      return;
    }

    const result = await this.oauthService.handleOAuthCallback(state, code);
    await this.telegram.sendMessage(
      result.userId,
      `Google ${result.kind} connected. You can now use it from chat.`
    );

    this.respondHtml(
      res,
      200,
      `<h1>Connected</h1><p>Google ${escapeHtml(result.kind)} is now connected. You can return to Telegram.</p>`
    );
  }

  private respondText(res: http.ServerResponse, statusCode: number, body: string): void {
    res.statusCode = statusCode;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(body);
  }

  private respondHtml(res: http.ServerResponse, statusCode: number, body: string): void {
    res.statusCode = statusCode;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`<!doctype html><html><body>${body}</body></html>`);
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
