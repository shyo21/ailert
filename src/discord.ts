import type { DiscordWebhookBody } from "./types";

export async function sendDiscordWebhook(
  webhookUrl: string,
  body: DiscordWebhookBody,
): Promise<{ ok: boolean; status: number; statusText: string }> {
  const url = new URL(webhookUrl);
  url.searchParams.set("wait", "true");

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
  };
}
