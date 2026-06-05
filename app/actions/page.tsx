"use client";

import { useEffect, useMemo, useState } from "react";
import type { Action, ActionType, MonitoringEvent, Severity, Status } from "@/lib/types";
import { ArrowRight, ChevronDown, MessageSquareText, Megaphone, PencilLine } from "lucide-react";
import { deriveActions, formatActionRelativeDate } from "@/lib/actions";

const STORAGE_KEY = "actionCentre.v1";

type Filters = {
  severity: Severity | "all";
  type: ActionType | "all";
};

type Tab = "active" | "dismissed";

const TYPE_OPTIONS: Array<{ value: Filters["type"]; label: string }> = [
  { value: "all", label: "All" },
  { value: "reddit", label: "Reddit" },
  { value: "outreach", label: "Outreach" },
  { value: "content", label: "Content" },
];

const SEVERITY_OPTIONS: Array<{ value: Filters["severity"]; label: string }> = [
  { value: "all", label: "All" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

function classNames(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function parseSavedActions(raw: string | null): Action[] | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;

    return parsed.filter(Boolean) as Action[];
  } catch {
    return null;
  }
}

function mergeActions(starter: Action[], saved: Action[] | null): Action[] {
  const savedById = new Map(saved?.map((action) => [action.id, action]) ?? []);

  return starter.map((action) => {
    const persisted = savedById.get(action.id);
    return persisted ? { ...action, status: persisted.status } : action;
  });
}

function severityRank(severity: Severity) {
  return severity === "high" ? 0 : severity === "medium" ? 1 : 2;
}

function typeLabel(type: ActionType) {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function statusLabel(status: Status) {
  if (status === "accepted") return "✓ Accepted";
  if (status === "dismissed") return "✕ Dismissed";
  return "Active";
}

function TypeIcon({ type }: { type: ActionType }) {
  if (type === "reddit") return <MessageSquareText className="h-4 w-4" />;
  if (type === "outreach") return <Megaphone className="h-4 w-4" />;
  return <PencilLine className="h-4 w-4" />;
}

function severityClasses(severity: Severity) {
  if (severity === "high") return "bg-red-100 text-red-800 border-red-200";
  if (severity === "medium") return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-gray-100 text-gray-700 border-gray-200";
}

function typeClasses(type: ActionType) {
  if (type === "reddit") return "bg-sky-50 text-sky-700 border-sky-200";
  if (type === "outreach") return "bg-violet-50 text-violet-700 border-violet-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
}

function SkeletonGrid() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="h-[220px] animate-pulse rounded-2xl border border-gray-200 bg-white p-4" />
      ))}
    </div>
  );
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600">
      <div className="text-base font-semibold text-gray-950">{title}</div>
      <p className="mx-auto mt-2 max-w-lg">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

function loadMonitoringEvents(signal: AbortSignal) {
  return fetch("/monitoring-events.json", { cache: "no-store", signal }).then(async (response) => {
    if (!response.ok) throw new Error("failed to load monitoring events");
    return (await response.json()) as MonitoringEvent[];
  });
}

function persistActions(actions: Action[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(actions));
    return true;
  } catch {
    return false;
  }
}

