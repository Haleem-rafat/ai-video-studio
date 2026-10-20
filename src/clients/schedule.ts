import { existsSync } from "node:fs";

import { ideasPath, listClients, localDate } from "./store.ts";
import type { Client } from "./types.ts";

const MORNING = 8;
const HOUR = 60 * 60 * 1000;

/** The clients whose ideas for today are due: daily ideas on, past 08:00, no file for today yet. */
export function dueClients(clients: Client[], now: Date, hasToday: (clientId: string) => boolean): Client[] {
  if (now.getHours() < MORNING) return [];
  return clients.filter((client) => client.dailyIdeas && !hasToday(client.id));
}

/**
 * Checks 10 s after the server starts and every hour. A Mac that slept
 * through 08:00 catches up on its first check. A client whose job is already
 * queued (`busy`) is skipped, so a slow job is never queued twice.
 */
export function startSchedule(run: (client: Client) => void, busy: (client: Client) => boolean): void {
  const check = async () => {
    try {
      const today = localDate();
      for (const client of dueClients(await listClients(), new Date(), (id) => existsSync(ideasPath(id, today)))) {
        if (!busy(client)) run(client);
      }
    } catch (error) {
      console.error(`ideas schedule: ${error instanceof Error ? error.message : error}`);
    }
  };
  setTimeout(check, 10_000);
  setInterval(check, HOUR);
}
