import { useEffect, useMemo, useRef, useState } from "react";
import {
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  ClipboardPasteIcon,
  CopyIcon,
  DownloadIcon,
  FileUpIcon,
  LoaderCircleIcon,
  MessageSquareTextIcon,
  SendIcon,
  SparklesIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { toast } from "sonner";

import { api, clientPromptUrl, type ChatPreview, type Job } from "../api.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { say, type Lang } from "./prompted-text.ts";

const STEPS = [
  { key: "step1", icon: CopyIcon },
  { key: "step2", icon: BotIcon },
  { key: "step3", icon: SendIcon },
  { key: "step4", icon: ClipboardPasteIcon },
] as const;

/** A two-way switch in the design system's look (English / عربي). */
function LangSwitch({
  value,
  onChange,
  label,
}: {
  value: Lang;
  onChange: (lang: Lang) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div
        className="flex rounded-lg bg-muted p-0.5"
        role="radiogroup"
        aria-label={label}
      >
        {(["ar", "en"] as const).map((option) => (
          <Button
            key={option}
            role="radio"
            aria-checked={value === option}
            size="sm"
            variant="ghost"
            className={cn(
              "h-7 px-3",
              value === option && "bg-background shadow-sm hover:bg-background",
            )}
            onClick={() => onChange(option)}
          >
            {option === "ar" ? "عربي" : "English"}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** The prompt a client pastes into ChatGPT, Claude or Gemini: the four steps, the prompt, copy and download. */
export function PromptForClient({
  clientId,
  lang,
}: {
  clientId: string;
  lang: Lang;
}) {
  const [open, setOpen] = useState(false);
  const [promptLang, setPromptLang] = useState<Lang>(lang);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showing, setShowing] = useState(false);
  const [copied, setCopied] = useState(false);
  const t = (key: Parameters<typeof say>[1]) => say(lang, key);

  useEffect(() => {
    if (!open) return;
    setText(null);
    setError(null);
    setCopied(false);
    api
      .clientPrompt(clientId, promptLang)
      .then((result) => setText(result.text))
      .catch((failure: Error) => setError(failure.message));
  }, [open, clientId, promptLang]);

  const copy = () =>
    navigator.clipboard
      .writeText(text ?? "")
      .then(() => {
        setCopied(true);
        toast.success(t("copied"));
        setTimeout(() => setCopied(false), 2500);
      })
      .catch((failure: Error) => toast.error(failure.message));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <BotIcon /> {t("clientPrompt")}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-2xl"
        dir={lang === "ar" ? "rtl" : "ltr"}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BotIcon className="size-4" />
            </span>
            {t("promptTitle")}
          </DialogTitle>
          <DialogDescription>{t("promptIntro")}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <section className="grid gap-2">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t("howItWorks")}
            </h3>
            <ol className="grid gap-2 sm:grid-cols-2">
              {STEPS.map(({ key, icon: Icon }, i) => (
                <li
                  key={key}
                  className="flex gap-3 rounded-lg border bg-muted/30 p-3"
                >
                  <span className="relative flex size-8 shrink-0 items-center justify-center rounded-lg bg-background text-primary ring-1 ring-border">
                    <Icon className="size-4" />
                    <span className="absolute -top-1.5 -end-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                      {i + 1}
                    </span>
                  </span>
                  <span className="text-sm leading-snug">{t(key)}</span>
                </li>
              ))}
            </ol>
            <p className="text-xs text-muted-foreground">{t("facts")}</p>
          </section>

          <section className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <LangSwitch
                value={promptLang}
                onChange={setPromptLang}
                label={t("promptIn")}
              />
              <Button
                size="sm"
                variant="ghost"
                aria-expanded={showing}
                onClick={() => setShowing(!showing)}
              >
                {showing ? t("hidePrompt") : t("showPrompt")}{" "}
                <ChevronDownIcon
                  className={cn(
                    "transition-transform",
                    showing && "rotate-180",
                  )}
                />
              </Button>
            </div>
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : (
              <div
                className={cn(
                  "relative overflow-hidden rounded-lg border bg-muted/30",
                  !showing && "max-h-32",
                )}
              >
                <pre
                  dir="auto"
                  className={cn(
                    "p-3 font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-muted-foreground",
                    showing && "max-h-80 overflow-auto",
                  )}
                >
                  {text ?? t("loading")}
                </pre>
                {!showing && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-popover to-transparent" />
                )}
              </div>
            )}
          </section>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" asChild>
            <a href={clientPromptUrl(clientId, promptLang)} download>
              <DownloadIcon /> {t("download")}
            </a>
          </Button>
          <Button disabled={!text} onClick={copy}>
            {copied ? <CheckIcon /> : <CopyIcon />}{" "}
            {copied ? t("copiedShort") : t("copy")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Pasting what the client's AI wrote back: read (the exact block at once, or
 * by AI as a job), explained answer by answer, then saved on confirmation.
 */
export function ImportClientAI({
  clientId,
  lang,
  jobs,
  onSaved,
}: {
  clientId: string;
  lang: Lang;
  jobs: Job[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ChatPreview | null>(null);
  const [redraft, setRedraft] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const t = (
    key: Parameters<typeof say>[1],
    vars?: Record<string, string | number>,
  ) => say(lang, key, vars);
  const job = jobId ? jobs.find((each) => each.id === jobId) : undefined;

  // The AI read finishes as a job: its result is the preview.
  useEffect(() => {
    if (!job || job.status === "queued" || job.status === "running") return;
    if (job.status === "done") setPreview(job.result as ChatPreview);
    else setError(job.error ?? "The AI couldn't read the text");
    setJobId(null);
  }, [job?.status]);

  /** The answers under their section headings, in questionnaire order. */
  const groups = useMemo(() => {
    const out: {
      section: ChatPreview["items"][number]["section"];
      items: ChatPreview["items"];
    }[] = [];
    for (const item of preview?.items ?? []) {
      const last = out.at(-1);
      if (last && last.section.en === item.section.en) last.items.push(item);
      else out.push({ section: item.section, items: [item] });
    }
    return out;
  }, [preview]);
  const unsure = preview?.items.filter((item) => !item.sure).length ?? 0;

  const reset = () => {
    setText("");
    setPreview(null);
    setJobId(null);
    setError(null);
    setRedraft(false);
  };
  const read = () => {
    setBusy(true);
    setError(null);
    api
      .readClientAnswers(clientId, text)
      .then((result) => {
        if (result.preview) setPreview(result.preview);
        else if (result.job) setJobId(result.job.id);
      })
      .catch((failure: Error) => setError(failure.message))
      .finally(() => setBusy(false));
  };
  const save = () => {
    if (!preview) return;
    setBusy(true);
    api
      .saveClientAnswers(clientId, preview.answers, redraft)
      .then(() => {
        toast.success(t("savedAnswers", { n: preview.items.length }));
        setOpen(false);
        reset();
        onSaved();
      })
      .catch((failure: Error) => setError(failure.message))
      .finally(() => setBusy(false));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next && !jobId) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <MessageSquareTextIcon /> {t("importChat")}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-2xl"
        dir={lang === "ar" ? "rtl" : "ltr"}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MessageSquareTextIcon className="size-4" />
            </span>
            {preview
              ? preview.items.length
                ? t("understood", { n: preview.items.length })
                : t("nothingFound")
              : t("chatTitle")}
          </DialogTitle>
          <DialogDescription>
            {preview
              ? preview.method === "exact"
                ? t("exact")
                : t("byAi")
              : t("chatHint")}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {!preview && !jobId && (
            <div className="grid gap-2">
              <Textarea
                dir="auto"
                rows={10}
                value={text}
                placeholder={t("pasteHere")}
                onChange={(event) => setText(event.target.value)}
                className="min-h-48 text-sm leading-relaxed"
                autoFocus
              />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={file}
                  type="file"
                  accept=".txt,.json,.md,text/plain"
                  className="hidden"
                  onChange={(event) => {
                    const picked = event.target.files?.[0];
                    event.target.value = "";
                    if (picked) void picked.text().then(setText);
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => file.current?.click()}
                >
                  <FileUpIcon /> {t("openFile")}
                </Button>
                {text && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {t("characters", { n: text.length.toLocaleString() })}
                  </span>
                )}
              </div>
              <p className="flex items-start gap-1.5 rounded-lg bg-muted/40 p-2.5 text-xs text-muted-foreground">
                <SparklesIcon className="mt-0.5 size-3.5 shrink-0" />{" "}
                {t("readCost")}
              </p>
            </div>
          )}

          {jobId && (
            <div className="grid place-items-center gap-3 py-10 text-center">
              <LoaderCircleIcon className="size-8 animate-spin text-primary" />
              <p className="max-w-sm text-sm text-muted-foreground">
                {t("readingAi")}
              </p>
            </div>
          )}

          {preview && (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge>{t("answersChip", { n: preview.items.length })}</Badge>
                {unsure > 0 && (
                  <Badge
                    variant="outline"
                    className="border-amber-500/50 text-amber-700 dark:text-amber-400"
                  >
                    {t("unsureChip", { n: unsure })}
                  </Badge>
                )}
                <Badge variant="outline">
                  {preview.method === "exact" ? t("exactChip") : t("aiChip")}
                </Badge>
              </div>

              {preview.otherClient && (
                <p className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-sm text-amber-700 dark:text-amber-400">
                  <TriangleAlertIcon className="size-4 shrink-0" />{" "}
                  {t("otherChat")}
                </p>
              )}

              {groups.map((group) => (
                <section key={group.section.en} className="grid gap-1.5">
                  <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {group.section[lang]}
                  </h3>
                  <div className="divide-y overflow-hidden rounded-lg border">
                    {group.items.map((item) => (
                      <div
                        key={item.id}
                        className={cn(
                          "grid gap-1 p-3",
                          !item.sure && "bg-amber-500/5",
                        )}
                      >
                        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          {item.sure ? (
                            <CheckIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <TriangleAlertIcon className="size-3.5 text-amber-600" />
                          )}
                          {item.question[lang]}
                          {!item.sure && (
                            <Badge
                              variant="outline"
                              className="h-4 border-amber-500/50 px-1.5 text-[10px] text-amber-700 dark:text-amber-400"
                            >
                              {t("unsure")}
                            </Badge>
                          )}
                        </span>
                        <span
                          dir="auto"
                          className="text-sm leading-relaxed whitespace-pre-wrap"
                        >
                          {item.text[lang]}
                        </span>
                        {item.note && (
                          <span
                            dir="auto"
                            className="text-xs text-muted-foreground italic"
                          >
                            {item.note}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ))}

              {preview.leftover && (
                <section className="grid gap-1 rounded-lg border border-dashed p-3">
                  <span className="text-xs text-muted-foreground">
                    {t("leftover")}
                  </span>
                  <span dir="auto" className="text-sm">
                    {preview.leftover}
                  </span>
                </section>
              )}

              {preview.errors.length > 0 && (
                <section className="grid gap-0.5 rounded-lg bg-muted/40 p-3 text-xs">
                  <span className="font-medium">{t("problems")}</span>
                  {preview.errors.slice(0, 8).map((problem, i) => (
                    <span key={i} dir="auto" className="text-muted-foreground">
                      {problem.question ? `${problem.question}: ` : ""}
                      {problem.message}
                    </span>
                  ))}
                </section>
              )}

              {preview.items.length > 0 && (
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                  <Switch
                    checked={redraft}
                    onCheckedChange={setRedraft}
                    className="mt-0.5"
                  />
                  <span className="grid gap-0.5">
                    <span className="text-sm font-medium">{t("redraft")}</span>
                    <span className="text-xs text-muted-foreground">
                      {t("redraftHelp")}
                    </span>
                  </span>
                </label>
              )}
            </>
          )}

          {error && (
            <p className="rounded-lg bg-destructive/10 p-2.5 text-sm text-destructive">
              {error}
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          {preview ? (
            <>
              <Button variant="outline" disabled={busy} onClick={reset}>
                {t("readAgain")}
              </Button>
              {preview.items.length > 0 && (
                <Button disabled={busy} onClick={save}>
                  {busy ? (
                    <LoaderCircleIcon className="animate-spin" />
                  ) : (
                    <CheckIcon />
                  )}{" "}
                  {t("saveAnswers", { n: preview.items.length })}
                </Button>
              )}
            </>
          ) : (
            <Button
              disabled={busy || Boolean(jobId) || !text.trim()}
              onClick={read}
            >
              {busy || jobId ? (
                <LoaderCircleIcon className="animate-spin" />
              ) : (
                <SparklesIcon />
              )}{" "}
              {busy || jobId ? t("reading") : t("read")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
