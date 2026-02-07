# Lite Claw

A security-first personal AI agent that runs on serverless infrastructure and communicates via Telegram.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## What is Lite Claw?

Lite Claw is a personal AI assistant that:

- **Runs on your own infrastructure** - Deploy to Modal, Railway, Vercel, or AWS Lambda
- **Communicates via Telegram** - No exposed ports, no vulnerable gateways
- **Uses your OpenRouter API key** - You control costs and model choice
- **Respects your privacy** - Scoped integrations, confirmation prompts, no data hoarding

Inspired by OpenClaw, but redesigned with security as the foundation.

---

## Current MVP Target

The implemented code path in this repo is:

- **Platform:** Railway (TypeScript, long polling)
- **Persistence:** Neon Postgres + Upstash Redis
- **Ownership bootstrap:** one-time secret claim code via `/claim <code>`
- **Quality gates:** `pnpm check` (lint + typecheck + tests + build)

Minimum env vars for the current runtime are listed in `.env.example`.

---

## Why Lite Claw?

| Problem with typical AI agents | Lite Claw's approach |
|--------------------------------|------------------------|
| Exposed gateway ports (Shodan finds them) | No exposed ports - Telegram only |
| No authentication by default | Telegram handles auth + whitelist |
| Full browser/shell access | Scoped MCPs with limited capabilities |
| Agent can do anything silently | Confirmation prompts for sensitive actions |
| Complex always-on infrastructure | Serverless - pay only when used |
| Vendor controls costs | You bring your own OpenRouter key |

---

## Features

### Security First
- No exposed network ports
- Telegram-based authentication with user ID whitelist
- Tiered tool permissions (auto-approve vs. confirm)
- Prompt injection defenses
- Agent cannot modify its own configuration

### Serverless Native
- Runs on Modal, Railway, Vercel, or AWS Lambda
- Scale to zero when not in use
- Cold start friendly (webhook-based)
- ~$1-10/month for typical usage

### Personal Assistant Capabilities
- **Calendar** - Read/write Google Calendar, Apple Calendar
- **Email** - Read Gmail, Outlook (summaries, not full body by default)
- **Notes** - Notion, Obsidian integration
- **Code** - GitHub issues, PRs, notifications
- **Weather** - Daily forecasts

### Automated Heartbeats
- Morning briefing (weather + calendar + email highlights)
- Weekly review (summary + upcoming week)
- Custom scheduled tasks

### Model Flexibility
- Default: Claude Haiku (fast, affordable)
- Premium: Claude Opus (complex reasoning)
- Alternative: Kimi K2.5 (strong agentic capabilities)
- Switch anytime with `/model`

---

## Quick Start

### 1. Get Your Keys

**Telegram Bot:**
1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow prompts
3. Copy the bot token

