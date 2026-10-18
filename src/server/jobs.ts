import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { projectDir } from "../project.ts";
import { withProgress } from "../progress.ts";
import { appendUsage, collectUsage, STUDIO_LEDGER, type UsageEntry } from "../usage.ts";

export type JobStatus = "queued" | "running" | "done" | "failed";

/** Where a job is: a stage name ("voice", "render"…) and how far through it, when that is countable. */
export type Progress = { stage: string; done?: number; total?: number; startedAt: number };

export type Job = {
  id: string;
  label: string;
  projectId?: string;
  status: JobStatus;
  log: string[];
  /** Every stage the job has reached, in order; the last one is current. */
  stages: Progress[];
  /** US dollars spent on AI so far by this job. */
  cost: number;
  result?: unknown;
  error?: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
};

type Work = (log: (message: string) => void) => Promise<unknown>;

/** Where a finished job's AI costs are written: a project or chat folder, from its result. */
type UsageTarget = (result: unknown) => string | null;

const jobs = new Map<string, Job>();
/** Each running job's AI calls so far, for its live cost. */
const spent = new Map<string, UsageEntry[]>();
let chain: Promise<void> = Promise.resolve();

/** A job's costs go to its project, or to the project it just created. */
const projectTarget = (job: Job): UsageTarget => (result) => {
  const id = job.projectId ?? (typeof result === "string" ? result : null);
  if (!id || !/^[a-z0-9-]+$/.test(id)) return null;
  const dir = projectDir(id);
  return existsSync(join(dir, "project.json")) ? dir : null;
};

/** Moves a job to a stage, or updates how far through the current one it is. */
function progress(job: Job, stage: string, done?: number, total?: number): void {
  const last = job.stages.at(-1);
  if (last && last.stage === stage) Object.assign(last, { done: done ?? last.done, total: total ?? last.total });
  // A closing log line ("render: 57s video in 46s") names a stage already passed: it is not a new one.
  else if (!job.stages.some((reached) => reached.stage === stage)) job.stages.push({ stage, done, total, startedAt: Date.now() });
}

/**
 * Jobs run one at a time. Bonsai answers one prompt at a time anyway, and
 * two jobs writing the same project.json would lose each other's changes.
 * Running alone is also what makes the console capture below safe.
 */
export function enqueue(label: string, work: Work, projectId?: string, usageTarget?: UsageTarget): Job {
  const job: Job = { id: randomUUID(), label, projectId, status: "queued", log: [], stages: [], cost: 0, createdAt: Date.now() };
  jobs.set(job.id, job);

  chain = chain.then(async () => {
    job.status = "running";
    job.startedAt = Date.now();
    const log = (message: string) => {
      job.log.push(message);
      if (job.log.length > 500) job.log.shift();
      // "voice: …", "render: …": the word before the colon names the stage.
      const stage = message.match(/^([a-z][a-z -]{1,20}):/)?.[1];
      if (stage) progress(job, stage);
    };
    // The pipeline reports progress through console.log; mirror it into the job.
    const original = console.log;
    console.log = (...args: unknown[]) => {
      original(...args);
      log(args.map(String).join(" "));
    };

    const calls: UsageEntry[] = [];
    spent.set(job.id, calls);
    const { value, error, entries } = await withProgress((stage, done, total) => progress(job, stage, done, total), () => collectUsage(label, () => work(log), calls));
    spent.delete(job.id);
    job.cost = entries.reduce((sum, entry) => sum + entry.cost, 0);
    // Money spent is recorded even when the job fails half way.
    const target = (usageTarget ?? projectTarget(job))(value) ?? STUDIO_LEDGER;
    await appendUsage(target, entries).catch(() => {});
    if (error) {
      job.error = error instanceof Error ? error.message : String(error);
      job.status = "failed";
      log(`failed: ${job.error}`);
    } else {
      job.result = value;
      job.status = "done";
    }
    console.log = original;
    job.finishedAt = Date.now();
  });

  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function recentJobs(): Job[] {
  for (const [id, calls] of spent) jobs.get(id)!.cost = calls.reduce((sum, entry) => sum + entry.cost, 0);
  return [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
}
