import { COLORS } from "./config";
import { sendDiscordWebhook } from "./discord";
import type {
  DiscordEmbed,
  DiscordEmbedField,
  DiscordWebhookBody,
  Env,
  OciAlarmType,
  OciNotificationPayload,
  OciSeverity,
  OciSubscriptionConfirmationPayload,
} from "./types";

/** Color for the Discord embed based on OCI severity and alarm transition type. */
export function getOciColor(severity: OciSeverity, type: OciAlarmType): number {
  if (type === "FIRING_TO_OK") return COLORS.resolved;
  switch (severity) {
    case "CRITICAL":
      return COLORS.critical;
    case "ERROR":
      return COLORS.major;
    case "WARNING":
      return COLORS.minor;
    case "INFO":
      return COLORS.neutral;
    default:
      return COLORS.neutral;
  }
}

/** Build a Discord webhook body from an OCI alarm notification payload. */
export function formatOciAlarm(payload: OciNotificationPayload): DiscordWebhookBody {
  const meta = payload.alarmMetaData?.[0];
  const dim = meta?.dimensions?.[0] ?? {};

  const resource = dim.resourceDisplayName ?? dim.resourceId ?? "(unknown)";
  const region = dim.region ?? "";
  const resourceLabel = region ? `${resource} (${region})` : resource;

  const fields: DiscordEmbedField[] = [
    { name: "Resource", value: resourceLabel, inline: true },
    { name: "Status", value: payload.type, inline: true },
  ];

  if (meta) {
    fields.push({ name: "Namespace", value: meta.namespace });
    fields.push({ name: "Query", value: "```\n" + meta.query + "\n```" });
  }

  const embed: DiscordEmbed = {
    title: payload.title,
    description: payload.body,
    color: getOciColor(payload.severity, payload.type),
    url: meta?.alarmUrl,
    timestamp: new Date(payload.timestampEpochMillis).toISOString(),
    footer: { text: "Oracle Cloud Infrastructure" },
    fields,
  };

  return {
    username: "OCI Alarm",
    embeds: [embed],
  };
}

/**
 * Constant-time comparison via SHA-256 + crypto.subtle.timingSafeEqual.
 *
 * Hashes both inputs to a fixed 32-byte digest so neither the length
 * nor any prefix of `expected` can be inferred from response timing.
 * Cloudflare guidance: developers.cloudflare.com/workers/best-practices/workers-best-practices/
 */
async function verifyToken(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

/**
 * Handle a POST request to /oci/:token.
 *
 * Authenticates by comparing the URL path token to env.OCI_WEBHOOK_SECRET
 * in constant time (verifyToken), then dispatches based on the OCI
 * Notifications message type.
 */
export async function handleOci(
  request: Request,
  env: Env,
  token: string,
): Promise<Response> {
  if (!(await verifyToken(token, env.OCI_WEBHOOK_SECRET))) {
    return new Response("Unauthorized", { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const headerType = request.headers.get("X-OCI-NS-MessageType") ?? "";
  const bodyAsRecord = (rawBody ?? {}) as Record<string, unknown>;
  const bodyType =
    (typeof bodyAsRecord.MessageType === "string" && bodyAsRecord.MessageType) ||
    (typeof bodyAsRecord.messageType === "string" && bodyAsRecord.messageType) ||
    "";

  const inferredType =
    !headerType && !bodyType && Array.isArray(bodyAsRecord.alarmMetaData)
      ? "Notification"
      : "";

  const messageType = headerType || bodyType || inferredType;

  if (messageType === "SubscriptionConfirmation") {
    const confirmation = rawBody as OciSubscriptionConfirmationPayload;
    const confirmUrl = confirmation.ConfirmationURL ?? confirmation.confirmationURL;
    if (!confirmUrl) {
      console.error("SubscriptionConfirmation missing ConfirmationURL");
      return new Response("Bad Request", { status: 400 });
    }
    const resp = await fetch(confirmUrl, { method: "GET" });
    if (!resp.ok) {
      console.error(`OCI subscription confirmation failed: ${resp.status} ${resp.statusText}`);
      return new Response("Confirmation failed", { status: 502 });
    }
    console.log(`OCI subscription confirmed (TopicId=${confirmation.TopicId ?? "?"})`);
    return new Response("OK", { status: 200 });
  }

  if (messageType === "Notification") {
    if (!env.DISCORD_WEBHOOK_OCI) {
      console.error("DISCORD_WEBHOOK_OCI not configured");
      return new Response("Webhook not configured", { status: 500 });
    }
    const payload = rawBody as OciNotificationPayload;
    if (!payload.title || !payload.body) {
      console.error("OCI Notification payload missing required fields");
      return new Response("Bad Request", { status: 400 });
    }
    const webhookBody = formatOciAlarm(payload);
    const result = await sendDiscordWebhook(env.DISCORD_WEBHOOK_OCI, webhookBody);
    if (!result.ok) {
      console.error(`Discord webhook failed: ${result.status} ${result.statusText}`);
      return new Response("Discord delivery failed", { status: 502 });
    }
    return new Response("OK", { status: 200 });
  }

  console.log(`Ignored OCI message (type=${messageType || "unknown"})`);
  return new Response("Ignored", { status: 200 });
}
