/**
 * Cloudflare Worker: Atlassian Statuspage -> Discord Webhook Relay
 *
 * status.claude.com (Atlassian Statuspage) webhook을 수신하여
 * Discord rich embed로 변환 후 전송.
 *
 * Setup:
 *   1. Cloudflare Dashboard -> Workers & Pages -> Create Worker
 *   2. Paste this code
 *   3. Settings -> Variables and Secrets -> Add Secret:
 *      - DISCORD_WEBHOOK_URL = https://discord.com/api/webhooks/YOUR_ID/YOUR_TOKEN
 *   4. Copy the Worker URL (e.g. https://your-worker.your-subdomain.workers.dev)
 *   5. status.claude.com -> Subscribe -> Webhook -> paste Worker URL
 */

const COLORS = {
  critical: 0xe04343, // red
  major: 0xe86235, // orange
  minor: 0xfaa72a, // yellow
  maintenance: 0x2c84db, // blue
  resolved: 0x76ad2a, // green
  operational: 0x76ad2a, // green
  none: 0x87867f, // grey
};

const STATUS_EMOJI = {
  investigating: '\u{1F50D}', // magnifying glass
  identified: '\u{1F4CB}', // clipboard
  monitoring: '\u{1F440}', // eyes
  update: '\u{1F4AC}', // speech balloon
  resolved: '\u2705', // check mark
  postmortem: '\u{1F4DD}', // memo
  scheduled: '\u{1F4C5}', // calendar
  in_progress: '\u{1F6E0}\uFE0F', // wrench
  verifying: '\u{1F9EA}', // test tube
  completed: '\u2705', // check mark
};

const COMPONENT_STATUS_EMOJI = {
  operational: '\u{1F7E2}', // green circle
  degraded_performance: '\u{1F7E1}', // yellow circle
  partial_outage: '\u{1F7E0}', // orange circle
  major_outage: '\u{1F534}', // red circle
  under_maintenance: '\u{1F535}', // blue circle
};

const IMPACT_LABELS = {
  none: 'None',
  minor: 'Minor',
  major: 'Major',
  critical: 'Critical',
  maintenance: 'Maintenance',
};

export default {
  async fetch(request, env) {
    if (request.method === 'GET') {
      return new Response(
        'Claude Status -> Discord relay is active. POST webhooks to this URL.',
        { status: 200 }
      );
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    if (!env.DISCORD_WEBHOOK_URL) {
      return new Response('DISCORD_WEBHOOK_URL secret is not configured', {
        status: 500,
      });
    }

    try {
      const payload = await request.json();
      const discordBody = buildDiscordPayload(payload);

      if (!discordBody) {
        return new Response('No actionable event', { status: 200 });
      }

      const res = await fetch(env.DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discordBody),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`Discord API error: ${res.status}`, text);
        return new Response(`Discord error: ${res.status}`, { status: 502 });
      }

      return new Response('OK', { status: 200 });
    } catch (err) {
      console.error('Worker error:', err);
      return new Response(`Internal error: ${err.message}`, { status: 500 });
    }
  },
};

function buildDiscordPayload(payload) {
  const base = {
    username: 'Claude Status',
    avatar_url:
      'https://dka575ofm4ao0.cloudfront.net/pages-favicon_logos/original/362807/NEW_spark-96-96-2225c423-f16f-42a4-b9d1-c58c10b998cb.png',
  };

  if (payload.incident) {
    return { ...base, embeds: [buildIncidentEmbed(payload)] };
  }

  if (payload.component_update) {
    return { ...base, embeds: [buildComponentEmbed(payload)] };
  }

  return null;
}

function buildIncidentEmbed(payload) {
  const { incident, page } = payload;
  const latestUpdate = incident.incident_updates?.[0];
  const status = incident.status || 'investigating';
  const impact = incident.impact || 'none';

  const emoji = STATUS_EMOJI[status] || '\u2753';
  const color =
    status === 'resolved' ? COLORS.resolved : COLORS[impact] || COLORS.none;

  const fields = [
    {
      name: 'Status',
      value: `${emoji} ${capitalize(status)}`,
      inline: true,
    },
    {
      name: 'Impact',
      value: IMPACT_LABELS[impact] || capitalize(impact),
      inline: true,
    },
  ];

  if (incident.components && incident.components.length > 0) {
    const componentList = incident.components
      .map((c) => {
        const statusEmoji = COMPONENT_STATUS_EMOJI[c.status] || '';
        return `${statusEmoji} ${c.name}`;
      })
      .join('\n');
    fields.push({
      name: 'Affected Components',
      value: componentList,
      inline: false,
    });
  }

  // Discord timestamp format: <t:UNIX:F> renders as localized datetime
  if (incident.scheduled_for) {
    fields.push({
      name: 'Scheduled',
      value: `<t:${toUnix(incident.scheduled_for)}:F> \u2192 <t:${toUnix(
        incident.scheduled_until
      )}:F>`,
      inline: false,
    });
  }

  const description = latestUpdate?.body
    ? truncate(latestUpdate.body, 4000)
    : '_No details provided._';

  return {
    title: `${emoji} ${truncate(incident.name, 250)}`,
    description,
    url: incident.shortlink || 'https://status.claude.com',
    color,
    fields,
    timestamp:
      latestUpdate?.created_at || incident.updated_at || incident.created_at,
    footer: {
      text: page?.status_description || 'Claude Status',
    },
  };
}

function buildComponentEmbed(payload) {
  const { component, component_update: update } = payload;

  const oldEmoji = COMPONENT_STATUS_EMOJI[update.old_status] || '';
  const newEmoji = COMPONENT_STATUS_EMOJI[update.new_status] || '';
  const color = getComponentColor(update.new_status);

  return {
    title: `Component Update: ${component.name}`,
    description: `${oldEmoji} ${formatComponentStatus(
      update.old_status
    )} \u2192 ${newEmoji} ${formatComponentStatus(update.new_status)}`,
    url: 'https://status.claude.com',
    color,
    timestamp: update.created_at,
    footer: { text: 'Claude Status' },
  };
}

function getComponentColor(status) {
  const map = {
    operational: COLORS.operational,
    degraded_performance: COLORS.minor,
    partial_outage: COLORS.major,
    major_outage: COLORS.critical,
    under_maintenance: COLORS.maintenance,
  };
  return map[status] || COLORS.none;
}

function formatComponentStatus(status) {
  return (status || '')
    .split('_')
    .map((w) => capitalize(w))
    .join(' ');
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '\u2026' : str;
}

function toUnix(isoString) {
  return Math.floor(new Date(isoString).getTime() / 1000);
}
