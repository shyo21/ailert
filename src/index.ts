import { verifyToken } from "./auth";
import { PAGE_CONFIG, POLLING_TARGETS } from "./config";
import { sendDiscordWebhook } from "./discord";
import { formatComponentUpdate } from "./formatters/component";
import { formatIncident } from "./formatters/incident";
import { handleOci } from "./oci";
import { pollOciEgress } from "./polling/oci-usage";
import { pollTarget } from "./polling/status-poller";
import type { Env, StatuspageWebhookPayload, WebhookEnvKey } from "./types";

const EGRESS_CRON = "0 12 * * *";

async function handleStatuspage(request: Request, env: Env): Promise<Response> {
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
}

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (controller.cron === EGRESS_CRON) {
      ctx.waitUntil(pollOciEgress(env));
      return;
    }
    // Default: STATUSPAGE_POLL_CRON ("*/2 * * * *") — Statuspage polling.
    const tasks = POLLING_TARGETS.map((target) => pollTarget(target, env));
    ctx.waitUntil(Promise.allSettled(tasks));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const path = new URL(request.url).pathname;

    const spMatch = path.match(/^\/sp\/([^/]+)$/);
    if (spMatch) {
      if (!(await verifyToken(spMatch[1], env.STATUSPAGE_WEBHOOK_SECRET))) {
        return new Response("Unauthorized", { status: 401 });
      }
      return handleStatuspage(request, env);
    }

    const ociMatch = path.match(/^\/oci\/([^/]+)$/);
    if (ociMatch) {
      return handleOci(request, env, ociMatch[1]);
    }

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
