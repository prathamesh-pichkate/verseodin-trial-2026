"use client";

import { useEffect, useMemo, useState } from "react";
import type { BotName, AiVisit } from "@/lib/types";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  aggregateTraffic,
  BOT_META,
  formatLongDate,
  formatTrafficSummary,
  type AggregatedTraffic,
  type TrafficDay,
  type TopCrawler,
  type TopPage,
} from "@/lib/traffic";

const dateLabelEvery = 7;

function formatCount(value: number) {
  return value.toLocaleString();
}

function formatPath(path: string) {
  if (path === "/") return "/";

  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 2) return path;

  return `/${parts[0]}/…/${parts[parts.length - 1]}`;
}

function sumVisibleCounts(day: TrafficDay, visibleBots: Set<BotName>) {
  return [...visibleBots].reduce((sum, bot) => sum + day.counts[bot], 0);
}

function buildChartData(days: TrafficDay[], visibleBots: Set<BotName>) {
  return days.map((day) => {
    const row: Record<string, string | number> = {
      dateKey: day.dateKey,
      dateLabel: day.dateLabel,
      total: sumVisibleCounts(day, visibleBots),
    };

    for (const bot of Object.keys(BOT_META) as BotName[]) {
      row[bot] = visibleBots.has(bot) ? day.counts[bot] : 0;
    }

    return row;
  });
}

function LoadingSkeleton() {
  return (
    <div className="space-y-8">
      <div className="h-8 w-56 animate-pulse rounded bg-gray-200" />
      <div className="h-[390px] animate-pulse rounded-2xl border border-gray-200 bg-gray-100/80" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-[420px] animate-pulse rounded-2xl border border-gray-200 bg-gray-100/80" />
        <div className="h-[420px] animate-pulse rounded-2xl border border-gray-200 bg-gray-100/80" />
      </div>
    </div>
  );
}

function EmptyState({ title, description, retry }: { title: string; description: string; retry?: () => void }) {
  return (
    <div className="flex h-full min-h-[280px] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center">
      <div>
        <div className="text-base font-medium text-gray-900">{title}</div>
        <p className="mt-2 text-sm text-gray-500">{description}</p>
        {retry ? (
          <button
            type="button"
            onClick={retry}
            className="mt-4 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-orange-300 hover:bg-orange-50"
          >
            Retry
          </button>
        ) : null}
      </div>
    </div>
  );
}

function topPagesBarWidth(count: number, topCount: number) {
  return `${Math.max(6, Math.round((count / topCount) * 100))}%`;
}

function TooltipContent({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ color?: string; name?: string; value?: number; payload?: { dateKey?: string } }>;
}) {
  if (!active || !payload?.length) return null;

  const total = payload.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
  const dateKey = payload[0]?.payload?.dateKey;

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-lg">
      <div className="text-sm font-medium text-gray-900">{dateKey ? formatLongDate(dateKey) : ""}</div>
      <div className="mt-2 space-y-1 text-sm text-gray-700">
        {payload
          .filter((item) => Number(item.value) > 0)
          .map((item) => (
            <div key={String(item.name)} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span>{item.name}</span>
              </span>
              <span className="font-medium text-gray-900">{formatCount(Number(item.value))}</span>
            </div>
          ))}
      </div>
      <div className="mt-2 border-t border-gray-100 pt-2 text-sm font-semibold text-gray-900">Total: {formatCount(total)}</div>
    </div>
  );
}

function PageRow({ page, topCount }: { page: TopPage; topCount: number }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white px-3 py-3">
      <div className="absolute inset-y-0 left-0 bg-orange-100/60" style={{ width: topPagesBarWidth(page.count, topCount) }} />
      <div className="relative flex items-center gap-3">
        <div className="min-w-0 flex-1 truncate font-mono text-sm text-gray-900">{formatPath(page.pagePath)}</div>
        <div className="text-sm font-medium text-gray-900">{formatCount(page.count)}</div>
      </div>
    </div>
  );
}

function CrawlerRow({ crawler, topCount }: { crawler: TopCrawler; topCount: number }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white px-3 py-3">
      <div className="absolute inset-y-0 left-0 bg-orange-100/60" style={{ width: topPagesBarWidth(crawler.count, topCount) }} />
      <div className="relative flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ backgroundColor: crawler.color }}>
          {crawler.initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-gray-900">
            {crawler.label} <span className="font-normal text-gray-500">({crawler.parent})</span>
          </div>
        </div>
        <div className="text-sm font-medium text-gray-900">{formatCount(crawler.count)}</div>
      </div>
    </div>
  );
}