export default function ActionsPage() {
  const [hydrated, setHydrated] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  const [actions, setActions] = useState<Action[] | null>(null);
  const [tab, setTab] = useState<Tab>("active");
  const [filters, setFilters] = useState<Filters>({ severity: "all", type: "all" });

  useEffect(() => {
    setHydrated(true);
    const controller = new AbortController();

    async function init() {
      const events = await loadMonitoringEvents(controller.signal);
      const starter = deriveActions(events);

      let merged = starter;
      if (typeof window !== "undefined") {
        const saved = parseSavedActions(window.localStorage.getItem(STORAGE_KEY));
        merged = mergeActions(starter, saved);
      }

      setActions(merged);
      const savedOk = persistActions(merged);
      if (!savedOk) setStorageWarning(true);
    }

    void init().catch(() => {
      setActions([]);
    });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!actions) return;
    const ok = persistActions(actions);
    if (!ok) setStorageWarning(true);
  }, [actions]);

  const filteredActions = useMemo(() => {
    if (!actions) return [];

    return actions.filter((action) => {
      if (filters.severity !== "all" && action.severity !== filters.severity) return false;
      if (filters.type !== "all" && action.type !== filters.type) return false;
      return true;
    });
  }, [actions, filters]);

  const activeActions = useMemo(
    () => filteredActions.filter((action) => action.status === "active").sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || b.created_at.localeCompare(a.created_at)),
    [filteredActions],
  );
  const dismissedActions = useMemo(
    () => filteredActions.filter((action) => action.status !== "active").sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [filteredActions],
  );

  const visibleActions = tab === "active" ? activeActions : dismissedActions;
  const activeCount = activeActions.length;
  const dismissedCount = dismissedActions.length;
  const subtitleCount = activeCount;

  const updateActionStatus = (id: string, status: Extract<Status, "accepted" | "dismissed">) => {
    setActions((current) => current?.map((action) => (action.id === id ? { ...action, status } : action)) ?? current);
  };

  const clearFilters = () => setFilters({ severity: "all", type: "all" });

  const filterApplied = filters.severity !== "all" || filters.type !== "all";

  const planBanner = (
    <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
      <span>You&apos;re on the Explore plan — tracking 10 prompts with ChatGPT only</span>
      <button type="button" onClick={(e) => e.preventDefault()} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 font-medium text-gray-900 shadow-sm ring-1 ring-gray-200">
        See plans <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {planBanner}

      <header className="flex flex-col gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-950">Actions</h1>
          <p className="mt-1 text-sm text-gray-600">Prioritized recommendations to improve AI visibility, performance, and coverage.</p>
        </div>

        <div className="flex flex-wrap items-end justify-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
            Severity
            <div className="relative">
              <select
                value={filters.severity}
                onChange={(e) => setFilters((current) => ({ ...current, severity: e.target.value as Filters["severity"] }))}
                className="appearance-none rounded-xl border border-gray-300 bg-white px-3 py-2 pr-10 text-sm text-gray-900 shadow-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              >
                {SEVERITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
            Action type
            <div className="relative">
              <select
                value={filters.type}
                onChange={(e) => setFilters((current) => ({ ...current, type: e.target.value as Filters["type"] }))}
                className="appearance-none rounded-xl border border-gray-300 bg-white px-3 py-2 pr-10 text-sm text-gray-900 shadow-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              >
                {TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
          </label>
        </div>
      </header>

      <section className="mt-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-gray-950">AI Suggestions</h2>
          <p className="text-sm text-gray-600">Promptwatch detected {subtitleCount} new action{subtitleCount === 1 ? "" : "s"} from your recent monitoring data.</p>
        </div>

        {storageWarning ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Couldn&apos;t save your changes — they won&apos;t persist if you reload.
          </div>
        ) : null}

        <div className="mt-5 flex items-center gap-2 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setTab("active")}
            className={classNames(
              "rounded-t-xl border border-b-0 px-4 py-2 text-sm font-medium transition",
              tab === "active" ? "border-gray-300 bg-white text-gray-950" : "border-transparent text-gray-500 hover:text-gray-900",
            )}
          >
            Active ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setTab("dismissed")}
            className={classNames(
              "rounded-t-xl border border-b-0 px-4 py-2 text-sm font-medium transition",
              tab === "dismissed" ? "border-gray-300 bg-white text-gray-950" : "border-transparent text-gray-500 hover:text-gray-900",
            )}
          >
            Dismissed ({dismissedCount})
          </button>
        </div>

        {!hydrated || actions === null ? (
          <div className="mt-6">
            <SkeletonGrid />
          </div>
        ) : visibleActions.length === 0 ? (
          <div className="mt-6">
            {tab === "active" ? (
              filterApplied ? (
                <EmptyState
                  title="No actions match these filters"
                  description="Adjust severity or action type to widen the queue."
                  action={
                    <button type="button" onClick={clearFilters} className="inline-flex items-center rounded-full border border-gray-300 px-4 py-2 font-medium text-gray-900 transition hover:bg-gray-50">
                      Clear filters
                    </button>
                  }
                />
              ) : (
                <EmptyState title="All caught up — no active actions" description="New recommendations will appear here when the monitoring data changes." />
              )
            ) : (
              <EmptyState title="Nothing here yet." description="Accepted and dismissed items will appear here once you triage the queue." />
            )}
          </div>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleActions.map((action) => (
              <article key={action.id} className="flex min-h-[220px] flex-col rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className={classNames("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium", typeClasses(action.type))}>
                    <TypeIcon type={action.type} />
                    {typeLabel(action.type)}
                  </div>
                  <div className={classNames("rounded-full border px-3 py-1 text-xs font-semibold", severityClasses(action.severity))}>
                    {action.severity.charAt(0).toUpperCase() + action.severity.slice(1)}
                  </div>
                </div>

                <h3 className="mt-4 line-clamp-3 text-base font-semibold text-gray-950">{action.title}</h3>
                <p className="mt-2 line-clamp-3 text-sm text-gray-600">{action.description}</p>

                <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                  <span className="text-sm text-gray-500">{formatActionRelativeDate(action.created_at)}</span>

                  {action.status === "active" ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateActionStatus(action.id, "accepted")}
                        className="rounded-full bg-gray-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => updateActionStatus(action.id, "dismissed")}
                        className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                      >
                        Dismiss
                      </button>
                    </div>
                  ) : (
                    <span className={classNames("rounded-full px-3 py-1 text-xs font-semibold", action.status === "accepted" ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600")}>{statusLabel(action.status)}</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
