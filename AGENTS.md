# AGENTS Guide

This file is optimized for coding agents working in this repository.

## Mission

Ship and maintain Lite Claw as a production-ready Railway deployment:
- TypeScript runtime
- Telegram long polling
- Neon Postgres + Upstash Redis
- Secure claim-code onboarding
- Google OAuth integrations (Calendar + Gmail)
- Heartbeat cron workers

## Fast Start

1. Install and verify
```bash
pnpm install
pnpm check
```

2. Apply migrations
```bash
pnpm migrate
```

3. Run worker locally
```bash
pnpm start
```

4. Run heartbeat job locally (simulating cron)
```bash
HEARTBEAT_JOB_TYPE=morning_briefing pnpm heartbeat:run
```

## Critical Safety Rules

1. Never bypass auth gates.
- Keep order: ownership/whitelist checks before agent/tool execution.

2. Never store OAuth tokens unencrypted.
- Use `tokenEncrypted` path via `GoogleOAuthService`.
- Do not reintroduce plaintext token fields in persistence.

3. Keep write actions confirm-gated.
- Tiered tool policy must require explicit `YES <code>` for writes.

4. Preserve idempotency.
- Telegram updates deduped by update ID.
- Heartbeats deduped by slot key.

5. Keep quality gate green.
- Always run `pnpm check` before declaring completion.

## File Map

- Runtime entrypoints
  - `src/index.ts`
  - `src/app/runtime.ts`
  - `src/heartbeat/run-heartbeat.ts`

- Telegram and routing
  - `src/telegram/poller.ts`
  - `src/telegram/update-router.ts`
  - `src/telegram/telegram-client.ts`

- Security/auth
  - `src/services/ownership-service.ts`
  - `src/services/google-oauth-service.ts`
  - `src/security/hash.ts`
  - `src/security/token-crypto.ts`

- Integrations
  - `src/integrations/google-calendar-client.ts`
  - `src/integrations/gmail-client.ts`
  - `src/integrations/openweather-client.ts`
  - `src/services/integration-service.ts`

- Agent and tools
  - `src/services/agent-service.ts`
  - `src/tools/policy.ts`
  - `src/tools/executor.ts`
  - `src/lib/datetime-parser.ts`
  - `src/lib/event-parser.ts`

- Heartbeats
  - `src/services/heartbeat-config-service.ts`
  - `src/heartbeat/worker.ts`
  - `src/heartbeat/briefing-service.ts`
  - `src/lib/cron-lite.ts`

- Persistence
  - `src/db/migrations/*.sql`
  - `src/db/repositories/*.ts`

- Ops docs
  - `docs/production-implementation-guide.md`
  - `docs/operations-runbook.md`

## Standard Agent Workflow

1. Understand the request and affected surface area.
2. Locate impacted files with `rg`.
3. Implement smallest safe change.
4. Add/adjust tests for changed behavior.
5. Run `pnpm check`.
6. Summarize exact file/line changes and residual risk.

## Production Change Checklists

### OAuth-related changes

- [ ] `TOKEN_ENCRYPTION_KEY` requirement preserved
- [ ] state nonce is one-time consumed
- [ ] PKCE remains enabled (`code_challenge_method=S256`)
- [ ] refresh path tested
- [ ] disconnect path revokes/removes token data

### Agent/tool changes

- [ ] write tools still require confirmation
- [ ] no hidden tool execution before auth gates
- [ ] parsing changes covered by tests

### Heartbeat changes

- [ ] due-check uses cron + timezone
- [ ] dedupe slot key still enforced
- [ ] failure logging remains structured

## Commands You Should Use

- Validate everything:
```bash
pnpm check
```

- Focused test files:
```bash
pnpm test -- test/google-oauth-service.test.ts
pnpm test -- test/provider-clients.test.ts
pnpm test -- test/cron-lite.test.ts
```

- Search quickly:
```bash
rg "pattern" src test docs
```

## Common Pitfalls

1. Breaking runtime by requiring optional env in constructor paths.
- Prefer feature gating over hard failure unless the feature is explicitly invoked.

2. Timezone bugs in tests.
- Use relative assertions or explicit UTC assumptions.

3. Reintroducing plaintext secrets.
- Never persist raw OAuth token objects.

4. Cron over-sending.
- Do not remove `shouldRunCronNow` + slot dedupe logic.

## Definition of Done

A task is done only when:

1. Code + tests are updated.
2. `pnpm check` passes.
3. Security invariants above are preserved.
4. Docs are updated if behavior changes.
