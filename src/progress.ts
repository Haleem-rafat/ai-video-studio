import { AsyncLocalStorage } from "node:async_hooks";

type Reporter = (stage: string, done?: number, total?: number) => void;

const reporter = new AsyncLocalStorage<Reporter>();

/**
 * Tells whoever runs this work how far it is: a stage ("voice", "render")
 * and, when it can be counted, how much of it is done. The studio's jobs
 * show it as a progress bar; elsewhere (the CLI) it does nothing.
 */
export function reportProgress(stage: string, done?: number, total?: number): void {
  reporter.getStore()?.(stage, done, total);
}

export function withProgress<T>(report: Reporter, work: () => Promise<T>): Promise<T> {
  return reporter.run(report, work);
}
