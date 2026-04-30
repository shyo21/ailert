import { PAGE_CONFIG, POLLING_TARGETS } from "./config";
import { sendDiscordWebhook } from "./discord";
import { formatComponentUpdate } from "./formatters/component";
import { formatIncident } from "./formatters/incident";
import { pollTarget } from "./polling/status-poller";
import type { Env, StatuspageWebhookPayload, WebhookEnvKey } from "./types";

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const tasks = POLLING_TARGETS.map((target) => pollTarget(target, env));
    ctx.waitUntil(Promise.allSettled(tasks));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    let payload: StatuspageWebhookPayload;
    try {
      payload = await request.json<StatuspageWebhookPayload>();
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    const pageId = payload.page?.id;
    if (!pageId) {
      return new Response("Missing page.id", { status: 400 });
    }

    const service = PAGE_CONFIG[pageId];
    if (!service) {
      return new Response("Unknown page", { status: 403 });
    }

    const webhookUrl = env[service.envKey as WebhookEnvKey];
    if (!webhookUrl) {
      console.error(`No Discord webhook configured for ${service.name} (env.${service.envKey})`);
      return new Response("Webhook not configured", { status: 500 });
    }

    if (payload.incident) {
      const body = formatIncident(service.name, service.statusUrl, payload.incident);
      const result = await sendDiscordWebhook(webhookUrl, body);
      if (!result.ok) {
        console.error(`Discord webhook failed: ${result.status} ${result.statusText}`);
        return new Response("Discord delivery failed", { status: 502 });
      }
      return new Response("OK", { status: 200 });
    }

    if (payload.component_update && payload.component) {
      const body = formatComponentUpdate(service.name, payload.component, payload.component_update);
      const result = await sendDiscordWebhook(webhookUrl, body);
      if (!result.ok) {
        console.error(`Discord webhook failed: ${result.status} ${result.statusText}`);
        return new Response("Discord delivery failed", { status: 502 });
      }
      return new Response("OK", { status: 200 });
    }

    return new Response("Unrecognized event type", { status: 422 });
  },
} satisfies ExportedHandler<Env>;
