"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

type TabKey =
  | "agenda"
  | "calendar"
  | "history"
  | "finances"
  | "infrastructure"
  | "vendors";

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
  estimated_cost: number | string | null;
  systems: System | System[] | null;
};

type LogTaskRelation = {
  title: string;
} | null;

type MaintenanceLog = {
  id: string;
  task_id: string;
  completed_at: string;
  actual_cost: number | string | null;
  notes: string | null;
  tasks: LogTaskRelation | LogTaskRelation[];
};

type TaskStatus = "Due Now" | "Upcoming" | "Future" | "Completed";

type CompletionSnapshot = {
  previousLastCompleted: string | null;
  previousNextDueMonth: number | null;
  logId: string;
};

const tabs: { key: TabKey; label: string }[] = [
  { key: "agenda", label: "Agenda" },
  { key: "calendar", label: "Calendar" },
  { key: "history", label: "History" },
  { key: "finances", label: "Finances" },
  { key: "infrastructure", label: "Infrastructure" },
  { key: "vendors", label: "Vendors" },
];

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const taskStatusPriority: Record<TaskStatus, number> = {
  "Due Now": 0,
  Upcoming: 1,
  Future: 2,
  Completed: 3,
};

const cardClass =
  "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70";

function parseAmount(value: number | string | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatCurrency(value: number): string {
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCompletedDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
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

function getTaskFromLog(log: MaintenanceLog): LogTaskRelation {
  if (!log.tasks) {
    return null;
  }
  return Array.isArray(log.tasks) ? log.tasks[0] ?? null : log.tasks;
}

function wasCompletedThisCycle(
  lastCompleted: string | null,
  currentMonth: number,
  currentYear: number,
) {
  if (!lastCompleted) {
    return false;
  }

  const completedDate = new Date(lastCompleted);
  if (Number.isNaN(completedDate.getTime())) {
    return false;
  }

  return (
    completedDate.getMonth() + 1 === currentMonth &&
    completedDate.getFullYear() === currentYear
  );
}

function getTaskStatus(
  task: TaskRow,
  currentMonth: number,
  currentYear: number,
): TaskStatus {
  const isCompletedThisCycle = wasCompletedThisCycle(
    task.last_completed,
    currentMonth,
    currentYear,
  );
  if (isCompletedThisCycle) {
    return "Completed";
  }

  if (task.next_due_month === currentMonth || task.next_due_month === 0) {
    return "Due Now";
  }

  const nextMonth = (currentMonth % 12) + 1;
  if (task.next_due_month === nextMonth) {
    return "Upcoming";
  }

  return "Future";
}

function getFrequencyIncrement(frequency: string | null): number | null {
  if (!frequency) {
    return null;
  }

  const normalizedFrequency = frequency.toLowerCase();

  if (
    normalizedFrequency.includes("monthly") &&
    !normalizedFrequency.includes("bi-month")
  ) {
    return 0;
  }
  if (
    normalizedFrequency.includes("2-3 months") ||
    normalizedFrequency.includes("every 2 months") ||
    normalizedFrequency.includes("bi-month")
  ) {
    return 2;
  }
  if (normalizedFrequency.includes("quarter")) {
    return 3;
  }
  if (
    normalizedFrequency.includes("semi-annual") ||
    normalizedFrequency.includes("semiannual")
  ) {
    return 6;
  }
  if (normalizedFrequency.includes("annual") || normalizedFrequency.includes("year")) {
    return 12;
  }

  return null;
}

function calculateNextDueMonth(
  frequency: string | null,
  currentMonth: number,
  fallback: number | null,
): number | null {
  const increment = getFrequencyIncrement(frequency);
  if (increment === null) {
    return fallback;
  }
  if (increment === 0) {
    return 0;
  }
  return ((currentMonth - 1 + increment) % 12) + 1;
}

export default function Page() {
  const [activeTab, setActiveTab] = useState<TabKey>("agenda");
  const [systems, setSystems] = useState<System[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Record<string, boolean>>({});
  const [expandedSystemIds, setExpandedSystemIds] = useState<Record<string, boolean>>({});
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  const [taskToComplete, setTaskToComplete] = useState<TaskRow | null>(null);
  const [completionCost, setCompletionCost] = useState("0");
  const [completionNotes, setCompletionNotes] = useState("");
  const [completionSnapshots, setCompletionSnapshots] = useState<
    Record<string, CompletionSnapshot>
  >({});
  const [isLoading, setIsLoading] = useState(true);

  const [systemsError, setSystemsError] = useState<string | null>(null);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [contractorsError, setContractorsError] = useState<string | null>(null);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    const supabase = getSupabaseClient();

    async function loadDashboardData() {
      setIsLoading(true);
      setSystemsError(null);
      setTasksError(null);
      setContractorsError(null);
      setLogsError(null);

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

      const logsQuery = supabase
        .from("maintenance_logs")
        .select("id, task_id, completed_at, actual_cost, notes, tasks(title)")
        .order("completed_at", { ascending: false });

      const [systemsRes, tasksRes, contractorsRes, logsRes] = await Promise.all([
        systemsQuery,
        tasksQuery,
        contractorsQuery,
        logsQuery,
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

      if (logsRes.error) {
        setLogsError("Unable to load maintenance history.");
      } else {
        setLogs((logsRes.data ?? []) as MaintenanceLog[]);
      }

      setIsLoading(false);
    }

    void loadDashboardData();
  }, []);

  const taskStatuses = useMemo(() => {
    return Object.fromEntries(
      tasks.map((task) => [task.id, getTaskStatus(task, currentMonth, currentYear)]),
    ) as Record<string, TaskStatus>;
  }, [tasks, currentMonth, currentYear]);

  const dueNowCount = useMemo(() => {
    return tasks.reduce((count, task) => {
      return taskStatuses[task.id] === "Due Now" ? count + 1 : count;
    }, 0);
  }, [tasks, taskStatuses]);

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const aStatus = taskStatuses[a.id] ?? "Future";
      const bStatus = taskStatuses[b.id] ?? "Future";
      const statusDiff = taskStatusPriority[aStatus] - taskStatusPriority[bStatus];
      if (statusDiff !== 0) {
        return statusDiff;
      }

      const aValue = a.next_due_month ?? Number.MAX_SAFE_INTEGER;
      const bValue = b.next_due_month ?? Number.MAX_SAFE_INTEGER;
      const dueMonthDiff = aValue - bValue;
      if (dueMonthDiff !== 0) {
        return dueMonthDiff;
      }

      return a.title.localeCompare(b.title);
    });
  }, [tasks, taskStatuses]);

  const logsSorted = useMemo(() => {
    return [...logs].sort((a, b) => {
      const aDate = new Date(a.completed_at).getTime();
      const bDate = new Date(b.completed_at).getTime();
      return bDate - aDate;
    });
  }, [logs]);

  const everyMonthTasks = useMemo(
    () => tasks.filter((task) => task.next_due_month === 0),
    [tasks],
  );

  const tasksByMonth = useMemo(() => {
    const monthMap: Record<number, TaskRow[]> = {
      1: [],
      2: [],
      3: [],
      4: [],
      5: [],
      6: [],
      7: [],
      8: [],
      9: [],
      10: [],
      11: [],
      12: [],
    };

    tasks.forEach((task) => {
      if (
        task.next_due_month !== null &&
        task.next_due_month >= 1 &&
        task.next_due_month <= 12
      ) {
        monthMap[task.next_due_month].push(task);
      }
    });

    Object.keys(monthMap).forEach((month) => {
      monthMap[Number(month)].sort((a, b) => a.title.localeCompare(b.title));
    });

    return monthMap;
  }, [tasks]);

  const ytdSpent = useMemo(() => {
    return logs.reduce((sum, log) => {
      const completedDate = new Date(log.completed_at);
      if (Number.isNaN(completedDate.getTime()) || completedDate.getFullYear() !== currentYear) {
        return sum;
      }
      return sum + parseAmount(log.actual_cost);
    }, 0);
  }, [logs, currentYear]);

  const estimatedUpcomingCosts = useMemo(() => {
    return tasks.reduce((sum, task) => {
      const status = taskStatuses[task.id];
      if (status !== "Due Now" && status !== "Upcoming") {
        return sum;
      }
      return sum + parseAmount(task.estimated_cost);
    }, 0);
  }, [tasks, taskStatuses]);

  const mostRecentActualCostByTask = useMemo(() => {
    const map: Record<string, number> = {};
    for (const log of logsSorted) {
      if (map[log.task_id] === undefined) {
        map[log.task_id] = parseAmount(log.actual_cost);
      }
    }
    return map;
  }, [logsSorted]);

  const estimateComparisonTasks = useMemo(() => {
    return tasks
      .filter((task) => parseAmount(task.estimated_cost) > 0)
      .map((task) => {
        const estimate = parseAmount(task.estimated_cost);
        const actual = mostRecentActualCostByTask[task.id];
        return {
          id: task.id,
          title: task.title,
          estimate,
          actual: actual ?? null,
          variance: actual === undefined ? null : actual - estimate,
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [tasks, mostRecentActualCostByTask]);

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

  function openCompletionModal(task: TaskRow) {
    setTaskToComplete(task);
    setCompletionCost("0");
    setCompletionNotes("");
    setIsCompletionModalOpen(true);
    setUpdateError(null);
  }

  function closeCompletionModal() {
    setIsCompletionModalOpen(false);
    setTaskToComplete(null);
    setCompletionCost("0");
    setCompletionNotes("");
  }

  async function handleCompleteSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!taskToComplete) {
      return;
    }

    const supabase = getSupabaseClient();
    const nowIso = new Date().toISOString();
    const actualCost = Math.max(0, parseAmount(completionCost));
    const nextDueMonth = calculateNextDueMonth(
      taskToComplete.frequency,
      currentMonth,
      taskToComplete.next_due_month,
    );
    const notesValue = completionNotes.trim() || null;

    setUpdateError(null);
    setUpdatingTaskId(taskToComplete.id);

    const { data: insertedLog, error: insertError } = await supabase
      .from("maintenance_logs")
      .insert({
        task_id: taskToComplete.id,
        completed_at: nowIso,
        actual_cost: actualCost,
        notes: notesValue,
      })
      .select("id, task_id, completed_at, actual_cost, notes, tasks(title)")
      .single();

    if (insertError || !insertedLog) {
      setUpdateError("Could not create maintenance log. Try again.");
      setUpdatingTaskId(null);
      return;
    }

    const updatePayload = {
      last_completed: nowIso,
      next_due_month: nextDueMonth,
    };

    const { error: updateTaskError } = await supabase
      .from("tasks")
      .update(updatePayload)
      .eq("id", taskToComplete.id);

    if (updateTaskError) {
      await supabase.from("maintenance_logs").delete().eq("id", insertedLog.id);
      setUpdateError("Could not update task after logging completion. Try again.");
      setUpdatingTaskId(null);
      return;
    }

    setTasks((current) =>
      current.map((task) => (task.id === taskToComplete.id ? { ...task, ...updatePayload } : task)),
    );
    setLogs((current) => [insertedLog as MaintenanceLog, ...current]);
    setCompletionSnapshots((current) => ({
      ...current,
      [taskToComplete.id]: {
        previousLastCompleted: taskToComplete.last_completed,
        previousNextDueMonth: taskToComplete.next_due_month,
        logId: insertedLog.id,
      },
    }));

    closeCompletionModal();
    setUpdatingTaskId(null);
  }

  async function handleUndoCompletion(task: TaskRow) {
    const snapshot = completionSnapshots[task.id];
    if (!snapshot) {
      setUpdateError(
        "Undo is only available for completions made this session because original due values are required.",
      );
      return;
    }

    const supabase = getSupabaseClient();
    setUpdateError(null);
    setUpdatingTaskId(task.id);

    const { error: deleteLogError } = await supabase
      .from("maintenance_logs")
      .delete()
      .eq("id", snapshot.logId);

    if (deleteLogError) {
      setUpdateError("Could not remove the maintenance log. Try again.");
      setUpdatingTaskId(null);
      return;
    }

    const updatePayload = {
      last_completed: snapshot.previousLastCompleted,
      next_due_month: snapshot.previousNextDueMonth,
    };

    const { error: updateTaskError } = await supabase
      .from("tasks")
      .update(updatePayload)
      .eq("id", task.id);

    if (updateTaskError) {
      setUpdateError("Log was removed but task could not be reverted. Please refresh.");
      setUpdatingTaskId(null);
      return;
    }

    setTasks((current) =>
      current.map((existingTask) =>
        existingTask.id === task.id ? { ...existingTask, ...updatePayload } : existingTask,
      ),
    );
    setLogs((current) => current.filter((log) => log.id !== snapshot.logId));
    setCompletionSnapshots((current) => {
      const updated = { ...current };
      delete updated[task.id];
      return updated;
    });
    setUpdatingTaskId(null);
  }

  return (
    <main className="min-h-screen bg-slate-100 pb-10 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:px-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Owings Hill CMMS</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Interactive maintenance dashboard
          </p>
        </header>

        <nav
          aria-label="Dashboard views"
          className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="flex min-w-max gap-2 pb-1">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
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

        {updateError ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {updateError}
          </p>
        ) : null}

        {activeTab === "agenda" ? (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Maintenance Agenda</h2>
            {!isLoading && !tasksError ? (
              <article
                className={`${cardClass} ${
                  dueNowCount === 0
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : "border-red-500/40 bg-red-500/10"
                }`}
              >
                <p
                  className={`text-sm font-medium ${
                    dueNowCount === 0 ? "text-emerald-300" : "text-red-300"
                  }`}
                >
                  You have {dueNowCount} tasks due this month.
                </p>
              </article>
            ) : null}
            {tasksError ? <p className="text-sm text-red-400">{tasksError}</p> : null}
            {isLoading ? <p className="text-sm text-slate-500">Loading tasks...</p> : null}
            {!isLoading && !tasksError && sortedTasks.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No tasks due right now.</p>
            ) : null}
            <div className="space-y-3">
              {sortedTasks.map((task) => {
                const taskSystem = getSystemFromTask(task);
                const isExpanded = Boolean(expandedTaskIds[task.id]);
                const taskStatus = taskStatuses[task.id] ?? "Future";
                const isCompleted = taskStatus === "Completed";
                const showVendorPrompt = task.assignment === "HIRE" || task.assignment === "BOTH";
                const canUndo = Boolean(completionSnapshots[task.id]);

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
                        <div className="flex flex-wrap items-center gap-2">
                          <h3
                            className={`text-base font-semibold ${
                              isCompleted ? "line-through decoration-2" : ""
                            }`}
                          >
                            {task.title}
                          </h3>
                          {taskStatus === "Due Now" ? (
                            <span className="animate-pulse rounded-full bg-red-500 px-2 py-1 text-xs font-semibold text-red-50">
                              DUE NOW
                            </span>
                          ) : null}
                          {taskStatus === "Upcoming" ? (
                            <span className="rounded-full bg-amber-500/30 px-2 py-1 text-xs font-semibold text-amber-200">
                              Coming Up
                            </span>
                          ) : null}
                          {taskStatus === "Completed" ? (
                            <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-300">
                              Done
                            </span>
                          ) : null}
                        </div>
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
                      {parseAmount(task.estimated_cost) > 0 ? (
                        <span className="rounded-full bg-sky-500/15 px-2 py-1 text-sky-200">
                          Est: {formatCurrency(parseAmount(task.estimated_cost))}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {!isCompleted ? (
                        <button
                          type="button"
                          onClick={() => openCompletionModal(task)}
                          disabled={updatingTaskId === task.id}
                          className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/25 disabled:opacity-70"
                        >
                          {updatingTaskId === task.id ? "Saving..." : "Mark as Complete"}
                        </button>
                      ) : null}
                      {isCompleted ? (
                        <>
                          <span className="rounded-lg border border-slate-400/50 bg-slate-200/20 px-3 py-1.5 text-sm text-slate-300">
                            Completed on {task.last_completed ? formatCompletedDate(task.last_completed) : "today"}
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleUndoCompletion(task)}
                            disabled={updatingTaskId === task.id || !canUndo}
                            className="rounded-lg border border-slate-400/50 bg-slate-200/20 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-slate-200/30 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {updatingTaskId === task.id ? "Reverting..." : "Undo"}
                          </button>
                        </>
                      ) : null}
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
                          <p className="text-xs uppercase tracking-wide text-slate-500">Assignment</p>
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
          </section>
        ) : null}

        {activeTab === "calendar" ? (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Year View Calendar</h2>
            {isLoading ? <p className="text-sm text-slate-500">Loading calendar...</p> : null}
            {tasksError ? <p className="text-sm text-red-400">{tasksError}</p> : null}
            {!isLoading && !tasksError ? (
              <>
                <article className={cardClass}>
                  <h3 className="text-base font-semibold">Every Month</h3>
                  {everyMonthTasks.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                      No monthly tasks.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1 text-sm text-slate-200">
                      {everyMonthTasks.map((task) => (
                        <li key={task.id} className="rounded-lg bg-slate-800/60 px-2 py-1">
                          {task.title}
                        </li>
                      ))}
                    </ul>
                  )}
                </article>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {monthNames.map((monthName, index) => {
                    const month = index + 1;
                    const monthTasks = tasksByMonth[month] ?? [];
                    return (
                      <article key={monthName} className={cardClass}>
                        <h3 className="text-base font-semibold">{monthName}</h3>
                        {monthTasks.length === 0 ? (
                          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                            No tasks scheduled.
                          </p>
                        ) : (
                          <ul className="mt-2 space-y-1 text-sm text-slate-200">
                            {monthTasks.map((task) => (
                              <li key={task.id} className="rounded-lg bg-slate-800/60 px-2 py-1">
                                {task.title}
                              </li>
                            ))}
                          </ul>
                        )}
                      </article>
                    );
                  })}
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        {activeTab === "history" ? (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Completion History</h2>
            {logsError ? <p className="text-sm text-red-400">{logsError}</p> : null}
            {isLoading ? <p className="text-sm text-slate-500">Loading history...</p> : null}
            {!isLoading && !logsError && logsSorted.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No maintenance completions logged yet.
              </p>
            ) : null}
            <div className="space-y-3">
              {logsSorted.map((log) => {
                const logTask = getTaskFromLog(log);
                const amount = parseAmount(log.actual_cost);
                return (
                  <article key={log.id} className={cardClass}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold">
                          {logTask?.title ?? "Unknown task"}
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {formatCompletedDate(log.completed_at)}
                        </p>
                      </div>
                      <span className="rounded-lg bg-emerald-500/15 px-2 py-1 text-sm font-medium text-emerald-200">
                        {formatCurrency(amount)}
                      </span>
                    </div>
                    {log.notes ? (
                      <p className="mt-3 text-sm text-slate-300">
                        <span className="font-medium text-slate-200">Notes:</span> {log.notes}
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {activeTab === "finances" ? (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Financial Dashboard</h2>
            {isLoading ? <p className="text-sm text-slate-500">Loading finances...</p> : null}
            {(tasksError || logsError) && !isLoading ? (
              <p className="text-sm text-red-400">
                Unable to compute full financial totals right now.
              </p>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <article className={cardClass}>
                <p className="text-sm text-slate-500 dark:text-slate-400">Total Spent YTD</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-300">{formatCurrency(ytdSpent)}</p>
              </article>
              <article className={cardClass}>
                <p className="text-sm text-slate-500 dark:text-slate-400">Estimated Upcoming Costs</p>
                <p className="mt-2 text-2xl font-semibold text-amber-200">
                  {formatCurrency(estimatedUpcomingCosts)}
                </p>
              </article>
            </div>

            <article className={cardClass}>
              <h3 className="text-base font-semibold">Estimate vs Most Recent Actual</h3>
              {estimateComparisonTasks.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  No tasks with estimated costs yet.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {estimateComparisonTasks.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2"
                    >
                      <p className="text-sm font-medium text-slate-100">{item.title}</p>
                      <p className="mt-1 text-xs text-slate-300">
                        Estimate: {formatCurrency(item.estimate)} | Latest actual:{" "}
                        {item.actual === null ? "No history" : formatCurrency(item.actual)}
                        {item.variance === null
                          ? ""
                          : ` | Variance: ${item.variance >= 0 ? "+" : ""}${formatCurrency(item.variance)}`}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </section>
        ) : null}

        {activeTab === "infrastructure" ? (
          <section className="space-y-3">
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
          </section>
        ) : null}

        {activeTab === "vendors" ? (
          <section className="space-y-3">
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
                        {contractor.est_cost
                          ? `Estimated cost: ${contractor.est_cost}`
                          : "Estimated cost: TBD"}
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
          </section>
        ) : null}
      </div>

      {isCompletionModalOpen && taskToComplete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-xl">
            <h3 className="text-lg font-semibold">Log Completion</h3>
            <p className="mt-1 text-sm text-slate-400">{taskToComplete.title}</p>
            <form className="mt-4 space-y-3" onSubmit={(event) => void handleCompleteSubmit(event)}>
              <label className="block text-sm">
                <span className="text-slate-300">Actual Cost ($)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={completionCost}
                  onChange={(event) => setCompletionCost(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-sky-500"
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-300">Notes (optional)</span>
                <textarea
                  rows={3}
                  value={completionNotes}
                  onChange={(event) => setCompletionNotes(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-sky-500"
                  placeholder="Anything worth recording?"
                />
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeCompletionModal}
                  className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingTaskId === taskToComplete.id}
                  className="rounded-lg border border-emerald-500/50 bg-emerald-500/20 px-3 py-1.5 text-sm font-medium text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-60"
                >
                  {updatingTaskId === taskToComplete.id ? "Saving..." : "Save Completion"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
