import type {
  Action,
  ActionType,
  CitationMissedEvent,
  CompetitorCitedInsteadEvent,
  MonitoringEvent,
  RedditCompetitorMentionEvent,
  ArticlePublishedWithCompetitorsEvent,
  Severity,
} from "@/lib/types";

type ActionGroup = {
  idSeed: string;
  type: ActionType;
  severity: Severity;
  title: string;
  description: string;
  created_at: string;
  source_url?: string;
  source_event_ids: string[];
};

type GroupBucket = {
  key: string;
  events: MonitoringEvent[];
};

const BRAND_NAMES = ["Promptwatch", "Pulse AI", "Athrun", "Tellem", "Quench AI", "Veronia", "OrbitalSEO"] as const;

const COLLATOR = new Intl.Collator("en", { sensitivity: "base", numeric: true });

function hashString(input: string): string {
  let hash = 2166136261;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function normalizeText(text: string): string {
  const lowered = text.toLowerCase();
  const cleaned = lowered.replace(/[^a-z0-9]+/g, " ").trim();
  return cleaned.replace(/\s+/g, " ");
}

function normalizeTitle(text: string, knownBrands: string[]): string {
  let normalized = text;

  for (const brand of knownBrands) {
    const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    normalized = normalized.replace(new RegExp(escaped, "gi"), "{brand}");
  }

  return normalized.replace(/\s+/g, " ").trim();
}

function formatRelativeDate(createdAt: string): string {
  const now = new Date();
  const then = new Date(createdAt);
  const diffMs = now.getTime() - then.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 24) return "today";
  if (diffHours < 48) return "yesterday";

  return `${Math.max(1, Math.floor(diffHours / 24))}d ago`;
}

function severityFromScore(score: number): Severity {
  if (score >= 3) return "high";
  if (score >= 2) return "medium";
  return "low";
}

function severityForReddit(upvotes: number, commentCount: number): Severity {
  const score = upvotes + commentCount * 2;
  if (score >= 500) return "high";
  if (score >= 150) return "medium";
  return "low";
}

function severityForTraffic(estimatedMonthlyTraffic: number): Severity {
  if (estimatedMonthlyTraffic >= 50000) return "high";
  if (estimatedMonthlyTraffic >= 8000) return "medium";
  return "low";
}

function severityForCitationMissed(count: number, competitorCount: number): Severity {
  const score = count + competitorCount - 1;
  return severityFromScore(score);
}

function severityForCompetitorCitedInstead(count: number, avgPosition: number): Severity {
  const score = count + Math.max(0, 4 - avgPosition);
  return severityFromScore(score);
}

function groupEvents<T extends MonitoringEvent>(events: T[], keyFn: (event: T) => string): GroupBucket[] {
  const buckets = new Map<string, T[]>();

  for (const event of events) {
    const key = keyFn(event);
    const existing = buckets.get(key) ?? [];
    existing.push(event);
    buckets.set(key, existing);
  }

  return [...buckets.entries()].map(([key, grouped]) => ({ key, events: grouped }));
}

function pickTopBuckets(buckets: GroupBucket[], limit: number): GroupBucket[] {
  return [...buckets]
    .sort((a, b) => {
      const countDiff = b.events.length - a.events.length;
      if (countDiff !== 0) return countDiff;

      const dateDiff = new Date(b.events[b.events.length - 1].created_at).getTime() - new Date(a.events[a.events.length - 1].created_at).getTime();
      if (dateDiff !== 0) return dateDiff;

      return COLLATOR.compare(a.key, b.key);
    })
    .slice(0, limit);
}

function makeActionId(type: ActionType, key: string, sourceIds: string[]): string {
  return `${type}_${hashString([type, key, ...[...sourceIds].sort(COLLATOR.compare)].join("|"))}`;
}

function buildCitationMissedActions(events: CitationMissedEvent[]): ActionGroup[] {
  const grouped = pickTopBuckets(groupEvents(events, (event) => normalizeText(event.prompt)), 7);

  return grouped.map((bucket) => {
    const typedEvents = bucket.events as CitationMissedEvent[];
    const latest = [...typedEvents].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const count = bucket.events.length;
    const competitorCount = Math.max(...typedEvents.map((event) => event.competitor_brands.length));
    const severity = severityForCitationMissed(count, competitorCount);
    const title = `Publish a page for "${latest.prompt}"`;
    const competitorSample = [...new Set(typedEvents.flatMap((event) => event.competitor_brands))].slice(0, 3).join(", ");

    return {
      idSeed: `citation|${bucket.key}`,
      type: "content",
      severity,
      title,
      description: `${count} prompt misses mention ${competitorSample}. Ship a focused comparison or FAQ page so your content is available when AI answers this query.`,
      created_at: latest.created_at,
      source_event_ids: typedEvents.map((event) => event.id),
    };
  });
}

