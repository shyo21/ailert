import { getIncidentColor, getIncidentStatusLabel } from "../config";
import type { DiscordWebhookBody, StatuspageIncident } from "../types";

export function formatIncident(
  serviceName: string,
  statusUrl: string,
  incident: StatuspageIncident,
): DiscordWebhookBody {
  const latestUpdate = incident.incident_updates[0];
  const statusLabel = getIncidentStatusLabel(incident.status);
  const color = getIncidentColor(incident.impact, incident.status);

  const description = latestUpdate?.body || incident.name;

  const fields = [];

  fields.push({ name: "Status", value: statusLabel, inline: true });
  fields.push({ name: "Impact", value: incident.impact, inline: true });

  const components = incident.components ?? [];
  if (components.length > 0) {
    const names = components.map((c) => c.name).join(", ");
    fields.push({ name: "Components", value: names, inline: false });
  }

  if (incident.scheduled_for) {
    fields.push({ name: "Scheduled For", value: incident.scheduled_for, inline: true });
  }
  if (incident.scheduled_until) {
    fields.push({ name: "Scheduled Until", value: incident.scheduled_until, inline: true });
  }

  return {
    username: `${serviceName} Status`,
    embeds: [
      {
        title: incident.name,
        description,
        color,
        url: incident.shortlink || statusUrl,
        timestamp: incident.updated_at,
        footer: { text: serviceName },
        fields,
      },
    ],
  };
}
