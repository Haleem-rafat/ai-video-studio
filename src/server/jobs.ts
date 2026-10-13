import { randomUUID } from "node:crypto";

export type JobStatus = "queued" | "running" | "done" | "failed";

export type Job = {
  id: string;
  label: string;
  projectId?: string;
  status: JobStatus;
  log: string[];
  result?: unknown;
  error?: string;
  createdAt: number;
  finishedAt?: number;
};

type Work = (log: (message: string) => void) => Promise<unknown>;

const jobs = new Map<string, Job>();
let chain: Promise<void> = Promise.resolve();

/**
 * Jobs run one at a time. Bonsai answers one prompt at a time anyway, and
 * two jobs writing the same project.json would lose each other's changes.
 * Running alone is also what makes the console capture below safe.
 */
export function enqueue(label: string, work: Work, projectId?: string): Job {
  const job: Job = { id: randomUUID(), label, projectId, status: "queued", log: [], createdAt: Date.now() };
  jobs.set(job.id, job);

  chain = chain.then(async () => {
    job.status = "running";
    const log = (message: string) => {
      job.log.push(message);
      if (job.log.length > 500) job.log.shift();
    };
    // The pipeline reports progress through console.log; mirror it into the job.
    const original = console.log;
    console.log = (...args: unknown[]) => {
      original(...args);
      log(args.map(String).join(" "));
    };

    try {
      job.result = await work(log);
      job.status = "done";
    } catch (error) {
      job.error = error instanceof Error ? error.message : String(error);
      job.status = "failed";
      log(`failed: ${job.error}`);
    } finally {
      console.log = original;
      job.finishedAt = Date.now();
    }
  });

  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function recentJobs(): Job[] {
  return [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
}
