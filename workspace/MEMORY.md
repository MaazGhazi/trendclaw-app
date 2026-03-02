# TrendClaw Source Reference

## Sources

### API Sources (structured, reliable)
- **Hacker News**: Tech community link aggregator. Items have `score` (upvotes) and `comments`. 500+ pts = viral, 200+ = hot, 100+ = notable. Top stories reflect what Silicon Valley is talking about.
- **CoinGecko**: Crypto market data. Items have `priceChange` (24h %), `volume`, `marketCap`, `rank`. 20%+ daily change = significant move. Top 10 by rank = major coins.
- **Lobsters**: Curated tech community (smaller than HN, higher signal). Items have `score` and `comments`. 50+ pts = notable for this platform.
- **Dev.to**: Developer blogging platform. Items have `score` (reactions) and `comments`. Popular articles reflect developer interests and new tooling trends.
- **Bluesky**: Decentralized social network (growing, tech-leaning audience). Trending topics and popular posts.
- **YouTube Trending**: Video platform trending page. Items have `views`. 1M+ views = significant. Reflects mainstream culture + tech content.
- **NewsAPI**: Aggregated headlines from 150K+ news sources. Broad coverage of breaking news, politics, business.
- **Wikipedia Most Viewed**: Most visited Wikipedia pages. High pageviews (500K+) indicate mass public interest, often triggered by news events or pop culture.

### RSS Feeds (reliable, curated editorial)
- **Reddit Popular**: Front page of Reddit. High upvotes = mass appeal.
- **Reddit Technology**: Tech-focused subreddit. Items reflect consumer tech and policy.
- **Reddit Cryptocurrency**: Crypto community discussion. Sentiment indicator for market moves.
- **Reddit Artificial**: AI/ML community. Early signals for AI developments.
- **TechCrunch**: Startup and tech news. Covers funding, launches, acquisitions.
- **The Verge**: Consumer tech and culture coverage.
- **Ars Technica**: Deep technical journalism. Science, IT, policy.
- **CoinDesk**: Crypto industry news. Covers regulation, institutional moves, DeFi.
- **Product Hunt**: New product launches. Items have upvotes. 500+ = breakout launch.

### Browser Scraped (may have gaps due to bot detection)
- **GitHub Trending**: Trending repositories. Items have `stars` and `todayStars`. 10K+ total stars = established project. 1K+ today = viral repo.
- **Google Trends**: Trending search queries. Reflects real-time public interest. May fail due to bot detection.
- **TikTok Creative Center**: Trending hashtags and sounds. Reflects Gen Z / mainstream culture. May fail due to bot detection.

## Scoring Thresholds
- 90-100: Viral / cross-platform phenomenon
- 70-89: Hot / high engagement on primary platform
- 50-69: Notable / above-average interest
- 30-49: Emerging / early signal
- 1-29: Low / niche interest

## Momentum Definitions
- **viral**: Explosive growth (>10x normal engagement or >20% price change)
- **rising**: Growing engagement, upward trajectory
- **stable**: Consistent presence, no significant change
- **falling**: Declining engagement or interest
- **new**: First appearance in the data, no prior history
