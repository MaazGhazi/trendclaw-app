import type { Client } from "@prisma/client";
import { SIGNAL_TYPES, ALL_SIGNAL_TYPE_KEYS, type SignalTypeKey } from "../signal-types.js";

export function buildClientMonitoringPrompt(client: Client): string {
  const socialUrls = [
    client.linkedinUrl && `LinkedIn: ${client.linkedinUrl}`,
    client.twitterUrl && `Twitter/X: ${client.twitterUrl}`,
    client.facebookUrl && `Facebook: ${client.facebookUrl}`,
    client.instagramUrl && `Instagram: ${client.instagramUrl}`,
  ].filter(Boolean);

  const customUrls = (client.customUrls as string[]) || [];

  // Determine which signal types to monitor
  const selectedKeys: SignalTypeKey[] =
    client.monitorSignals.length > 0
      ? (client.monitorSignals as SignalTypeKey[])
      : ALL_SIGNAL_TYPE_KEYS;

  // Build the "Look for:" list
  const lookForItems = selectedKeys
    .map((key, i) => `${i + 1}. ${SIGNAL_TYPES[key].promptFragment}`)
    .join("\n");

  // Build the valid type enum
  const validTypes = selectedKeys.map((k) => `"${k}"`).join(", ");

  // Build search queries the agent should run
  const searchQueries = [
    `"${client.name}" recent news announcements`,
    client.linkedinUrl && `"${client.name}" site:linkedin.com`,
    client.domain && `site:${client.domain} news OR blog OR press`,
    client.keywords.length > 0 && `"${client.name}" ${client.keywords.slice(0, 3).join(" OR ")}`,
  ].filter(Boolean);

  return `You are a business intelligence agent monitoring "${client.name}" for buying signals and notable activity.

Company: ${client.name}
${client.domain ? `Website: ${client.domain}` : ""}
${client.industry ? `Industry: ${client.industry}` : ""}
${client.description ? `Description: ${client.description}` : ""}
${socialUrls.length > 0 ? `\nKnown social pages:\n${socialUrls.join("\n")}` : ""}
${customUrls.length > 0 ? `\nAdditional URLs:\n${customUrls.join("\n")}` : ""}
${client.keywords.length > 0 ? `\nKeywords to watch: ${client.keywords.join(", ")}` : ""}

INSTRUCTIONS:
Use the web_search tool to search for recent news and activity about this company. Run multiple searches to get comprehensive coverage.

Suggested searches:
${searchQueries.map((q) => `- ${q}`).join("\n")}

Then use web_fetch to read any promising result pages for details.

Look for these buying signals:
${lookForItems}

Output a JSON array of signals. Each signal should have:
- type: one of ${validTypes}
- title: short headline (under 100 chars)
- summary: 2-3 sentence description of what happened
- sourceUrl: URL where you found this information
- sourceName: name of the source (e.g. "LinkedIn", "Google News", "Company Blog")
- confidence: 0.0 to 1.0 indicating how confident you are this is real

If you find no notable signals, return an empty array: []

Respond ONLY with valid JSON. No markdown, no code fences, no explanation.`;
}

export function buildNicheMonitoringPrompt(name: string, keywords: string[], sources: string[]): string {
  return `You are a trend monitoring agent tracking the topic "${name}".

Keywords: ${keywords.join(", ")}
${sources.length > 0 ? `Sources to check: ${sources.join(", ")}` : ""}

INSTRUCTIONS:
Use the web_search tool to search for trending content, news, and discussions related to these keywords. Run multiple searches.

Suggested searches:
- ${keywords.slice(0, 3).join(" OR ")} trending news
- ${name} latest developments
${sources.length > 0 ? sources.map((s) => `- site:${s} ${keywords[0] || name}`).join("\n") : ""}

Then use web_fetch to read promising result pages for details.

Look for:
1. **Trending topics** — viral discussions, emerging trends
2. **Industry news** — major announcements in this space
3. **Content opportunities** — topics that are gaining traction and would be good for content creation

Output a JSON array of signals. Each signal should have:
- type: "trending_topic"
- title: short headline (under 100 chars)
- summary: 2-3 sentence description of the trend
- sourceUrl: URL where you found this
- sourceName: name of the source
- confidence: 0.0 to 1.0

If you find no notable signals, return an empty array: []

Respond ONLY with valid JSON. No markdown, no code fences, no explanation.`;
}
