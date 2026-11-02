type Options = { workers?: number; keepFrames?: boolean; log?: (message: string) => void; onProgress?: (done: number, total: number) => void };
export function renderReel(jobFile: string, options: Options & { stills: number[] }): Promise<string[]>;
export function renderReel(jobFile: string, options?: Options): Promise<string>;
