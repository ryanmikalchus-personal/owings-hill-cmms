"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

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
  systems: { name: string } | { name: string }[] | null;
};

const cardClass =
  "rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm";

export default function Page() {
  const [systems, setSystems] = useState<System[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [systemsError, setSystemsError] = useState<string | null>(null);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [contractorsError, setContractorsError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();

    async function loadDashboardData() {
      setIsLoading(true);
      setSystemsError(null);
      setTasksError(null);
      setContractorsError(null);

      const systemsQuery = supabase
        .from("systems")
        .select("id, name, specs, safety_warning, status")
        .order("name", { ascending: true });

      const tasksQuery = supabase
        .from("tasks")
        .select(
          "id, title, frequency, system_id, materials, assignment, next_due_month, is_critical, systems(name)",
        )
        .order("next_due_month", { ascending: true, nullsFirst: false });

      const contractorsQuery = supabase
        .from("contractors")
        .select("id, category, name, phone, est_cost, notes")
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

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Owings Hill CMMS</h1>
          <p className="text-sm text-slate-400">Systems, tasks, and vendor operations dashboard</p>
        </header>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">System Profiles</h2>
            {isLoading ? <span className="text-xs text-slate-500">Loading...</span> : null}
          </div>
          {systemsError ? <p className="text-sm text-red-400">{systemsError}</p> : null}
          {!isLoading && !systemsError && systems.length === 0 ? (
            <p className="text-sm text-slate-400">No systems found.</p>
          ) : null}
          <div className="flex gap-3 overflow-x-auto pb-1 md:grid md:grid-cols-2 md:overflow-visible">
            {systems.map((system) => (
              <article key={system.id} className={`${cardClass} min-w-[260px] md:min-w-0`}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-semibold">{system.name}</h3>
                  {system.status ? (
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                      {system.status}
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 space-y-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Specs</p>
                    <p className="mt-1 text-sm text-slate-200">{system.specs ?? "Not provided"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Safety warning</p>
                    <p className="mt-1 text-sm text-amber-200">
                      {system.safety_warning ?? "No safety warnings listed"}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Tasks Due</h2>
            {isLoading ? <span className="text-xs text-slate-500">Loading...</span> : null}
          </div>
          {tasksError ? <p className="text-sm text-red-400">{tasksError}</p> : null}
          {!isLoading && !tasksError && sortedTasks.length === 0 ? (
            <p className="text-sm text-slate-400">No tasks due right now.</p>
          ) : null}
          <div className="space-y-3">
            {sortedTasks.map((task) => {
              const taskSystem = Array.isArray(task.systems) ? task.systems[0] : task.systems;
              const systemName = taskSystem?.name ?? "Unassigned system";
              return (
                <article
                  key={task.id}
                  className={`${cardClass} ${task.is_critical ? "border-red-500/60" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-semibold">{task.title}</h3>
                      <p className="text-sm text-slate-400">{systemName}</p>
                    </div>
                    {task.is_critical ? (
                      <span className="rounded-full bg-red-600/80 px-2 py-0.5 text-xs font-medium text-red-50">
                        Critical
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-slate-800 px-2 py-1 text-slate-200">
                      Due month: {task.next_due_month ?? "TBD"}
                    </span>
                    {task.frequency ? (
                      <span className="rounded-full bg-slate-800 px-2 py-1 text-slate-200">
                        {task.frequency}
                      </span>
                    ) : null}
                    {task.assignment ? (
                      <span className="rounded-full bg-slate-800 px-2 py-1 text-slate-200">
                        {task.assignment}
                      </span>
                    ) : null}
                  </div>
                  {task.materials ? (
                    <p className="mt-3 text-sm text-slate-300">
                      <span className="font-medium text-slate-200">Materials:</span> {task.materials}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Vendor Directory</h2>
            {isLoading ? <span className="text-xs text-slate-500">Loading...</span> : null}
          </div>
          {contractorsError ? <p className="text-sm text-red-400">{contractorsError}</p> : null}
          {!isLoading && !contractorsError && contractors.length === 0 ? (
            <p className="text-sm text-slate-400">No vendors found.</p>
          ) : null}
          <div className="space-y-3">
            {contractors.map((contractor) => (
              <article key={contractor.id} className={cardClass}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold">{contractor.name}</h3>
                    <p className="text-sm text-slate-400">
                      {contractor.category ?? "General"}{" "}
                      {contractor.est_cost ? `• Est. ${contractor.est_cost}` : ""}
                    </p>
                    {contractor.notes ? (
                      <p className="mt-2 text-sm text-slate-300">{contractor.notes}</p>
                    ) : null}
                  </div>
                  {contractor.phone ? (
                    <a
                      href={`tel:${contractor.phone}`}
                      className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-sm font-medium text-sky-300 hover:bg-sky-500/20"
                    >
                      {contractor.phone}
                    </a>
                  ) : (
                    <span className="text-xs text-slate-500">No phone</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