function buildRedditActions(events: RedditCompetitorMentionEvent[]): ActionGroup[] {
  const grouped = pickTopBuckets(groupEvents(events, (event) => event.subreddit), 5);

  return grouped.map((bucket) => {
    const typedEvents = bucket.events as RedditCompetitorMentionEvent[];
    const latest = [...typedEvents].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const count = bucket.events.length;
    const score = typedEvents.reduce((sum, event) => sum + event.upvotes + event.comment_count, 0);
    const severity = severityForReddit(score, Math.max(0, Math.round(score / Math.max(1, count))));
    const topThread = [...typedEvents].sort((a, b) => b.upvotes + b.comment_count - (a.upvotes + a.comment_count))[0];
    const brands = [...new Set(typedEvents.flatMap((event) => event.competitors_mentioned))].slice(0, 3).join(", ");

    return {
      idSeed: `reddit|${bucket.key}`,
      type: "reddit",
      severity,
      title: `Engage in ${bucket.key} around AI visibility`,
      description: `${count} mentions point to ${brands}. Join the strongest thread (${topThread.thread_title}) and answer directly before the discussion hardens around competitors.`,
      created_at: latest.created_at,
      source_url: topThread.thread_url,
      source_event_ids: typedEvents.map((event) => event.id),
    };
  });
}

function buildArticleActions(events: ArticlePublishedWithCompetitorsEvent[]): ActionGroup[] {
  const grouped = pickTopBuckets(groupEvents(events, (event) => event.publication), 4);

  return grouped.map((bucket) => {
    const typedEvents = bucket.events as ArticlePublishedWithCompetitorsEvent[];
    const latest = [...typedEvents].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const count = bucket.events.length;
    const averageTraffic = Math.round(typedEvents.reduce((sum, event) => sum + event.estimated_monthly_traffic, 0) / count);
    const severity = severityForTraffic(averageTraffic);
    const competitors = [...new Set(typedEvents.flatMap((event) => event.competitors_cited))].slice(0, 3).join(", ");

    return {
      idSeed: `article|${bucket.key}`,
      type: "outreach",
      severity,
      title: `Pitch ${bucket.key} on AI visibility gaps`,
      description: `${count} articles in ${bucket.key} mention ${competitors}. Reach out with a tighter angle and a cleaner comparison page to win the citation slot.`,
      created_at: latest.created_at,
      source_url: latest.article_url,
      source_event_ids: typedEvents.map((event) => event.id),
    };
  });
}

function buildCompetitorCitedActions(events: CompetitorCitedInsteadEvent[]): ActionGroup[] {
  const grouped = pickTopBuckets(groupEvents(events, (event) => `${event.source_type}|${event.competitor_brand}`), 4);

  return grouped.map((bucket) => {
    const typedEvents = bucket.events as CompetitorCitedInsteadEvent[];
    const latest = [...typedEvents].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const count = bucket.events.length;
    const avgPosition = typedEvents.reduce((sum, event) => sum + event.position, 0) / count;
    const severity = severityForCompetitorCitedInstead(count, avgPosition);
    const sourceType = latest.source_type;
    const actionType: ActionType = sourceType === "reddit" ? "reddit" : sourceType === "article" ? "outreach" : "content";
    const sourceLabel = sourceType === "reddit" ? "Reddit threads" : sourceType === "article" ? "published articles" : "video results";

    return {
      idSeed: `cited|${bucket.key}`,
      type: actionType,
      severity,
      title: `Reclaim citations from ${latest.competitor_brand} in ${sourceLabel}`,
      description: `${count} answers point to ${latest.competitor_brand} before you, usually at position ${Math.round(avgPosition)}. Tighten the page this content came from so it can win the citation slot.`,
      created_at: latest.created_at,
      source_url: latest.source_url,
      source_event_ids: typedEvents.map((event) => event.id),
    };
  });
}

export function deriveActions(events: MonitoringEvent[]): Action[] {
  const citationMissed = events.filter((event): event is CitationMissedEvent => event.event_type === "citation_missed");
  const competitorCitedInstead = events.filter((event): event is CompetitorCitedInsteadEvent => event.event_type === "competitor_cited_instead");
  const redditMentions = events.filter((event): event is RedditCompetitorMentionEvent => event.event_type === "reddit_competitor_mention");
  const articles = events.filter((event): event is ArticlePublishedWithCompetitorsEvent => event.event_type === "article_published_with_competitors");

  const groups = [
    ...buildCitationMissedActions(citationMissed),
    ...buildRedditActions(redditMentions),
    ...buildArticleActions(articles),
    ...buildCompetitorCitedActions(competitorCitedInstead),
  ];

  const knownBrands = [...BRAND_NAMES];

  return groups
    .map((group) => {
      const sourceIds = [...group.source_event_ids].sort(COLLATOR.compare);
      const sourceUrl = group.source_url;
      const title = normalizeTitle(group.title, knownBrands);
      const description = normalizeTitle(group.description, knownBrands);
      const createdAt = group.created_at;

      return {
        id: makeActionId(group.type, group.idSeed, sourceIds),
        type: group.type,
        severity: group.severity,
        title,
        description,
        created_at: createdAt,
        source_url: sourceUrl,
        source_event_ids: sourceIds,
        status: "active" as const,
      } satisfies Action;
    })
    .sort((a, b) => {
      const severityOrder: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      const dateDiff = b.created_at.localeCompare(a.created_at);
      if (dateDiff !== 0) return dateDiff;
      return COLLATOR.compare(a.title, b.title);
    });
}

export { deriveActions as deriveActionsFromMonitoringEvents };

export function formatActionRelativeDate(createdAt: string): string {
  return formatRelativeDate(createdAt);
}
