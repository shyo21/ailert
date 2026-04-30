import { sendDiscordWebhook } from "../discord";
import { formatIncident } from "../formatters/incident";
import type { Env, StatuspageIncident, WebhookEnvKey } from "../types";

interface IncidentsApiResponse {
  incidents: StatuspageIncident[];
}

interface StoredIncidentState {
  status: string;
  updated_at: string;
}

type StoredState = Record<string, StoredIncidentState>;

interface PollingTarget {
  name: string;
  statusUrl: string;
  apiUrl: string;
  envKey: string;
  kvPrefix: string;
}

export async function pollTarget(target: PollingTarget, env: Env): Promise<void> {
  const webhookUrl = env[target.envKey as WebhookEnvKey];
  if (!webhookUrl) {
    console.error(`No Discord webhook for ${target.name} (env.${target.envKey})`);
    return;
  }

  const response = await fetch(target.apiUrl);
  if (!response.ok) {
    console.error(`Failed to fetch ${target.apiUrl}: ${response.status}`);
    return;
  }

  const data = await response.json<IncidentsApiResponse>();
  const currentIncidents = data.incidents.slice(0, 10);

  const kvKey = `${target.kvPrefix}:incidents`;
  const storedRaw = await env.STATUS_STORE.get(kvKey);
  const stored: StoredState = storedRaw ? JSON.parse(storedRaw) : {};

  const changedIncidents: StatuspageIncident[] = [];

  for (const incident of currentIncidents) {
    const prev = stored[incident.id];

    if (!prev) {
      changedIncidents.push(incident);
      continue;
    }

    if (prev.status !== incident.status || prev.updated_at !== incident.updated_at) {
      changedIncidents.push(incident);
    }
  }

  if (changedIncidents.length === 0) return;

  for (const incident of changedIncidents) {
    const body = formatIncident(target.name, target.statusUrl, incident);
    const result = await sendDiscordWebhook(webhookUrl, body);
    if (!result.ok) {
      console.error(`Discord send failed for ${target.name}/${incident.id}: ${result.status}`);
    }
  }

  const nextState: StoredState = {};
  for (const incident of currentIncidents) {
    nextState[incident.id] = {
      status: incident.status,
      updated_at: incident.updated_at,
    };
  }
  await env.STATUS_STORE.put(kvKey, JSON.stringify(nextState));
}
