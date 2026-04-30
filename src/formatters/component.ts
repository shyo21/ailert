import { getComponentColor, getComponentStatusLabel } from "../config";
import type {
  DiscordWebhookBody,
  StatuspageComponent,
  StatuspageComponentUpdate,
} from "../types";

export function formatComponentUpdate(
  serviceName: string,
  component: StatuspageComponent,
  update: StatuspageComponentUpdate,
): DiscordWebhookBody {
  const oldLabel = getComponentStatusLabel(update.old_status);
  const newLabel = getComponentStatusLabel(update.new_status);
  const color = getComponentColor(update.new_status);

  return {
    username: `${serviceName} Status`,
    embeds: [
      {
        title: `Component: ${component.name}`,
        description: `${oldLabel} → ${newLabel}`,
        color,
        timestamp: update.created_at,
        footer: { text: serviceName },
      },
    ],
  };
}
