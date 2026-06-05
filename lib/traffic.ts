import type { AiVisit, BotName } from "@/lib/types";
import { BOT_NAMES, BOT_UA_SUBSTRINGS } from "@/lib/types";

export type TrafficDay = {
  dateKey: string;
  dateLabel: string;
  total: number;
  counts: Record<BotName, number>;
};

export type TopPage = {
  pagePath: string;
  count: number;
};

export type TopCrawler = {
  bot: BotName;
  count: number;
  label: string;
  parent: string;
  initial: string;
  color: string;
};

export type AggregatedTraffic = {
  days: TrafficDay[];
  chartDays: TrafficDay[];
  totalVisits: number;
  uniquePageCount: number;
  botTotals: Record<BotName, number>;
  legendOrder: BotName[];
  topPages: TopPage[];
  topCrawlers: TopCrawler[];
  rangeDays: number;
  startDateKey: string | null;
  endDateKey: string | null;
};

type BotMeta = {
  label: string;
  parent: string;
  initial: string;
  color: string;
};

export const BOT_META: Record<BotName, BotMeta> = {
  GPTBot: {
    label: "GPTBot",
    parent: "OpenAI",
    initial: "G",
    color: "#f97316",
  },
  "ChatGPT-User": {
    label: "ChatGPT-User",
    parent: "OpenAI",
    initial: "C",
    color: "#10b981",
  },
  "OAI-SearchBot": {
    label: "OAI-SearchBot",
    parent: "OpenAI",
    initial: "O",
    color: "#3b82f6",
  },
  ClaudeBot: {
    label: "ClaudeBot",
    parent: "Anthropic",
    initial: "C",
    color: "#8b5cf6",
  },
  PerplexityBot: {
    label: "PerplexityBot",
    parent: "Perplexity",
    initial: "P",
    color: "#ec4899",
  },
  "Perplexity-User": {
    label: "Perplexity-User",
    parent: "Perplexity",
    initial: "P",
    color: "#f59e0b",
  },
  "Google-Extended": {
    label: "Google-Extended",
    parent: "Google",
    initial: "G",
    color: "#06b6d4",
  },
};

const dayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});

const longDayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function classifyBot(userAgent: string): BotName | null {
  for (const bot of BOT_NAMES) {
    if (BOT_UA_SUBSTRINGS[bot].some((needle) => userAgent.includes(needle))) {
      return bot;
    }
  }

  return null;
}

export function toUtcDateKey(timestamp: string): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function formatDateKey(dateKey: string): string {
  return dayFormatter.format(new Date(`${dateKey}T00:00:00.000Z`));
}

export function formatLongDate(dateKey: string): string {
  return longDayFormatter.format(new Date(`${dateKey}T00:00:00.000Z`));
}

function createEmptyCounts(): Record<BotName, number> {
  return BOT_NAMES.reduce((acc, bot) => {
    acc[bot] = 0;
    return acc;
  }, {} as Record<BotName, number>);
}

function toDateUTC(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function addUtcDays(dateKey: string, daysToAdd: number): string {
  const date = toDateUTC(dateKey);
  date.setUTCDate(date.getUTCDate() + daysToAdd);
  return date.toISOString().slice(0, 10);
}

function enumerateDateKeys(startDateKey: string, endDateKey: string): string[] {
  const keys: string[] = [];
  let current = startDateKey;

  while (current <= endDateKey) {
    keys.push(current);
    current = addUtcDays(current, 1);
  }

  return keys;
}

export function aggregateTraffic(visits: AiVisit[]): AggregatedTraffic {
  const dayCounts = new Map<string, Record<BotName, number>>();
  const pageTotals = new Map<string, number>();
  const botTotals = BOT_NAMES.reduce((acc, bot) => {
    acc[bot] = 0;
    return acc;
  }, {} as Record<BotName, number>);

  let totalVisits = 0;
  let startDateKey: string | null = null;
  let endDateKey: string | null = null;

  for (const visit of visits) {
    const bot = classifyBot(visit.user_agent);

    if (!bot) {
      continue;
    }

    const dateKey = toUtcDateKey(visit.timestamp);
    const counts = dayCounts.get(dateKey) ?? createEmptyCounts();
    counts[bot] += 1;
    dayCounts.set(dateKey, counts);

    botTotals[bot] += 1;
    pageTotals.set(visit.page_path, (pageTotals.get(visit.page_path) ?? 0) + 1);

    totalVisits += 1;
    if (startDateKey === null || dateKey < startDateKey) startDateKey = dateKey;
    if (endDateKey === null || dateKey > endDateKey) endDateKey = dateKey;
  }

  if (totalVisits === 0 || startDateKey === null || endDateKey === null) {
    return {
      days: [],
      chartDays: [],
      totalVisits: 0,
      uniquePageCount: 0,
      botTotals,
      legendOrder: [...BOT_NAMES],
      topPages: [],
      topCrawlers: [],
      rangeDays: 0,
      startDateKey: null,
      endDateKey: null,
    };
  }

  const allDateKeys = enumerateDateKeys(startDateKey, endDateKey);
  const days = allDateKeys.map((dateKey) => {
    const counts = dayCounts.get(dateKey) ?? createEmptyCounts();
    const total = BOT_NAMES.reduce((sum, bot) => sum + counts[bot], 0);

    return {
      dateKey,
      dateLabel: formatDateKey(dateKey),
      total,
      counts,
    };
  });

  const legendOrder = [...BOT_NAMES].sort((a, b) => {
    const diff = botTotals[b] - botTotals[a];
    if (diff !== 0) return diff;

    return BOT_NAMES.indexOf(a) - BOT_NAMES.indexOf(b);
  });

  const topPages = [...pageTotals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([pagePath, count]) => ({ pagePath, count }));

  const topCrawlers = legendOrder
    .map((bot) => ({
      bot,
      count: botTotals[bot],
      label: BOT_META[bot].label,
      parent: BOT_META[bot].parent,
      initial: BOT_META[bot].initial,
      color: BOT_META[bot].color,
    }))
    .filter((crawler) => crawler.count > 0)
    .slice(0, 8);

  return {
    days,
    chartDays: days,
    totalVisits,
    uniquePageCount: pageTotals.size,
    botTotals,
    legendOrder,
    topPages,
    topCrawlers,
    rangeDays: days.length,
    startDateKey,
    endDateKey,
  };
}

export function formatTrafficSummary(traffic: AggregatedTraffic): string {
  const botCount = Object.values(traffic.botTotals).filter((count) => count > 0).length;
  return `${traffic.totalVisits.toLocaleString()} visits from ${botCount} bots across ${traffic.uniquePageCount.toLocaleString()} pages, last ${traffic.rangeDays} days`;
}
