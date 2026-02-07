import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { Redis } from "@upstash/redis";

import type { AppEnv } from "../config/env.js";
import { getEnv } from "../config/env.js";
import type { IntegrationConnection } from "../db/repositories/integration-repository.js";
import { IntegrationRepository } from "../db/repositories/integration-repository.js";
import { getRedis } from "../db/redis.js";
import { TokenCrypto } from "../security/token-crypto.js";

type GoogleIntegrationKind = "calendar" | "gmail";

type FetchLike = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;

interface OAuthState {
  userId: string;
  kind: GoogleIntegrationKind;
  codeVerifier: string;
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

interface StoredGoogleToken {
  accessToken: string | undefined;
  refreshToken: string | undefined;
  expiresAt: string | undefined;
  tokenType: string | undefined;
  scope: string | undefined;
}

interface IntegrationRepoLike {
  get(ownerTelegramId: string, integrationType: string): Promise<IntegrationConnection | null>;
  upsert(
    ownerTelegramId: string,
    integrationType: string,
    provider: string,
    config: Record<string, unknown>
  ): Promise<void>;
}

const STATE_TTL_SECONDS = 600;

export class GoogleOAuthService {
  private readonly tokenCrypto: TokenCrypto | null;

  constructor(
    private readonly repo: IntegrationRepoLike = new IntegrationRepository(),
    private readonly redis: Redis = getRedis(),
    private readonly env: AppEnv = getEnv(),
    private readonly fetcher: FetchLike = fetch
  ) {
    this.tokenCrypto = this.buildTokenCrypto(env);
  }

  isConfigured(): boolean {
    return Boolean(
      this.env.PUBLIC_BASE_URL &&
        this.env.GOOGLE_OAUTH_CLIENT_ID &&
        this.env.GOOGLE_OAUTH_CLIENT_SECRET &&
        this.env.TOKEN_ENCRYPTION_KEY
    );
  }

  async createConnectUrl(userId: string, kind: GoogleIntegrationKind): Promise<string> {
    this.assertOAuthConfigured();

    const state = randomUUID();
    const codeVerifier = randomBytes(32).toString("base64url");
    await this.redis.set(this.stateKey(state), { userId, kind, codeVerifier } satisfies OAuthState, {
      ex: STATE_TTL_SECONDS
    });

    const baseUrl = this.env.PUBLIC_BASE_URL;
    if (!baseUrl) {
      throw new Error("PUBLIC_BASE_URL is required for OAuth link generation.");
    }

    return `${baseUrl}/oauth/google/start?state=${encodeURIComponent(state)}`;
  }

  async buildAuthUrlForState(state: string): Promise<string | null> {
    const oauthState = await this.getState(state);
    if (!oauthState) {
      return null;
    }

    return this.buildAuthUrl(state, oauthState.kind, oauthState.codeVerifier);
  }

  async handleOAuthCallback(state: string, code: string): Promise<{ userId: string; kind: GoogleIntegrationKind }> {
    const oauthState = await this.consumeState(state);
    if (!oauthState) {
      throw new Error("Invalid or expired OAuth state.");
    }

    const tokenResponse = await this.exchangeAuthorizationCode(code, oauthState.codeVerifier);
    await this.saveGoogleToken(oauthState.userId, oauthState.kind, tokenResponse);

    return oauthState;
  }

  async getValidAccessToken(userId: string, kind: GoogleIntegrationKind): Promise<string> {
    const integration = await this.repo.get(userId, kind);
    const token = this.extractStoredToken(integration?.config ?? {});

    if (token.accessToken && !isExpired(token.expiresAt)) {
      return token.accessToken;
    }

    if (!token.refreshToken) {
      throw new Error(`No valid ${kind} token. Connect via /integrations connect ${kind}`);
    }

    const refreshed = await this.refreshAccessToken(token.refreshToken);
    await this.saveGoogleToken(userId, kind, refreshed, token);

    if (!refreshed.access_token) {
      throw new Error("OAuth refresh did not return an access token.");
    }

    return refreshed.access_token;
  }

