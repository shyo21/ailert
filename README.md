# ailert

**English** | [한국어](./README.ko.md)

A Cloudflare Worker that relays AI service status page updates to Discord.

It supports two delivery modes:

- **Webhook relay** — receives Statuspage webhooks (Claude, GitHub) at the worker URL and forwards formatted embeds to Discord.
- **Polling** — services that don't offer webhooks (OpenAI) are polled every 2 minutes via the public Statuspage API; new and updated incidents are diffed against KV-stored state and pushed to Discord.

## Supported services

| Service | Mode    | Statuspage page ID |
| ------- | ------- | ------------------ |
| Claude  | Webhook | `tymt9n04zgry`     |
| GitHub  | Webhook | `kctbh9vrtdwd`     |
| OpenAI  | Polling | —                  |

Adding more services: edit `src/config.ts` (`PAGE_CONFIG` for webhook-based, `POLLING_TARGETS` for polled services).

## Requirements

- Cloudflare account with Workers + KV enabled
- Node.js 18+
- A Discord webhook URL per service you want to forward

## Setup

1. Install dependencies:
   ```sh
   npm install
   ```

2. Create a KV namespace and update its `id` in `wrangler.jsonc` (binding name: `STATUS_STORE`):
   ```sh
   npx wrangler kv namespace create STATUS_STORE
   ```

3. Set Discord webhook URLs as Worker secrets:
   ```sh
   npx wrangler secret put DISCORD_WEBHOOK_CLAUDE
   npx wrangler secret put DISCORD_WEBHOOK_GITHUB
   npx wrangler secret put DISCORD_WEBHOOK_OPENAI
   ```

   For local development, place the same keys in `.dev.vars` (gitignored):
   ```
   DISCORD_WEBHOOK_CLAUDE=https://discord.com/api/webhooks/...
   DISCORD_WEBHOOK_GITHUB=https://discord.com/api/webhooks/...
   DISCORD_WEBHOOK_OPENAI=https://discord.com/api/webhooks/...
   ```

4. Configure each Statuspage subscription (Claude, GitHub) to POST to your deployed Worker URL.

## Scripts

| Command             | Description                                  |
| ------------------- | -------------------------------------------- |
| `npm run dev`       | Run the Worker locally with `wrangler dev`   |
| `npm run deploy`    | Deploy to Cloudflare Workers                 |
| `npm run check`     | Type-check (`tsc --noEmit`)                  |
| `npm run cf-typegen`| Regenerate Cloudflare bindings types         |

## How it works

- `fetch` handler: validates the incoming Statuspage payload, looks up the service by `page.id`, formats either an `incident` or `component_update` embed, and posts to the matching Discord webhook.
- `scheduled` handler: runs every 2 minutes (`*/2 * * * *`), fetches each polling target's `incidents.json`, diffs the latest 10 incidents against state in KV (`STATUS_STORE`), and posts only new or updated ones.

## Project structure

```
src/
├── index.ts                  # Worker entry (fetch + scheduled handlers)
├── config.ts                 # Service registry, colors, status labels
├── discord.ts                # Discord webhook sender
├── types.ts                  # Statuspage + Worker env types
├── formatters/
│   ├── incident.ts           # Incident → Discord embed
│   └── component.ts          # Component update → Discord embed
└── polling/
    └── status-poller.ts      # Statuspage API poller with KV state
```

## OCI Notifications (Oracle Cloud)

Receive Oracle Cloud Infrastructure Monitoring alarms in Discord.

### One-time setup

1. Generate a webhook secret: `openssl rand -hex 32`. Save the value.
2. Register the secret with the worker: `wrangler secret put OCI_WEBHOOK_SECRET` (paste the value at the prompt).
3. Register the Discord webhook URL: `wrangler secret put DISCORD_WEBHOOK_OCI`.
4. Deploy: `npm run deploy`.

### Per-alarm setup (OCI side)

1. Create (or reuse) a Notifications **Topic** in OCI.
2. Create an **HTTPS Subscription** on that topic with URL:
   `https://ailert.<your-cf-account>.workers.dev/oci/<OCI_WEBHOOK_SECRET>`
   The worker auto-confirms — the subscription should transition to `ACTIVE` within seconds.
3. Create a Monitoring **Alarm** and set its destination to the Topic above.

All alarms routed through this endpoint are delivered to a single Discord channel (`DISCORD_WEBHOOK_OCI`).

## License

No license specified — all rights reserved by default. Open an issue if you'd like an OSS license added.
