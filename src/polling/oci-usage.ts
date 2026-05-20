import { sendDiscordWebhook } from "../discord";
import { signOciRequest } from "../oci/signer";
import type { Env } from "../types";

// Always Free outbound 10 TB/month.
const FREE_TIER_LIMIT_GB = 10 * 1024;

interface Tier {
  pct: number;
  label: string;
  color: number;
}

const TIERS: Tier[] = [
  { pct: 50, label: "50%", color: 0xfaa72a }, // yellow
  { pct: 75, label: "75%", color: 0xe86235 }, // orange
  { pct: 90, label: "90%", color: 0xe04343 }, // red
];

interface UsageItem {
  "sku-name"?: string;
  skuName?: string;
  "computed-quantity"?: number;
  computedQuantity?: number;
  unit?: string;
}

interface UsageResponse {
  items?: UsageItem[];
}

function fmtIsoNoMillis(d: Date): string {
  // OCI requires ISO 8601 without millis: "2026-05-01T00:00:00Z"
  return d.toISOString().replace(/\.\d+Z$/, "Z");
}

export async function pollOciEgress(env: Env): Promise<void> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  // Use today (start of day UTC) as upper bound — Usage API has ~24h delay.
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  const requestBody = JSON.stringify({
    tenantId: env.OCI_TENANCY_OCID,
    timeUsageStarted: fmtIsoNoMillis(monthStart),
    timeUsageEnded: fmtIsoNoMillis(todayStart),
    granularity: "MONTHLY",
    queryType: "USAGE",
    groupBy: ["skuName"],
  });

  const url = `https://usageapi.${env.OCI_REGION}.oci.oraclecloud.com/20200107/usage`;

  let headers: Record<string, string>;
  try {
    headers = await signOciRequest({
      method: "POST",
      url,
      body: requestBody,
      privateKeyPem: env.OCI_PRIVATE_KEY_PEM,
      tenancy: env.OCI_TENANCY_OCID,
      user: env.OCI_USER_OCID,
      fingerprint: env.OCI_KEY_FINGERPRINT,
    });
  } catch (e) {
    console.error("OCI request signing failed:", e);
    return;
  }

  const res = await fetch(url, { method: "POST", headers, body: requestBody });
  if (!res.ok) {
    const text = await res.text();
    console.error(`OCI Usage API ${res.status}: ${text.slice(0, 500)}`);
    return;
  }

  const data = await res.json<UsageResponse>();
  let totalGB = 0;
  for (const item of data.items ?? []) {
    const sku = item["sku-name"] ?? item.skuName ?? "";
    if (sku.includes("Outbound Data Transfer")) {
      totalGB += item["computed-quantity"] ?? item.computedQuantity ?? 0;
    }
  }

  const pct = (totalGB / FREE_TIER_LIMIT_GB) * 100;
  const monthKey = monthStart.toISOString().slice(0, 7); // YYYY-MM
  const stateKey = `egress:${monthKey}:last-tier`;
  const lastTier = parseInt((await env.STATUS_STORE.get(stateKey)) ?? "0", 10);

  // Find the highest tier currently crossed that we haven't yet alerted.
  let crossedTier: Tier | null = null;
  for (const t of TIERS) {
    if (pct >= t.pct && t.pct > lastTier) {
      crossedTier = t;
    }
  }

  console.log(
    `oci-egress: month=${monthKey} totalGB=${totalGB.toFixed(2)} pct=${pct.toFixed(2)} ` +
      `lastTier=${lastTier} crossed=${crossedTier?.pct ?? "-"}`,
  );

  if (!crossedTier) return;

  const remainingGB = FREE_TIER_LIMIT_GB - totalGB;
  const result = await sendDiscordWebhook(env.DISCORD_WEBHOOK_OCI, {
    username: "OCI Egress",
    embeds: [
      {
        title: `📊 OCI Egress ${crossedTier.label} 도달`,
        description:
          `이번 달(${monthKey}) 누적 송신: **${totalGB.toFixed(1)} GB** / 10 TB ` +
          `(${pct.toFixed(1)}%)\n\n` +
          `Always Free 한도까지 ${remainingGB.toFixed(0)} GB 남음. ` +
          `초과 시 PAYG 청구 시작.`,
        color: crossedTier.color,
        timestamp: now.toISOString(),
        footer: { text: "OCI Usage API · ailert" },
      },
    ],
  });

  if (!result.ok) {
    console.error(`Discord send failed: ${result.status} ${result.statusText}`);
    return;
  }

  await env.STATUS_STORE.put(stateKey, String(crossedTier.pct));
}
