import type { ComponentStatus, IncidentImpact, IncidentStatus, ServiceConfig } from "./types";

export const PAGE_CONFIG: Record<string, ServiceConfig> = {
  "tymt9n04zgry": {
    name: "Claude",
    statusUrl: "https://status.claude.com",
    envKey: "DISCORD_WEBHOOK_CLAUDE",
  },
  "kctbh9vrtdwd": {
    name: "GitHub",
    statusUrl: "https://www.githubstatus.com",
    envKey: "DISCORD_WEBHOOK_GITHUB",
  },
};

export const POLLING_TARGETS = [
  {
    name: "OpenAI",
    statusUrl: "https://status.openai.com",
    apiUrl: "https://status.openai.com/api/v2/incidents.json",
    envKey: "DISCORD_WEBHOOK_OPENAI" as const,
    kvPrefix: "openai",
  },
];

export const COLORS = {
  critical: 0xe04343,
  major: 0xe86235,
  minor: 0xfaa72a,
  resolved: 0x76ad2a,
  maintenance: 0x2c84db,
  neutral: 0x87867f,
} as const;

export function getIncidentColor(impact: IncidentImpact, status: IncidentStatus): number {
  if (status === "resolved" || status === "completed") return COLORS.resolved;
  if (status === "scheduled" || status === "in_progress") return COLORS.maintenance;

  switch (impact) {
    case "critical":
      return COLORS.critical;
    case "major":
      return COLORS.major;
    case "minor":
      return COLORS.minor;
    case "none":
      return COLORS.neutral;
  }
}

export function getComponentColor(status: ComponentStatus): number {
  switch (status) {
    case "operational":
      return COLORS.resolved;
    case "degraded_performance":
      return COLORS.minor;
    case "partial_outage":
      return COLORS.major;
    case "major_outage":
      return COLORS.critical;
    case "under_maintenance":
      return COLORS.maintenance;
  }
}

const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  investigating: "Investigating",
  identified: "Identified",
  monitoring: "Monitoring",
  resolved: "Resolved",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
};

const COMPONENT_STATUS_LABEL: Record<ComponentStatus, string> = {
  operational: "Operational",
  degraded_performance: "Degraded Performance",
  partial_outage: "Partial Outage",
  major_outage: "Major Outage",
  under_maintenance: "Under Maintenance",
};

const INCIDENT_STATUS_EMOJI: Record<IncidentStatus, string> = {
  investigating: "\u{1F50D}",
  identified: "\u{1F4CB}",
  monitoring: "\u{1F440}",
  resolved: "\u2705",
  scheduled: "\u{1F4C5}",
  in_progress: "\u{1F6E0}\uFE0F",
  completed: "\u2705",
};

const COMPONENT_STATUS_EMOJI: Record<ComponentStatus, string> = {
  operational: "\u{1F7E2}",
  degraded_performance: "\u{1F7E1}",
  partial_outage: "\u{1F7E0}",
  major_outage: "\u{1F534}",
  under_maintenance: "\u{1F535}",
};

export function getIncidentStatusLabel(status: IncidentStatus): string {
  return `${INCIDENT_STATUS_EMOJI[status]} ${INCIDENT_STATUS_LABEL[status]}`;
}

export function getComponentStatusLabel(status: ComponentStatus): string {
  return `${COMPONENT_STATUS_EMOJI[status]} ${COMPONENT_STATUS_LABEL[status]}`;
}