  async revokeIntegrationTokens(userId: string, kind: GoogleIntegrationKind): Promise<void> {
    const integration = await this.repo.get(userId, kind);
    const token = this.extractStoredToken(integration?.config ?? {});
    const tokenToRevoke = token.refreshToken ?? token.accessToken;

    if (!tokenToRevoke) {
      return;
    }

    const params = new URLSearchParams({ token: tokenToRevoke });
    const response = await this.fetcher("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });

    if (!response.ok) {
      throw new Error(`Google token revoke failed (${response.status})`);
    }
  }

  private async saveGoogleToken(
    userId: string,
    kind: GoogleIntegrationKind,
    tokenResponse: GoogleTokenResponse,
    previousToken?: StoredGoogleToken
  ): Promise<void> {
    const existing = await this.repo.get(userId, kind);
    const existingConfig = existing?.config ?? {};
    const previous = previousToken ?? this.extractStoredToken(existingConfig);

    const expiresAt = new Date(Date.now() + (tokenResponse.expires_in ?? 3600) * 1000).toISOString();
    const mergedToken: StoredGoogleToken = {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token ?? previous.refreshToken,
      expiresAt,
      tokenType: tokenResponse.token_type ?? previous.tokenType ?? "Bearer",
      scope: tokenResponse.scope ?? previous.scope
    };

    if (!this.tokenCrypto) {
      throw new Error("TOKEN_ENCRYPTION_KEY is required for encrypted OAuth token storage");
    }
    const encrypted = this.tokenCrypto.encrypt(JSON.stringify(mergedToken));

    const mergedConfig: Record<string, unknown> = {
      ...existingConfig,
      enabled: true,
      tokenEncrypted: encrypted,
      connectedAt: new Date().toISOString()
    };

    delete mergedConfig.token;

    if (kind === "calendar" && typeof mergedConfig.calendarId !== "string") {
      mergedConfig.calendarId = this.env.GOOGLE_CALENDAR_ID;
    }

    await this.repo.upsert(userId, kind, "google", mergedConfig);
  }

  private async exchangeAuthorizationCode(code: string, codeVerifier: string): Promise<GoogleTokenResponse> {
    const redirectUri = this.resolveRedirectUri();

    const params = new URLSearchParams({
      code,
      client_id: this.required(this.env.GOOGLE_OAUTH_CLIENT_ID, "GOOGLE_OAUTH_CLIENT_ID"),
      client_secret: this.required(this.env.GOOGLE_OAUTH_CLIENT_SECRET, "GOOGLE_OAUTH_CLIENT_SECRET"),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier
    });

    const response = await this.fetcher("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });

    if (!response.ok) {
      throw new Error(`Google token exchange failed (${response.status})`);
    }

    return (await response.json()) as GoogleTokenResponse;
  }

  private async refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
    const params = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: this.required(this.env.GOOGLE_OAUTH_CLIENT_ID, "GOOGLE_OAUTH_CLIENT_ID"),
      client_secret: this.required(this.env.GOOGLE_OAUTH_CLIENT_SECRET, "GOOGLE_OAUTH_CLIENT_SECRET"),
      grant_type: "refresh_token"
    });

    const response = await this.fetcher("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });

    if (!response.ok) {
      throw new Error(`Google token refresh failed (${response.status})`);
    }

    return (await response.json()) as GoogleTokenResponse;
  }

  private buildAuthUrl(state: string, kind: GoogleIntegrationKind, codeVerifier: string): string {
    const redirectUri = this.resolveRedirectUri();
    const scopes = this.scopesFor(kind).join(" ");
    const codeChallenge = createHash("sha256").update(codeVerifier, "utf8").digest("base64url");

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.required(this.env.GOOGLE_OAUTH_CLIENT_ID, "GOOGLE_OAUTH_CLIENT_ID"));
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", scopes);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");

