export type Timing = { line: number; text: string; start: number; end: number; words: { text: string; start: number; end: number }[] };
export function voiceLines(job: string, lines: string[], narrator: { voice: string; style?: string; speed?: number }, options?: { language?: string; log?: (message: string) => void }): Promise<Timing[]>;
export function takeName(narrator: { voice: string; style?: string; speed?: number }, text: string): string;