function TrafficDashboard() {
  const [traffic, setTraffic] = useState<AggregatedTraffic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleBots, setVisibleBots] = useState<Set<BotName>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function loadTraffic() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch("/visits.json", { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to load visits.json");

        const visits = (await response.json()) as AiVisit[];
        const aggregated = aggregateTraffic(visits);

        if (cancelled) return;

        setTraffic(aggregated);
        setVisibleBots(new Set(aggregated.legendOrder));
      } catch {
        if (!cancelled) setError("Couldn't load traffic data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadTraffic();

    return () => {
      cancelled = true;
    };
  }, []);

  const summary = traffic ? formatTrafficSummary(traffic) : "—";

  const chartData = useMemo(() => {
    if (!traffic) return [];
    return buildChartData(traffic.chartDays, visibleBots.size ? visibleBots : new Set(traffic.legendOrder));
  }, [traffic, visibleBots]);

  const yAxisDomain = useMemo(() => {
    const max = chartData.reduce((acc, row) => Math.max(acc, Number(row.total) || 0), 0);
    return [0, Math.max(10, Math.ceil(max * 1.15))] as [number, number];
  }, [chartData]);

  const topPages = traffic?.topPages ?? [];
  const topCrawlers = traffic?.topCrawlers ?? [];
  const legendOrder = traffic?.legendOrder ?? [];

  const toggleBot = (bot: BotName) => {
    setVisibleBots((current) => {
      const next = new Set(current);
      if (next.has(bot)) next.delete(bot);
      else next.add(bot);
      return next;
    });
  };

  if (loading && !traffic) {
    return (
      <main className="mx-auto max-w-7xl px-6 py-10">
        <LoadingSkeleton />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-6">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-gray-950">AI Traffic</h1>
            <p className="mt-1 text-sm text-gray-600">{summary}</p>
          </div>
        </div>
      </header>

      {error ? (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <div className="font-medium">Couldn&apos;t load traffic data.</div>
          <div className="mt-1">Try refreshing the page.</div>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setLoading(true);
              setTraffic(null);
              void fetch("/visits.json", { cache: "no-store" })
                .then((response) => response.json())
                .then((visits: AiVisit[]) => {
                  const aggregated = aggregateTraffic(visits);
                  setTraffic(aggregated);
                  setVisibleBots(new Set(aggregated.legendOrder));
                })
                .catch(() => setError("Couldn&apos;t load traffic data."))
                .finally(() => setLoading(false));
            }}
            className="mt-3 rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500"
          >
            Retry
          </button>
        </div>
      ) : null}

      {traffic && traffic.totalVisits > 0 ? (
        <>
          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {legendOrder.map((bot) => {
                const isActive = visibleBots.has(bot);
                const meta = BOT_META[bot];
                return (
                  <button
                    key={bot}
                    type="button"
                    onClick={() => toggleBot(bot)}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                      isActive
                        ? "border-gray-200 bg-white text-gray-800 hover:border-gray-300"
                        : "border-gray-200 bg-gray-100 text-gray-400 opacity-60"
                    }`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
                    {meta.label}
                  </button>
                );
              })}
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[900px]">
                {visibleBots.size === 0 ? (
                  <EmptyState title="All bots hidden." description="Click a legend item to show data." />
                ) : (
                  <div className="h-[420px]">
                    <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                        <XAxis
                          dataKey="dateLabel"
                          interval={dateLabelEvery}
                          tickLine={false}
                          axisLine={{ stroke: "#e5e7eb" }}
                          tick={{ fontSize: 12, fill: "#6b7280" }}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 12, fill: "#6b7280" }}
                          domain={yAxisDomain}
                        />
                        <Tooltip content={<TooltipContent />} />
                        {legendOrder.map((bot) => (
                          <Bar
                            key={bot}
                            dataKey={bot}
                            stackId="a"
                            fill={BOT_META[bot].color}
                            radius={[0, 0, 0, 0]}
                            isAnimationActive={false}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-950">Top Pages</h2>
              </div>
              {topPages.length ? (
                <div className="space-y-3">
                  {topPages.map((page) => (
                    <PageRow key={page.pagePath} page={page} topCount={topPages[0]?.count ?? 1} />
                  ))}
                </div>
              ) : (
                <EmptyState title="No pages to show." description="Once AI crawlers visit your site, you'll see them here." />
              )}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-950">Top Crawlers</h2>
              </div>
              {topCrawlers.length ? (
                <div className="space-y-3">
                  {topCrawlers.map((crawler) => (
                    <CrawlerRow key={crawler.bot} crawler={crawler} topCount={topCrawlers[0]?.count ?? 1} />
                  ))}
                </div>
              ) : (
                <EmptyState title="No crawlers to show." description="Once AI crawlers visit your site, you'll see them here." />
              )}
            </div>
          </section>
        </>
      ) : loading ? (
        <LoadingSkeleton />
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-gray-600">
          <div className="text-lg font-medium text-gray-900">No AI traffic yet.</div>
          <div className="mt-2 text-sm">Once AI crawlers visit your site, you&apos;ll see them here.</div>
        </div>
      )}
    </main>
  );
}

export default function TrafficPage() {
  return <TrafficDashboard />;
}
