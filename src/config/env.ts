import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  OPENROUTER_API_KEY: z.string().min(1),
  OWNER_CLAIM_CODE: z.string().min(8),
  OWNER_CLAIM_PEPPER: z.string().min(16),
  DATABASE_URL: z.string().url(),
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
  DEFAULT_MODEL: z.string().default("anthropic/claude-3.5-haiku"),
  OPENROUTER_BASE_URL: z.string().url().default("https://openrouter.ai/api/v1"),
  PUBLIC_BASE_URL: z.string().url().optional(),
  OAUTH_HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  TOKEN_ENCRYPTION_KEY: z.string().min(1).optional(),
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().url().optional(),
  OAUTH_CONNECT_ATTEMPT_WINDOW_SECONDS: z.coerce.number().int().min(60).max(3600).default(300),
  OAUTH_CONNECT_ATTEMPT_MAX: z.coerce.number().int().min(1).max(30).default(10),
  OPENWEATHER_API_KEY: z.string().min(1).optional(),
  DEFAULT_WEATHER_LOCATION: z.string().min(2).default("San Francisco, CA"),
  GOOGLE_CALENDAR_ACCESS_TOKEN: z.string().min(1).optional(),
  GOOGLE_CALENDAR_ID: z.string().min(1).default("primary"),
  GMAIL_ACCESS_TOKEN: z.string().min(1).optional(),
  HEARTBEAT_JOB_TYPE: z.enum(["morning_briefing", "weekly_review"]).optional(),
  HEARTBEAT_MAX_EMAILS: z.coerce.number().int().min(1).max(20).default(5),
  POLL_TIMEOUT_SECONDS: z.coerce.number().int().min(1).max(50).default(30),
  POLL_RETRY_MS: z.coerce.number().int().min(100).max(60000).default(1000),
  CONFIRMATION_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(300),
  CONVERSATION_WINDOW_SIZE: z.coerce.number().int().min(4).max(100).default(20),
  CLAIM_ATTEMPT_WINDOW_SECONDS: z.coerce.number().int().min(60).max(3600).default(300),
  CLAIM_ATTEMPT_MAX: z.coerce.number().int().min(1).max(20).default(5)
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

export function resetEnvForTests(): void {
  cachedEnv = null;
}
