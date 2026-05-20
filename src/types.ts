export interface StatuspageMeta {
  unsubscribe: string;
  documentation: string;
}

export interface StatuspagePage {
  id: string;
  status_indicator: string;
  status_description: string;
}

export interface StatuspageComponentUpdate {
  created_at: string;
  new_status: ComponentStatus;
  old_status: ComponentStatus;
  id: string;
  component_id: string;
}

export interface StatuspageComponent {
  created_at: string;
  id: string;
  name: string;
  status: ComponentStatus;
}

export interface StatuspageAffectedComponent {
  code: string;
  name: string;
  old_status: ComponentStatus;
  new_status: ComponentStatus;
}

export interface StatuspageIncidentUpdate {
  id: string;
  incident_id: string;
  status: IncidentStatus;
  body: string;
  created_at: string;
  display_at: string;
  updated_at: string;
  affected_components?: StatuspageAffectedComponent[];
}

export interface StatuspageIncident {
  id: string;
  name: string;
  status: IncidentStatus;
  impact: IncidentImpact;
  shortlink?: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  monitoring_at?: string | null;
  scheduled_for?: string | null;
  scheduled_until?: string | null;
  incident_updates: StatuspageIncidentUpdate[];
  components?: StatuspageComponent[];
}

/** Payload has either `incident` or `component_update` key, never both */
export interface StatuspageWebhookPayload {
  meta: StatuspageMeta;
  page: StatuspagePage;
  incident?: StatuspageIncident;
  component_update?: StatuspageComponentUpdate;
  component?: StatuspageComponent;
}

export type ComponentStatus =
  | "operational"
  | "degraded_performance"
  | "partial_outage"
  | "major_outage"
  | "under_maintenance";

export type IncidentStatus =
  | "investigating"
  | "identified"
  | "monitoring"
  | "resolved"
  | "scheduled"
  | "in_progress"
  | "completed";

export type IncidentImpact = "none" | "minor" | "major" | "critical";

export interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  url?: string;
  timestamp?: string;
  footer?: {
    text: string;
    icon_url?: string;
  };
  fields?: DiscordEmbedField[];
}

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordWebhookBody {
  username: string;
  embeds: DiscordEmbed[];
}

export interface ServiceConfig {
  name: string;
  statusUrl: string;
  envKey: string;
}

export type WebhookEnvKey = "DISCORD_WEBHOOK_CLAUDE" | "DISCORD_WEBHOOK_GITHUB" | "DISCORD_WEBHOOK_OPENAI";

export interface Env {
  STATUS_STORE: KVNamespace;
  DISCORD_WEBHOOK_CLAUDE: string;
  DISCORD_WEBHOOK_GITHUB: string;
  DISCORD_WEBHOOK_OPENAI: string;
  DISCORD_WEBHOOK_OCI: string;
  OCI_WEBHOOK_SECRET: string;
  // OCI Usage API egress polling
  OCI_TENANCY_OCID: string;
  OCI_USER_OCID: string;
  OCI_KEY_FINGERPRINT: string;
  OCI_PRIVATE_KEY_PEM: string;
  OCI_REGION: string;
}

// ----- OCI Notifications -----

export type OciSeverity = "CRITICAL" | "ERROR" | "WARNING" | "INFO";

export type OciAlarmType =
  | "OK_TO_FIRING"
  | "FIRING_TO_OK"
  | "REPEAT"
  | "RESET"
  | "RESEND";

export interface OciAlarmMetadata {
  id: string;
  status: "FIRING" | "OK" | "SUSPENDED";
  severity: OciSeverity;
  namespace: string;
  query: string;
  totalMetricsFiring: number;
  dimensions?: Array<Record<string, string>>;
  alarmUrl: string;
}

export interface OciNotificationPayload {
  dedupeKey: string;
  title: string;
  body: string;
  type: OciAlarmType;
  severity: OciSeverity;
  timestampEpochMillis: number;
  alarmMetaData: OciAlarmMetadata[];
  version?: number;
}

export interface OciSubscriptionConfirmationPayload {
  ConfirmationURL?: string;
  confirmationURL?: string;
  MessageType?: string;
  TopicId?: string;
}
