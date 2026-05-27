"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

type TabKey = "agenda" | "infrastructure" | "vendors";

type System = {
  id: string;
  name: string;
  specs: string | null;
  safety_warning: string | null;
  status: string | null;
};

type Contractor = {
  id: string;
  category: string | null;
  name: string;
  phone: string | null;
  est_cost: string | null;
  notes: string | null;
};

type TaskRow = {
  id: string;
  title: string;
  frequency: string | null;
  system_id: string | null;
  materials: string | null;
  assignment: string | null;
  next_due_month: number | null;
  is_critical: boolean | null;
  last_completed: string | null;
  systems: System | System[] | null;
};

const tabs: { key: TabKey; label: string }[] = [
  { key: "agenda", label: "Agenda" },
  { key: "infrastructure", label: "Infrastructure" },
  { key: "vendors", label: "Vendors" },
];

const cardClass =
  "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70";

function formatCompletedDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "today";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getSystemFromTask(task: TaskRow): System | null {
  if (!task.systems) {
    return null;
  }
  return Array.isArray(task.systems) ? task.systems[0] ?? null : task.systems;
}

export default function Page() {
  const [activeTab, setActiveTab] = useState<TabKey>("agenda");
  const [systems, setSystems] = useState<System[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Record<string, boolean>>({});
  const [expandedSystemIds, setExpandedSystemIds] = useState<Record<string, boolean>>({});
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [systemsError, setSystemsError] = useState<string | null>(null);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [contractorsError, setContractorsError] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();

    async function loadDashboardData() {
      setIsLoading(true);
      setSystemsError(null);
      setTasksError(null);
      setContractorsError(null);

      const systemsQuery = supabase
        .from("systems")
        .select("*")
        .order("name", { ascending: true });

      const tasksQuery = supabase
        .from("tasks")
        .select("*, systems(*)")
        .order("next_due_month", { ascending: true, nullsFirst: false });

      const contractorsQuery = supabase
        .from("contractors")
        .select("*")
        .order("name", { ascending: true });

      const [systemsRes, tasksRes, contractorsRes] = await Promise.all([
        systemsQuery,
        tasksQuery,
        contractorsQuery,
      ]);

      if (systemsRes.error) {
        setSystemsError("Unable to load systems.");
      } else {
        setSystems((systemsRes.data ?? []) as System[]);
      }

      if (tasksRes.error) {
        setTasksError("Unable to load tasks.");
      } else {
        setTasks((tasksRes.data ?? []) as TaskRow[]);
      }

      if (contractorsRes.error) {
        setContractorsError("Unable to load contractors.");
      } else {
        setContractors((contractorsRes.data ?? []) as Contractor[]);
      }

      setIsLoading(false);
    }

    void loadDashboardData();
  }, []);

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const aValue = a.next_due_month ?? Number.MAX_SAFE_INTEGER;
      const bValue = b.next_due_month ?? Number.MAX_SAFE_INTEGER;
      return aValue - bValue;
    });
  }, [tasks]);

  function toggleTask(taskId: string) {
    setExpandedTaskIds((current) => ({
      ...current,
      [taskId]: !current[taskId],
    }));
  }

  function toggleSystem(systemId: string) {
    setExpandedSystemIds((current) => ({
      ...current,
      [systemId]: !current[systemId],
    }));
  }

  async function handleMarkComplete(taskId: string) {
    const completedAt = new Date().toISOString();
    const previousTasks = tasks;

    setUpdateError(null);
    setUpdatingTaskId(taskId);
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId ? { ...task, last_completed: completedAt } : task,
      ),
    );

    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("tasks")
      .update({ last_completed: completedAt })
      .eq("id", taskId);

    if (error) {
      setTasks(previousTasks);
      setUpdateError("Could not mark the task as complete. Try again.");
    }

    setUpdatingTaskId(null);
  }

  return (
    <main className="min-h-screen bg-slate-100 pb-24 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-5 sm:px-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Owings Hill CMMS</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Interactive maintenance dashboard
          </p>
        </header>

        {updateError ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {updateError}
          </p>
        ) : null}

        <section className="space-y-3">
          {activeTab === "agenda" ? (
            <>
              <h2 className="text-lg font-semibold">Maintenance Agenda</h2>
              {tasksError ? <p className="text-sm text-red-400">{tasksError}</p> : null}
              {isLoading ? <p className="text-sm text-slate-500">Loading tasks...</p> : null}
              {!isLoading && !tasksError && sortedTasks.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">No tasks due right now.</p>
              ) : null}
              <div className="space-y-3">
                {sortedTasks.map((task) => {
                  const taskSystem = getSystemFromTask(task);
                  const isExpanded = Boolean(expandedTaskIds[task.id]);
                  const isCompleted = Boolean(task.last_completed);
                  const showVendorPrompt =
                    task.assignment === "HIRE" || task.assignment === "BOTH";

                  return (
                    <article
                      key={task.id}
                      className={`${cardClass} transition ${
                        task.is_critical
                          ? "border-red-500/70 dark:border-red-500/50"
                          : "border-slate-200 dark:border-slate-800"
                      } ${isCompleted ? "opacity-75" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleTask(task.id)}
                        className="flex w-full items-start justify-between gap-3 text-left"
                      >
                        <div>
                          <h3
                            className={`text-base font-semibold ${
                              isCompleted ? "line-through decoration-2" : ""
                            }`}
                          >
                            {task.title}
                          </h3>
                          <p className="text-sm text-slate-600 dark:text-slate-400">
                            {taskSystem?.name ?? "Unassigned system"}
                          </p>
                        </div>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {isExpanded ? "Collapse" : "Expand"}
                        </span>
                      </button>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-slate-200 px-2 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          Due month: {task.next_due_month ?? "TBD"}
                        </span>
                        {task.frequency ? (
                          <span className="rounded-full bg-slate-200 px-2 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            {task.frequency}
                          </span>
                        ) : null}
                        {task.assignment ? (
                          <span className="rounded-full bg-slate-200 px-2 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            {task.assignment}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-3">
                        {isCompleted && task.last_completed ? (
                          <span className="inline-flex rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-sm font-medium text-emerald-300">
                            Completed on {formatCompletedDate(task.last_completed)}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleMarkComplete(task.id)}
                            disabled={updatingTaskId === task.id}
                            className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/25 disabled:opacity-70"
                          >
                            {updatingTaskId === task.id ? "Saving..." : "Mark as Complete"}
                          </button>
                        )}
                      </div>

                      {isExpanded ? (
                        <div className="mt-4 space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-slate-500">Materials</p>
                            <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                              {task.materials ?? "No materials listed"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide text-slate-500">
                              Assignment
                            </p>
                            <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                              {task.assignment ?? "Not set"}
                            </p>
                          </div>
                          {showVendorPrompt ? (
                            <p className="rounded-lg border border-sky-500/35 bg-sky-500/10 px-3 py-2 text-sm text-sky-200">
                              Vendor needed. Check the Vendors tab for contacts.
                            </p>
                          ) : null}
                          {taskSystem?.specs ? (
                            <div className="rounded-lg border border-slate-300 bg-slate-200/70 p-3 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                              <p className="font-medium">System Specs</p>
                              <p className="mt-1">{taskSystem.specs}</p>
                            </div>
                          ) : null}
                          {taskSystem?.safety_warning ? (
                            <div className="rounded-lg border border-orange-500/50 bg-orange-500/20 p-3 text-sm text-orange-100">
                              <p className="font-semibold">[!] Safety Warning</p>
                              <p className="mt-1">{taskSystem.safety_warning}</p>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </>
          ) : null}

          {activeTab === "infrastructure" ? (
            <>
              <h2 className="text-lg font-semibold">Infrastructure Deep-Dives</h2>
              {systemsError ? <p className="text-sm text-red-400">{systemsError}</p> : null}
              {isLoading ? <p className="text-sm text-slate-500">Loading systems...</p> : null}
              {!isLoading && !systemsError && systems.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">No systems found.</p>
              ) : null}
              <div className="space-y-3">
                {systems.map((system) => {
                  const isExpanded = Boolean(expandedSystemIds[system.id]);
                  return (
                    <article key={system.id} className={cardClass}>
                      <button
                        type="button"
                        onClick={() => toggleSystem(system.id)}
                        className="flex w-full items-center justify-between gap-3 text-left"
                      >
                        <div>
                          <h3 className="text-base font-semibold">{system.name}</h3>
                          <p className="text-sm text-slate-600 dark:text-slate-400">
                            {system.status ?? "Status unknown"}
                          </p>
                        </div>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {isExpanded ? "Collapse" : "Expand"}
                        </span>
                      </button>
                      {isExpanded ? (
                        <div className="mt-4 space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                          <div className="rounded-lg border border-slate-300 bg-slate-200/70 p-3 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            <p className="font-medium">Specs</p>
                            <p className="mt-1">{system.specs ?? "No specs available."}</p>
                          </div>
                          {system.safety_warning ? (
                            <div className="rounded-lg border border-orange-500/50 bg-orange-500/20 p-3 text-sm text-orange-100">
                              <p className="font-semibold">[!] Safety Warning</p>
                              <p className="mt-1">{system.safety_warning}</p>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </>
          ) : null}

          {activeTab === "vendors" ? (
            <>
              <h2 className="text-lg font-semibold">Vendor Directory</h2>
              {contractorsError ? <p className="text-sm text-red-400">{contractorsError}</p> : null}
              {isLoading ? <p className="text-sm text-slate-500">Loading vendors...</p> : null}
              {!isLoading && !contractorsError && contractors.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">No vendors found.</p>
              ) : null}
              <div className="space-y-3">
                {contractors.map((contractor) => (
                  <article key={contractor.id} className={cardClass}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                          {contractor.category ?? "General"}
                        </p>
                        <h3 className="text-base font-semibold">{contractor.name}</h3>
                        <p className="text-sm text-slate-700 dark:text-slate-300">
                          {contractor.est_cost ? `Estimated cost: ${contractor.est_cost}` : "Estimated cost: TBD"}
                        </p>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          {contractor.notes ?? "No notes listed."}
                        </p>
                      </div>
                      {contractor.phone ? (
                        <a
                          href={`tel:${contractor.phone}`}
                          className="shrink-0 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-sm font-medium text-sky-300 transition hover:bg-sky-500/20"
                        >
                          Call
                        </a>
                      ) : (
                        <span className="text-xs text-slate-500 dark:text-slate-400">No phone</span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : null}
        </section>
      </div>

      <nav className="fixed inset-x-0 bottom-0 border-t border-slate-300 bg-white/90 px-3 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto grid w-full max-w-3xl grid-cols-3 gap-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? "bg-slate-900 text-slate-100 dark:bg-slate-100 dark:text-slate-900"
                    : "bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>
    </main>
  );
}
