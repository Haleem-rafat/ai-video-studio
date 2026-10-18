import { CheckIcon, CircleIcon, Columns2Icon, GlobeIcon, Loader2Icon, MegaphoneIcon, MonitorIcon, RotateCcwIcon, SendIcon, SmartphoneIcon, SparklesIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { api, sessionUrl, type Creativity, type FormatId, type Job, type MarketingBrief, type Session } from "../api.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Field } from "./shared.tsx";
import { JobProgress } from "./JobProgress.tsx";
import { ModeClip } from "./NewVideo.tsx";

type Props = { sessionId: string | null; jobs: Job[]; onOpen: (id: string) => void };

/** A selectable card in a group; behaves as a radio button. */
function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-start gap-1 rounded-lg border bg-card p-3 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50",
        active && "border-foreground/80 bg-muted/40 ring-1 ring-foreground/80",
      )}
    >
      {active && <CheckIcon className="absolute top-2.5 right-2.5 size-3.5" />}
      {children}
    </button>
  );
}

/** The website, language, shape and the script to follow; then the website is read and the chat opens. */
function Start({ onOpen }: { onOpen: (id: string) => void }) {
  const [url, setUrl] = useState("");
  const [language, setLanguage] = useState<"ar" | "en">("ar");
  const [format, setFormat] = useState<FormatId | "both">("both");
  const [creativity, setCreativity] = useState<Creativity>("creative");
  const [script, setScript] = useState("");
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [showScript, setShowScript] = useState(false);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [recent, setRecent] = useState<Session[]>([]);

  useEffect(() => {
    api.marketingSessions().then(setRecent, () => {});
  }, []);

  // The default script follows the language until the user writes their own.
  useEffect(() => {
    const cached = defaults[language];
    if (cached !== undefined) {
      if (!script.trim() || Object.values(defaults).includes(script)) setScript(cached);
      return;
    }
    api.marketingScript(language).then(({ script: text }) => {
      setDefaults((all) => ({ ...all, [language]: text }));
      if (!script.trim() || Object.values(defaults).includes(script)) setScript(text);
    });
  }, [language, defaults]);

  const own = script.trim() && script !== defaults[language];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto grid max-w-3xl gap-6 px-6 py-8">
        <div className="grid items-center gap-4 sm:grid-cols-[1fr_260px]">
          <div className="grid gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Marketing video</h1>
            <p className="text-sm text-muted-foreground">
              Paste a website. The studio reads its brand (logo, colours, fonts, real screenshots, services), then asks you a few questions and makes a video for social media in that look.
            </p>
          </div>
          <ModeClip mode="marketing" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Website</CardTitle>
            <CardDescription>The service or product the video sells.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="relative">
              <GlobeIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder="https://example.com" value={url} onChange={(event) => setUrl(event.target.value)} dir="ltr" />
            </div>
            <div role="radiogroup" aria-label="Language" className="grid gap-2 sm:grid-cols-2">
              <Choice active={language === "ar"} onClick={() => setLanguage("ar")}>
                <span className="text-sm font-medium">العربية</span>
                <span className="text-xs text-muted-foreground">Egyptian Arabic voice, right-to-left text</span>
              </Choice>
              <Choice active={language === "en"} onClick={() => setLanguage("en")}>
                <span className="text-sm font-medium">English</span>
                <span className="text-xs text-muted-foreground">English voice and text</span>
              </Choice>
            </div>
            <div role="radiogroup" aria-label="Shape" className="grid gap-2 sm:grid-cols-3">
              <Choice active={format === "short"} onClick={() => setFormat("short")}>
                <SmartphoneIcon className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Vertical 9:16</span>
                <span className="text-xs text-muted-foreground">Reels, TikTok, Shorts, Stories</span>
              </Choice>
              <Choice active={format === "long"} onClick={() => setFormat("long")}>
                <MonitorIcon className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Horizontal 16:9</span>
                <span className="text-xs text-muted-foreground">YouTube, a website, LinkedIn, Facebook</span>
              </Choice>
              <Choice active={format === "both"} onClick={() => setFormat("both")}>
                <Columns2Icon className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Both</span>
                <span className="text-xs text-muted-foreground">A vertical and a horizontal video from the same answers</span>
              </Choice>
            </div>

            <div className="grid gap-2">
              <span className="text-sm font-medium">Creativity</span>
              <div role="radiogroup" aria-label="Creativity" className="grid gap-2 sm:grid-cols-3">
                <Choice active={creativity === "faithful"} onClick={() => setCreativity("faithful")}>
                  <span className="text-sm font-medium">Close to the site</span>
                  <span className="text-xs text-muted-foreground">Real screenshots of the website, its pages building on a laptop and a phone.</span>
                </Choice>
                <Choice active={creativity === "creative"} onClick={() => setCreativity("creative")}>
                  <span className="text-sm font-medium">Creative</span>
                  <span className="text-xs text-muted-foreground">Original motion graphics in the brand's colours; the real site in one scene at most.</span>
                </Choice>
                <Choice active={creativity === "bold"} onClick={() => setCreativity("bold")}>
                  <span className="text-sm font-medium">Bold</span>
                  <span className="text-xs text-muted-foreground">Full freedom: kinetic type and visual ideas only, never a screenshot. Brand colours only.</span>
                </Choice>
              </div>
            </div>

            <div className="grid gap-2 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="grid">
                  <span className="text-sm font-medium">Script to follow</span>
                  <span className="text-xs text-muted-foreground">{own ? "Your own script" : "The default: the customer's journey, the turning point, the real page, booking, data, one call to action"}</span>
                </div>
                <div className="flex gap-1.5">
                  {own && (
                    <Button variant="ghost" size="sm" onClick={() => setScript(defaults[language] ?? "")}>
                      <RotateCcwIcon /> Default
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setShowScript((shown) => !shown)}>
                    {showScript ? "Hide" : "Show / edit"}
                  </Button>
                </div>
              </div>
              {showScript && <Textarea rows={14} value={script} onChange={(event) => setScript(event.target.value)} dir="auto" className="font-mono text-xs" />}
            </div>

            <div className="flex items-center justify-between gap-3 border-t pt-4">
              <p className="text-xs text-muted-foreground">Reading the website takes about a minute.</p>
              <Button
                disabled={!url.trim() || starting}
                onClick={async () => {
                  setError("");
                  setStarting(true);
                  try {
                    const { session } = await api.startMarketing({ url: url.trim(), language, format, creativity, script: own ? script : "" });
                    onOpen(session.id);
                  } catch (failure) {
                    setError(failure instanceof Error ? failure.message : String(failure));
                  } finally {
                    setStarting(false);
                  }
                }}
              >
                {starting ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />} Read the website
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>

        {recent.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Recent</CardTitle>
            </CardHeader>
            <CardContent className="divide-y p-0">
              {recent.slice(0, 8).map((session) => (
                <button key={session.id} type="button" onClick={() => onOpen(session.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/60">
                  {session.brand?.logo ? <img src={sessionUrl(session.id, session.brand.logo)} alt="" className="size-6 rounded object-contain" /> : <MegaphoneIcon className="size-4 text-muted-foreground" />}
                  <span className="min-w-0 flex-1 truncate text-sm">{session.brand?.name ?? session.url}</span>
                  <Badge variant="outline">{session.status === "done" ? "Video made" : session.status === "chat" ? (session.missing.length ? `${session.missing.length} to go` : "Ready") : session.status}</Badge>
                </button>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

const BRIEF_ROWS: { key: keyof MarketingBrief | "cta"; label: string; show: (brief: MarketingBrief) => string }[] = [
  { key: "business", label: "Business", show: (b) => b.business },
  { key: "audience", label: "Audience", show: (b) => b.audience },
  { key: "problems", label: "Problems", show: (b) => b.problems.join(" · ") },
  { key: "result", label: "Result to sell", show: (b) => b.result },
  { key: "features", label: "Features shown", show: (b) => b.features.join(" · ") },
  { key: "proof", label: "Proof (optional)", show: (b) => b.proof },
  { key: "data", label: "Dashboard numbers", show: (b) => (b.data === "real" ? "Real" : b.data === "example" ? "Examples, labelled" : "") },
  { key: "cta", label: "Call to action", show: (b) => (b.cta.label ? `${b.cta.label} → ${b.cta.url}` : "") },
  { key: "tone", label: "Tone", show: (b) => b.tone },
  { key: "voice", label: "Voice", show: (b) => b.voice },
  { key: "seconds", label: "Length", show: (b) => (b.seconds ? `${b.seconds} s` : "") },
  { key: "platforms", label: "Platforms", show: (b) => b.platforms.join(", ") },
  { key: "captions", label: "Subtitles", show: (b) => (b.captions === null ? "" : b.captions ? "On" : "Off") },
];

/** The chat with the producer, beside the brand it read and the brief it is filling. */
function Chat({ id, jobs }: { id: string; jobs: Job[] }) {
  const [session, setSession] = useState<Session | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const reading = jobs.find((job) => job.label.startsWith("Read website") && (job.status === "running" || job.status === "queued"));
  const writingJobs = jobs.filter((job) => job.label.startsWith("Write script") && job.label.includes("marketing") && (job.status === "running" || job.status === "queued"));
  const writing = writingJobs[0];

  useEffect(() => {
    let stopped = false;
    const load = () => api.marketingSession(id).then((next) => !stopped && setSession(next), (failure) => setError(String(failure)));
    load();
    // While the website is read or the script written, the session changes on the server.
    const timer = setInterval(() => {
      if (!stopped && (session?.status === "reading" || session?.status === "writing" || reading || writing)) load();
    }, 1500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [id, session?.status, Boolean(reading), Boolean(writing)]);

  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), [session?.messages.length, sending]);

  const send = async (message: string) => {
    if (!message.trim() || !session) return;
    setError("");
    setSending(true);
    setText("");
    setSession({ ...session, messages: [...session.messages, { role: "user", text: message.trim() }] });
    try {
      setSession(await api.sendMarketing(id, message.trim()));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setSending(false);
    }
  };

  if (!session) return <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">{error || <Loader2Icon className="animate-spin" />}</div>;

  const brand = session.brand;
  const last = session.messages.at(-1);
  const options = !sending && last?.role === "assistant" ? (last.options ?? []) : [];
  const ready = session.status !== "reading" && session.missing.length === 0;
  const rtl = session.language === "ar";

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,38%)]">
      <div className="flex min-h-0 flex-col border-r">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="mx-auto grid max-w-2xl gap-3">
            {session.status === "reading" &&
              (reading ? (
                <JobProgress job={reading} />
              ) : (
                <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                  <Loader2Icon className="size-4 animate-spin text-primary" /> Reading {session.url.replace(/^https?:\/\//, "")}
                </div>
              ))}
            {session.status === "failed" && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">Couldn't read the website: {session.error}</div>}
            {session.messages.map((message, index) => (
              <div key={index} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  dir="auto"
                  className={cn("max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed", message.role === "user" ? "bg-primary text-primary-foreground" : "border bg-card")}
                >
                  {message.text}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex">
                <div className="flex items-center gap-1.5 rounded-2xl border bg-card px-3.5 py-2.5 text-sm text-muted-foreground">
                  <Loader2Icon className="size-3.5 animate-spin" /> {rtl ? "بيكتب…" : "Typing…"}
                </div>
              </div>
            )}
            <div ref={bottom} />
          </div>
        </div>
        <div className="border-t p-3">
          <div className="mx-auto grid max-w-2xl gap-2">
            {options.length > 0 && (
              <div className="flex flex-wrap gap-1.5" dir={rtl ? "rtl" : "ltr"}>
                {options.map((option) => (
                  <Button key={option} variant="outline" size="sm" className="h-auto rounded-full py-1 whitespace-normal" onClick={() => send(option)}>
                    {option}
                  </Button>
                ))}
              </div>
            )}
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                send(text);
              }}
            >
              <Textarea
                rows={1}
                dir="auto"
                className="min-h-9 resize-none"
                placeholder={session.status === "reading" ? "Wait for the website…" : rtl ? "اكتب ردك…" : "Write your answer…"}
                value={text}
                disabled={session.status === "reading" || sending}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    send(text);
                  }
                }}
              />
              <Button type="submit" size="icon" disabled={!text.trim() || sending || session.status === "reading"} aria-label="Send">
                <SendIcon />
              </Button>
            </form>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        </div>
      </div>

      <div className="min-h-0 overflow-y-auto">
        <div className="grid gap-4 p-4">
          {brand ? (
            <div className="grid gap-3 rounded-xl border p-3">
              <div className="flex items-center gap-3">
                {brand.logo && <img src={sessionUrl(id, brand.logo)} alt="" className="size-10 rounded-lg border object-contain" style={{ background: brand.colors.background }} />}
                <div className="grid min-w-0">
                  <span className="truncate text-sm font-semibold">{brand.name}</span>
                  <span className="truncate text-xs text-muted-foreground" dir="auto">
                    {brand.summary}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(brand.colors).map(([key, color]) => (
                  <label key={key} title={key} className="flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    <input
                      type="color"
                      value={color}
                      className="size-4 cursor-pointer rounded border-0 bg-transparent p-0"
                      onChange={async (event) => setSession(await api.editMarketing(id, { colors: { [key]: event.target.value } }))}
                    />
                    {key}
                  </label>
                ))}
                <span className="rounded-md border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {brand.fonts.heading} / {brand.fonts.body}
                </span>
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {brand.shots
                  .filter((shot) => !shot.id.startsWith("page-"))
                  .map((shot) => (
                    <a key={shot.id} href={sessionUrl(id, shot.path)} target="_blank" rel="noreferrer" title={shot.label} className="shrink-0">
                      <img src={sessionUrl(id, shot.path)} alt={shot.label} className={cn("h-24 rounded-md border object-cover object-top", shot.device === "phone" ? "w-12" : "w-36")} />
                    </a>
                  ))}
              </div>
            </div>
          ) : (
            <div className="h-40 animate-pulse rounded-xl border bg-muted/40" />
          )}

          <div className="grid gap-1 rounded-xl border p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-semibold">Brief</span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {BRIEF_ROWS.length - session.missing.length - 1}/{BRIEF_ROWS.length - 1}
              </span>
            </div>
            {BRIEF_ROWS.map((row) => {
              const value = row.show(session.brief);
              const missing = session.missing.includes(row.key);
              return (
                <div key={row.key} className="flex items-start gap-2 py-0.5 text-xs">
                  {missing ? <CircleIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/50" /> : <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />}
                  <span className="w-28 shrink-0 text-muted-foreground">{row.label}</span>
                  <span className="min-w-0 flex-1 break-words" dir="auto">
                    {value || "—"}
                  </span>
                </div>
              );
            })}
          </div>

          <Field label={ready ? "Everything's ready" : "The chat fills the brief; answer its questions"}>
            <Button
              size="lg"
              disabled={!ready || Boolean(writing) || session.status === "writing"}
              onClick={async () => {
                setError("");
                try {
                  await api.createMarketing(id);
                } catch (failure) {
                  setError(failure instanceof Error ? failure.message : String(failure));
                }
              }}
            >
              {writing || session.status === "writing" ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
              {writing || session.status === "writing" ? "Writing the script…" : session.projectId ? "Write another version" : rtl ? "اعمل الفيديو" : "Create video"}
            </Button>
          </Field>
          {writingJobs.map((job) => (
            <JobProgress key={job.id} job={job} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function MarketingChat({ sessionId, jobs, onOpen }: Props) {
  return sessionId ? <Chat key={sessionId} id={sessionId} jobs={jobs} /> : <Start onOpen={onOpen} />;
}