    return url.toString();
  }

  private scopesFor(kind: GoogleIntegrationKind): string[] {
    if (kind === "calendar") {
      return [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.events"
      ];
    }

    return ["https://www.googleapis.com/auth/gmail.readonly"];
  }

  private async getState(state: string): Promise<OAuthState | null> {
    const value = await this.redis.get<OAuthState>(this.stateKey(state));
    return value ?? null;
  }

  private async consumeState(state: string): Promise<OAuthState | null> {
    const key = this.stateKey(state);
    const value = await this.redis.get<OAuthState>(key);
    if (!value) {
      return null;
    }

    await this.redis.del(key);
    return value;
  }

  private extractStoredToken(config: Record<string, unknown>): StoredGoogleToken {
    const encrypted = config.tokenEncrypted;
    if (typeof encrypted === "string" && encrypted.length > 0) {
      try {
        if (!this.tokenCrypto) {
          return emptyToken();
        }
        const decoded = JSON.parse(this.tokenCrypto.decrypt(encrypted)) as Record<string, unknown>;
        return asStoredToken(decoded);
      } catch {
        return emptyToken();
      }
    }

    const legacy = (config.token ?? {}) as Record<string, unknown>;
    return asStoredToken(legacy);
  }

  private resolveRedirectUri(): string {
    if (this.env.GOOGLE_OAUTH_REDIRECT_URI) {
      return this.env.GOOGLE_OAUTH_REDIRECT_URI;
    }

    const base = this.env.PUBLIC_BASE_URL;
    if (!base) {
      throw new Error("PUBLIC_BASE_URL or GOOGLE_OAUTH_REDIRECT_URI must be set.");
    }

    return `${base}/oauth/google/callback`;
  }

  private assertOAuthConfigured(): void {
    this.required(this.env.PUBLIC_BASE_URL, "PUBLIC_BASE_URL");
    this.required(this.env.GOOGLE_OAUTH_CLIENT_ID, "GOOGLE_OAUTH_CLIENT_ID");
    this.required(this.env.GOOGLE_OAUTH_CLIENT_SECRET, "GOOGLE_OAUTH_CLIENT_SECRET");
    this.required(this.env.TOKEN_ENCRYPTION_KEY, "TOKEN_ENCRYPTION_KEY");
  }

  private required(value: string | undefined, name: string): string {
    if (!value) {
      throw new Error(`Missing ${name}`);
    }
    return value;
  }

  private stateKey(state: string): string {
    return `oauth:google:state:${state}`;
  }

  private buildTokenCrypto(env: AppEnv): TokenCrypto | null {
    if (!env.TOKEN_ENCRYPTION_KEY) {
      return null;
    }

    return TokenCrypto.fromEnv(env);
  }
}

function emptyToken(): StoredGoogleToken {
  return {
    accessToken: undefined,
    refreshToken: undefined,
    expiresAt: undefined,
    tokenType: undefined,
    scope: undefined
  };
}

function asStoredToken(value: Record<string, unknown>): StoredGoogleToken {
  return {
    accessToken: typeof value.accessToken === "string" ? value.accessToken : undefined,
    refreshToken: typeof value.refreshToken === "string" ? value.refreshToken : undefined,
    expiresAt: typeof value.expiresAt === "string" ? value.expiresAt : undefined,
    tokenType: typeof value.tokenType === "string" ? value.tokenType : undefined,
    scope: typeof value.scope === "string" ? value.scope : undefined
  };
}

function isExpired(expiresAt?: string): boolean {
  if (!expiresAt) {
    return true;
  }

  const expiresMs = new Date(expiresAt).valueOf();
  if (Number.isNaN(expiresMs)) {
    return true;
  }

  return Date.now() >= expiresMs - 60_000;
}
