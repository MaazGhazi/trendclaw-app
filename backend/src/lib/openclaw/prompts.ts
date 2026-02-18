import type { Client } from "@prisma/client";

export function buildClientMonitoringPrompt(client: Client): string {
  const socialUrls = [
    client.linkedinUrl && `LinkedIn: ${client.linkedinUrl}`,
    client.twitterUrl && `Twitter/X: ${client.twitterUrl}`,
    client.facebookUrl && `Facebook: ${client.facebookUrl}`,
    client.instagramUrl && `Instagram: ${client.instagramUrl}`,
  ].filter(Boolean);

  const customUrls = (client.customUrls as string[]) || [];

  return `You are a business intelligence agent monitoring "${client.name}" for buying signals and notable activity.

Company: ${client.name}
${client.domain ? `Website: ${client.domain}` : ""}
${client.industry ? `Industry: ${client.industry}` : ""}
${client.description ? `Description: ${client.description}` : ""}
${socialUrls.length > 0 ? `\nSocial Media Pages:\n${socialUrls.join("\n")}` : ""}
${customUrls.length > 0 ? `\nAdditional URLs:\n${customUrls.join("\n")}` : ""}
${client.keywords.length > 0 ? `\nKeywords to watch: ${client.keywords.join(", ")}` : ""}

Search their LinkedIn page and social media pages for recent activity. Look for:
1. **Executive changes** — new hires, departures, promotions (especially C-suite/VP level)
2. **Funding events** — fundraising announcements, investment rounds
3. **Hiring activity** — significant hiring posts, new team expansions
4. **Product launches** — new products, features, or services announced
5. **Expansion** — new offices, markets, or geographic expansion
6. **Partnerships** — strategic partnerships, integrations, collaborations

Output a JSON array of signals. Each signal should have:
- type: one of "executive_change", "funding", "hiring", "product_launch", "expansion", "partnership"
- title: short headline (under 100 chars)
- summary: 2-3 sentence description of what happened
- sourceUrl: URL where you found this information
- sourceName: name of the source (e.g. "LinkedIn", "Twitter")
- confidence: 0.0 to 1.0 indicating how confident you are this is real

If you find no notable signals, return an empty array: []

Respond ONLY with valid JSON. No markdown, no explanation.`;
}

export function buildNicheMonitoringPrompt(name: string, keywords: string[], sources: string[]): string {
  return `You are a trend monitoring agent tracking the topic "${name}".

Keywords: ${keywords.join(", ")}
${sources.length > 0 ? `Sources to check: ${sources.join(", ")}` : ""}

Search for trending content, news, and discussions related to these keywords. Look for:
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

Respond ONLY with valid JSON. No markdown, no explanation.`;
}