**OpenRouter:**
1. Sign up at [openrouter.ai](https://openrouter.ai)
2. Add $5-10 credits
3. Create an API key

### 2. Deploy (Railway, TypeScript)

```bash
pnpm install
pnpm migrate
pnpm check
pnpm build
pnpm start
```

Set Railway environment variables from `.env.example`, especially:
- `OWNER_CLAIM_CODE`
- `OWNER_CLAIM_PEPPER`
- `DATABASE_URL` (Neon)
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `PUBLIC_BASE_URL`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `TOKEN_ENCRYPTION_KEY` (32-byte secret, base64url)

For dedicated Railway cron services:

- Morning: set `HEARTBEAT_JOB_TYPE=morning_briefing`, run `pnpm heartbeat:run`
- Weekly: set `HEARTBEAT_JOB_TYPE=weekly_review`, run `pnpm heartbeat:run`

### 3. Start Chatting

Message your bot on Telegram:

```
You: /start

Bot: Hey! I'm your new assistant. Let's get set up.
     Your Telegram ID is: 123456789.
     Use /claim <your-secret-claim-code>.

You: /claim super-secret-code

Bot: Claim successful. You are now the owner and whitelisted.
```

The bot will walk you through:
1. Personalization (name, preferences, communication style)
2. Model selection (Haiku, Opus, or Kimi)
3. Integration setup (Google Calendar, Gmail, etc.)
4. Heartbeat configuration (morning briefing, weekly review)

---

## Usage

### One-off Questions

```
You: What's on my calendar tomorrow?
Bot: Tomorrow (Monday, Feb 10):
     • 9:00am - Standup [Work]
     • 11:30am - Lunch with Alex [Personal]
     • 3:00pm - Design review [Work]

You: What's the weather this weekend?
Bot: Weekend forecast for San Francisco:
     Saturday: 65°F, sunny
     Sunday: 62°F, partly cloudy
```

### Actions (with Confirmation)

```
You: Add dentist appointment Friday 2pm

Bot: I'll create this event:
     Title: Dentist appointment
     When: Friday, Feb 14, 2:00pm
     Calendar: Personal (Google)

     Reply YES to confirm.

You: yes

Bot: Done! Added to your calendar.
```

### Commands

| Command | Description |
|---------|-------------|
| `/integrations` | Configure/check Weather, Google Calendar, Gmail |
| `/integrations connect <calendar|gmail>` | Start Google OAuth connect flow |
| `/integrations disconnect <calendar|gmail>` | Revoke and remove Google tokens |
| `/heartbeats` | Enable/disable morning and weekly briefings |
| `/profile` | View/edit your profile |
| `/model` | View/switch AI model |
| `/help` | Show all commands |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Serverless Platform (Modal/Railway/Vercel/Lambda)               │
│                                                                 │
│  Telegram Webhook                                               │
│       ↓                                                         │
│  Auth Check (whitelist) → Reject if not allowed                 │
│       ↓                                                         │
│  Agent Loop                                                     │
│       ↓                                                         │
│  Tool Call? → Tier Check → Confirm if needed → Execute MCP      │
│       ↓                                                         │
│  Response via Telegram                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
         ↑
         │ HTTPS (webhook)
         ↓
┌─────────────────┐      ┌─────────────────┐
│ Telegram API    │      │ OpenRouter API  │
└─────────────────┘      │ (Claude/Kimi)   │
         ↑               └─────────────────┘
         │
┌─────────────────┐
│ Your Phone      │
└─────────────────┘
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [Platform Selection Guide](docs/platform-selection-guide.md) | Choose Modal vs Railway vs Vercel vs Lambda |
| [Agent Architecture](docs/agent-architecture.md) | How the agent works, security model |
| [MCP & Heartbeat Design](docs/mcp-and-heartbeat-design.md) | Integrations and scheduled tasks |
| [Provider Integrations](docs/provider-integrations.md) | Google, GitHub, Notion setup |
| [Onboarding Flow](docs/onboarding-flow.md) | User setup experience |
| [Security Research](docs/openclaw-security-research.md) | Security architecture decisions |
| [Production Implementation Guide](docs/production-implementation-guide.md) | End-to-end deploy, validation, and go-live path |
| [Production Test Checklist](docs/test-execution-checklist.md) | Copy/paste validation steps before go-live |
| [Operations Runbook](docs/operations-runbook.md) | Rotation, incidents, production checks |
| [AGENTS Guide](AGENTS.md) | Agent-oriented implementation and workflow guide |

---

## Cost

### Platform Costs

| Platform | Typical Cost | Notes |
|----------|--------------|-------|
| Modal | $0-5/month | Scale to zero, pay per request |
| Railway | $5-10/month | Always-on option |
| Vercel | $0-20/month | Free tier generous |
| Lambda | $0-5/month | Free tier covers light use |

### LLM Costs (via OpenRouter)

| Model | Input | Output | Typical Monthly |
|-------|-------|--------|-----------------|
| Claude Haiku | $0.25/M | $1.25/M | $1-5 |
| Kimi K2.5 | $0.60/M | $3.00/M | $3-10 |
| Claude Opus | $15/M | $75/M | $10-50 |

**Typical total: $5-15/month for moderate use with Haiku.**

---

## Security

Lite Claw is designed with security as the primary concern:

### No Exposed Ports
Unlike OpenClaw's gateway (port 18789), Lite Claw has no listening ports. Communication is outbound-only to Telegram's API.

### Authentication
- Telegram handles user authentication
- Whitelist restricts who can talk to your agent
- Only the owner can modify settings

### Scoped Permissions
- MCPs have limited capabilities (no arbitrary web browsing)
- Tier system: auto-approve (read) vs. confirm (write)
- Agent cannot modify its own configuration

### Prompt Injection Defenses
- System prompt hardening
- Output sanitization
- Suspicious content alerts
- Confirmation gates as final defense

See [Security Research](docs/openclaw-security-research.md) for full details.

---

## Contributing

Contributions welcome! Please read our contributing guidelines (coming soon).

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Acknowledgments

- Inspired by [OpenClaw](https://github.com/openclaw/openclaw) and its community
- Uses [mcporter](https://github.com/steipete/mcporter) for MCP tooling
- Powered by [OpenRouter](https://openrouter.ai) for model access

---

## Support

- [GitHub Issues](https://github.com/yourusername/lite-claw/issues) - Bug reports and feature requests
- [Discussions](https://github.com/yourusername/lite-claw/discussions) - Questions and community chat
