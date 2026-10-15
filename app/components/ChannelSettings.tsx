import { ImagePlusIcon, Loader2Icon, MicIcon, PlugIcon, SparklesIcon, Trash2Icon, UserRoundIcon, WandSparklesIcon, TvMinimalPlayIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { api, brandUrl, CHANNEL_FONTS, type BrandPictureKind, type Channel, type Job, type YouTubeStatus } from "../api.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Field } from "./shared.tsx";

type Props = {
  channel: Channel;
  jobs: Job[];
  onChanged: (channel?: Channel) => void;
};

const COLOR_KEYS = ["background", "panel", "text", "accent", "muted"] as const;

const readFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/** A button that opens the file picker and uploads every chosen picture as `kind`. */
function UploadButton({ channel, kind, multiple, onDone, children }: { channel: string; kind: BrandPictureKind; multiple?: boolean; onDone: (channel: Channel) => void; children: ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple={multiple}
        hidden
        onChange={async (event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length === 0) return;
          setBusy(true);
          try {
            let latest: Channel | undefined;
            for (const file of files) latest = await api.addBrandPicture(channel, kind, await readFile(file));
            if (latest) onDone(latest);
          } catch (failure) {
            toast.error(failure instanceof Error ? failure.message : String(failure));
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2Icon className="animate-spin" /> : <ImagePlusIcon />}
        {children}
      </Button>
    </>
  );
}

/** A picture from the brand folder with a remove button on hover. */
function Picture({ channel, file, className, onRemoved, checker }: { channel: string; file: string; className?: string; onRemoved: (channel: Channel) => void; checker?: boolean }) {
  return (
    <div className={cn("group relative overflow-hidden rounded-lg border", checker && "bg-[repeating-conic-gradient(#8881_0_25%,transparent_0_50%)] bg-[length:16px_16px]", className)}>
      <img src={brandUrl(channel, file)} alt="" className="size-full object-contain" />
      <Button
        variant="secondary"
        size="icon-xs"
        className="absolute top-1.5 right-1.5 opacity-0 transition-opacity group-hover:opacity-100"
        aria-label="Remove picture"
        onClick={async () => onRemoved(await api.removeBrandPicture(channel, file))}
      >
        <Trash2Icon />
      </Button>
    </div>
  );
}

export function ChannelSettings({ channel, jobs, onChanged }: Props) {
  const [draft, setDraft] = useState(channel);
  const [youtube, setYoutube] = useState<YouTubeStatus | null>(null);
  const [character, setCharacter] = useState("");
  const [started, setStarted] = useState<string[]>([]);
  const [recording, setRecording] = useState<File | null>(null);
  const [ownVoice, setOwnVoice] = useState(false);

  useEffect(() => setDraft(channel), [channel]);
  useEffect(() => {
    api.youtube().then(setYoutube).catch(() => {});
  }, [channel.id, jobs.length]);

  // Reload the channel whenever one of the jobs started here finishes.
  const mine = jobs.filter((job) => started.includes(job.id));
  const running = mine.filter((job) => job.status === "queued" || job.status === "running");
  const finished = mine.filter((job) => job.status === "done" || job.status === "failed").map((job) => job.id).join();
  useEffect(() => {
    if (!finished) return;
    for (const job of mine) if (job.status === "failed") toast.error(job.error ?? `${job.label} failed`);
    onChanged();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  const start = async (action: () => Promise<Job>) => {
    try {
      const job = await action();
      setStarted((ids) => [...ids, job.id]);
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : String(failure));
    }
  };
  const busy = (word: string) => running.some((job) => job.label.includes(word));

  const dirty = JSON.stringify(draft) !== JSON.stringify(channel);
  const save = async () => {
    try {
      onChanged(await api.saveChannel(channel.id, draft));
      toast.success("Channel saved");
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : String(failure));
    }
  };

  const brand = channel.brand ?? {};
  const connected = youtube?.channels[channel.id] ?? null;
  const fontName = Object.entries(CHANNEL_FONTS).find(([, stack]) => stack === draft.font)?.[0] ?? "Custom";

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto grid max-w-3xl gap-6 px-6 py-8">
        <div className="flex items-center gap-4">
          {brand.logo ? (
            <img src={brandUrl(channel.id, brand.logo)} alt="" className="size-14 rounded-full border object-cover" />
          ) : (
            <div className="flex size-14 items-center justify-center rounded-full text-xl font-bold text-white" style={{ background: channel.colors.accent }}>
              {channel.name.slice(0, 1)}
            </div>
          )}
          <div className="grid gap-0.5">
            <h1 className="text-2xl font-semibold tracking-tight">{channel.name}</h1>
            <p className="text-sm text-muted-foreground">
              {brand.handle ?? "No @handle yet"} · {channel.language === "ar" ? "Arabic" : "English"}
            </p>
          </div>
          <Button className="ml-auto" disabled={!dirty} onClick={save}>
            Save changes
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TvMinimalPlayIcon className="size-4" /> YouTube
            </CardTitle>
            <CardDescription>Connect the channel, then import its logo, banner and latest thumbnails. The studio reads them and sets the colors, picture style and tone to match.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            {connected ? (
              <Badge variant="secondary">Connected: {connected.title}</Badge>
            ) : (
              <Button variant="outline" size="sm" disabled={!youtube?.configured} onClick={() => start(() => api.connectYouTube(channel.id))}>
                <PlugIcon /> Connect YouTube
              </Button>
            )}
            <Button size="sm" disabled={!connected || busy("Import")} onClick={() => start(() => api.importChannel(channel.id))}>
              {busy("Import") ? <Loader2Icon className="animate-spin" /> : <TvMinimalPlayIcon />} Import my style from YouTube
            </Button>
            <Button variant="outline" size="sm" disabled={busy("style")} onClick={() => start(() => api.readStyle(channel.id))}>
              {busy("style") ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />} Read style from my pictures
            </Button>
            {brand.youtube && <span className="text-xs text-muted-foreground">Imported {new Date(brand.youtube.importedAt).toLocaleDateString()}</span>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Logo and banner</CardTitle>
            <CardDescription>The logo and @handle sit in a corner of every video.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex flex-wrap items-end gap-4">
              {brand.logo && <Picture channel={channel.id} file={brand.logo} className="size-24 rounded-full" onRemoved={onChanged} />}
              {brand.banner && <Picture channel={channel.id} file={brand.banner} className="h-24 flex-1" onRemoved={onChanged} />}
            </div>
            <div className="flex flex-wrap gap-2">
              <UploadButton channel={channel.id} kind="logo" onDone={onChanged}>
                Upload logo
              </UploadButton>
              <UploadButton channel={channel.id} kind="banner" onDone={onChanged}>
                Upload banner
              </UploadButton>
            </div>
            <Field label="@handle on videos">
              <Input
                value={draft.brand?.handle ?? ""}
                placeholder="@yourchannel"
                onChange={(event) => setDraft({ ...draft, brand: { ...draft.brand, handle: event.target.value } })}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRoundIcon className="size-4" /> Character
            </CardTitle>
            <CardDescription>
              Your channel's character, in three poses, replaces the drawn mascot. Upload your photo to turn yourself into a cartoon, or describe one. You can also upload
              your own transparent PNG poses.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {(brand.mascots?.length ?? 0) > 0 && (
              <div className="grid grid-cols-3 gap-3">
                {brand.mascots!.map((file) => (
                  <Picture key={file} channel={channel.id} file={file} className="aspect-[2/3]" checker onRemoved={onChanged} />
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              {brand.photo ? (
                <Picture channel={channel.id} file={brand.photo} className="size-20" onRemoved={onChanged} />
              ) : (
                <UploadButton channel={channel.id} kind="photo" onDone={onChanged}>
                  Upload my photo
                </UploadButton>
              )}
              <UploadButton channel={channel.id} kind="mascot" multiple onDone={onChanged}>
                Upload poses
              </UploadButton>
            </div>
            <Field label={brand.photo ? "Anything to add (outfit, colors, props)" : "Describe the character"}>
              <Textarea
                rows={2}
                value={character}
                placeholder={brand.photo ? "wearing an orange hoodie with headphones around the neck" : "a friendly robot with a blue cap and a laptop under its arm"}
                onChange={(event) => setCharacter(event.target.value)}
              />
            </Field>
            <div>
              <Button disabled={busy("character") || (!brand.photo && !character.trim())} onClick={() => start(() => api.makeCharacter(channel.id, character))}>
                {busy("character") ? <Loader2Icon className="animate-spin" /> : <WandSparklesIcon />}
                {brand.photo ? "Make my character from the photo" : "Make the character"}
              </Button>
              <p className="mt-1.5 text-xs text-muted-foreground">Three pictures, about a minute and $0.15. It replaces the current poses.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Style references</CardTitle>
            <CardDescription>Thumbnails or pictures that show your style. "Read style" learns colors and picture style from them.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {(brand.references?.length ?? 0) > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {brand.references!.map((file) => (
                  <Picture key={file} channel={channel.id} file={file} className="aspect-video" onRemoved={onChanged} />
                ))}
              </div>
            )}
            <div>
              <UploadButton channel={channel.id} kind="reference" multiple onDone={onChanged}>
                Add pictures
              </UploadButton>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Theme</CardTitle>
            <CardDescription>Colors and font every look uses, and the art direction for generated pictures.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-5 gap-3">
              {COLOR_KEYS.map((key) => (
                <Field key={key} label={key[0].toUpperCase() + key.slice(1)}>
                  <label className="flex items-center gap-2 rounded-md border px-2 py-1.5">
                    <input
                      type="color"
                      value={draft.colors[key]}
                      onChange={(event) => setDraft({ ...draft, colors: { ...draft.colors, [key]: event.target.value } })}
                      className="size-6 cursor-pointer rounded border-0 bg-transparent p-0"
                    />
                    <span className="font-mono text-[11px] text-muted-foreground">{draft.colors[key]}</span>
                  </label>
                </Field>
              ))}
            </div>
            <div
              className="flex items-center gap-3 rounded-lg p-4"
              style={{ background: draft.colors.background, color: draft.colors.text, fontFamily: draft.font }}
              dir={draft.language === "ar" ? "rtl" : "ltr"}
            >
              <div className="rounded-md px-3 py-2" style={{ background: draft.colors.panel }}>
                <div className="text-lg font-bold">{draft.language === "ar" ? "عنوان المشهد" : "Scene headline"}</div>
                <div className="text-sm" style={{ color: draft.colors.muted }}>
                  {draft.language === "ar" ? "نص ثانوي" : "Secondary text"}
                </div>
              </div>
              <div className="text-4xl font-black" style={{ color: draft.colors.accent }}>
                87%
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Language">
                <Select value={draft.language ?? "en"} onValueChange={(language) => setDraft({ ...draft, language: language as "en" | "ar" })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="ar">Arabic</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Font">
                <Select value={fontName} onValueChange={(name) => setDraft({ ...draft, font: CHANNEL_FONTS[name] ?? draft.font })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(CHANNEL_FONTS).map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                    {fontName === "Custom" && <SelectItem value="Custom">Custom</SelectItem>}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Explainer device">
                <Select value={draft.device ?? "phone"} onValueChange={(device) => setDraft({ ...draft, device: device as "phone" | "laptop" })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="phone">Phone</SelectItem>
                    <SelectItem value="laptop">Laptop</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Picture style">
              <Textarea rows={3} value={draft.imageStyle} onChange={(event) => setDraft({ ...draft, imageStyle: event.target.value })} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Voice and audience</CardTitle>
            <CardDescription>What the script writer aims for.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Channel name">
              <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </Field>
            <Field label="Audience">
              <Textarea rows={2} value={draft.audience} onChange={(event) => setDraft({ ...draft, audience: event.target.value })} />
            </Field>
            <Field label="Tone">
              <Textarea rows={2} value={draft.tone} onChange={(event) => setDraft({ ...draft, tone: event.target.value })} />
            </Field>
            <div className="grid gap-2 rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <MicIcon className="size-4" /> Use my voice
              </div>
              <p className="text-xs text-muted-foreground">
                Upload 1–3 minutes of you talking clearly in a quiet room, no music, in the channel's language. ElevenLabs makes a copy of your voice and every new video is
                narrated with it.
              </p>
              <input type="file" accept="audio/*,.m4a,.mp3,.wav" className="text-sm" onChange={(event) => setRecording(event.target.files?.[0] ?? null)} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={ownVoice} onChange={(event) => setOwnVoice(event.target.checked)} />
                This recording is my own voice
              </label>
              <div>
                <Button
                  size="sm"
                  disabled={!recording || !ownVoice || busy("voice")}
                  onClick={async () => recording && start(async () => api.cloneVoice(channel.id, await readFile(recording)))}
                >
                  {busy("voice") ? <Loader2Icon className="animate-spin" /> : <MicIcon />} Clone my voice
                </Button>
              </div>
            </div>
            <Field label="ElevenLabs voice id">
              <Input value={draft.voiceId} onChange={(event) => setDraft({ ...draft, voiceId: event.target.value })} className="font-mono" />
            </Field>
          </CardContent>
        </Card>

        {dirty && (
          <div className="sticky bottom-4 flex justify-end">
            <Button onClick={save} className="shadow-lg">
              Save changes
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
