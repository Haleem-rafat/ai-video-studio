import { useRef, useState } from "react";
import { CheckIcon, PencilIcon, SparklesIcon, Trash2Icon, UploadIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { api, type Job } from "../api.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { JobProgress } from "./JobProgress.tsx";
import { MOOD_LABEL, MOODS, trackName, type Track } from "./promo-music.ts";

type Props = { tracks: Track[]; jobs: Job[]; onChanged: () => void };

/** The promo music library: listen, add your own song, make one with AI, rename, delete. */
export function MusicLibrary({ tracks, jobs, onChanged }: Props) {
  const upload = useRef<HTMLInputElement>(null);
  const [mood, setMood] = useState<(typeof MOODS)[number]>("upbeat");
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [uploading, setUploading] = useState(false);
  const composing = jobs.filter((job) => job.label.startsWith("New music: ") && (job.status === "queued" || job.status === "running"));

  const act = (work: Promise<unknown>, done: string) =>
    work
      .then(() => {
        toast.success(done);
        onChanged();
      })
      .catch((error: Error) => toast.error(error.message));

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={upload}
          type="file"
          accept="audio/mpeg,.mp3"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            setUploading(true);
            act(api.uploadTrack(file), `Added ${file.name}`).finally(() => setUploading(false));
          }}
        />
        <Button size="sm" variant="outline" disabled={uploading} onClick={() => upload.current?.click()}>
          <UploadIcon /> {uploading ? "Uploading…" : "Add your MP3"}
        </Button>
        <span className="text-xs text-muted-foreground">or</span>
        <select className="h-8 rounded-md border bg-background px-2 text-sm" value={mood} onChange={(event) => setMood(event.target.value as (typeof MOODS)[number])}>
          {MOODS.map((option) => (
            <option key={option} value={option}>
              {MOOD_LABEL[option]}
            </option>
          ))}
        </select>
        <Button size="sm" variant="outline" disabled={composing.length > 0} title="ElevenLabs Music composes a 130-second instrumental track (billed by ElevenLabs)" onClick={() => act(api.newTrack(mood), `Composing a new ${MOOD_LABEL[mood]} track…`)}>
          <SparklesIcon /> Make with AI
        </Button>
      </div>
      {composing.map((job) => (
        <JobProgress key={job.id} job={job} compact />
      ))}
      {tracks.length === 0 && <p className="text-sm text-muted-foreground">No music yet. Add an MP3 or make one with AI.</p>}
      <ul className="grid gap-1.5">
        {tracks.map((track) => (
          <li key={track.file} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
            {editing === track.file ? (
              <form
                className="flex flex-1 items-center gap-1.5"
                onSubmit={(event) => {
                  event.preventDefault();
                  act(api.renameTrack(track.file, name), "Track renamed").then(() => setEditing(null));
                }}
              >
                <Input autoFocus value={name} onChange={(event) => setName(event.target.value)} className="h-8" />
                <Button size="icon" type="submit" variant="ghost" disabled={!name.trim()} title="Save">
                  <CheckIcon />
                </Button>
                <Button size="icon" type="button" variant="ghost" title="Cancel" onClick={() => setEditing(null)}>
                  <XIcon />
                </Button>
              </form>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{trackName(track.file)}</span>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">{Math.round(track.seconds)}s</span>
                {track.seconds < 60 && <span className="text-xs text-muted-foreground">short promos only</span>}
              </>
            )}
            <audio src={`/promo-music/${track.file}`} controls preload="none" className="h-8" />
            {editing !== track.file && (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  title="Rename"
                  onClick={() => {
                    setEditing(track.file);
                    setName(trackName(track.file));
                  }}
                >
                  <PencilIcon />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-destructive"
                  title="Delete (promos already made keep their sound)"
                  onClick={() => {
                    if (confirm(`Delete ${trackName(track.file)} from the library?`)) act(api.deleteTrack(track.file), "Track deleted");
                  }}
                >
                  <Trash2Icon />
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
