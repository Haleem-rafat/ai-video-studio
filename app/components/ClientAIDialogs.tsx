import { useEffect, useRef, useState } from "react";
import { BotIcon, CopyIcon, DownloadIcon, FileUpIcon, LoaderCircleIcon, MessageSquareTextIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";

import { api, clientPromptUrl, type ChatPreview, type Job } from "../api.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { say, type Lang } from "./prompted-text.ts";

/** The prompt a client pastes into ChatGPT, Claude or Gemini: shown, copied or downloaded, with the four steps. */
export function PromptForClient({ clientId, lang }: { clientId: string; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const [promptLang, setPromptLang] = useState<Lang>(lang);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = (key: Parameters<typeof say>[1]) => say(lang, key);

  useEffect(() => {
    if (!open) return;
    setText(null);
    setError(null);
    api
      .clientPrompt(clientId, promptLang)
      .then((result) => setText(result.text))
      .catch((failure: Error) => setError(failure.message));
  }, [open, clientId, promptLang]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <BotIcon /> {t("clientPrompt")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl" dir={lang === "ar" ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle>{t("promptTitle")}</DialogTitle>
          <DialogDescription>{t("promptIntro")}</DialogDescription>
        </DialogHeader>
        <ol className="grid gap-1.5 text-sm">
          {(["step1", "step2", "step3", "step4"] as const).map((step, i) => (
            <li key={step} className="flex gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-medium text-primary-foreground">{i + 1}</span>
              {t(step)}
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("promptIn")}</span>
          {(["ar", "en"] as const).map((option) => (
            <Button key={option} size="sm" variant={promptLang === option ? "secondary" : "ghost"} className="h-7" onClick={() => setPromptLang(option)}>
              {option === "ar" ? "عربي" : "English"}
            </Button>
          ))}
        </div>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <pre dir="auto" className="max-h-72 overflow-auto rounded-lg bg-muted/50 p-3 font-mono text-xs whitespace-pre-wrap">
            {text ?? t("loading")}
          </pre>
        )}
        <DialogFooter>
          <Button variant="outline" asChild>
            <a href={clientPromptUrl(clientId, promptLang)} download>
              <DownloadIcon /> {t("download")}
            </a>
          </Button>
          <Button
            disabled={!text}
            onClick={() =>
              navigator.clipboard
                .writeText(text ?? "")
                .then(() => toast.success(t("copied")))
                .catch((failure: Error) => toast.error(failure.message))
            }
          >
            <CopyIcon /> {t("copy")}
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
export function ImportClientAI({ clientId, lang, jobs, onSaved }: { clientId: string; lang: Lang; jobs: Job[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ChatPreview | null>(null);
  const [redraft, setRedraft] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const t = (key: Parameters<typeof say>[1], vars?: Record<string, string | number>) => say(lang, key, vars);
  const job = jobId ? jobs.find((each) => each.id === jobId) : undefined;

  // The AI read finishes as a job: its result is the preview.
  useEffect(() => {
    if (!job || job.status === "queued" || job.status === "running") return;
    if (job.status === "done") setPreview(job.result as ChatPreview);
    else setError(job.error ?? "The AI couldn't read the text");
    setJobId(null);
  }, [job?.status]);

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
      <DialogContent className="sm:max-w-2xl" dir={lang === "ar" ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle>{preview ? (preview.items.length ? t("understood", { n: preview.items.length }) : t("nothingFound")) : t("chatTitle")}</DialogTitle>
          <DialogDescription>{preview ? (preview.method === "exact" ? t("exact") : t("byAi")) : t("chatHint")}</DialogDescription>
        </DialogHeader>

        {!preview && (
          <div className="grid gap-2">
            <Textarea dir="auto" rows={9} value={text} disabled={Boolean(jobId)} placeholder="===STUDIO-ANSWERS-START=== …" onChange={(event) => setText(event.target.value)} className="font-mono text-xs" />
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
            <div>
              <Button size="sm" variant="ghost" disabled={Boolean(jobId)} onClick={() => file.current?.click()}>
                <FileUpIcon /> {t("openFile")}
              </Button>
            </div>
            {jobId && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircleIcon className="size-4 animate-spin" /> {t("readingAi")}
              </p>
            )}
          </div>
        )}

        {preview && (
          <div className="grid max-h-[55vh] gap-2 overflow-auto">
            {preview.otherClient && (
              <p className="flex items-center gap-2 rounded-md bg-amber-500/10 p-2 text-sm text-amber-700 dark:text-amber-400">
                <TriangleAlertIcon className="size-4 shrink-0" /> {t("otherChat")}
              </p>
            )}
            {preview.items.map((item) => (
              <div key={item.id} className="grid gap-0.5 rounded-lg border p-2.5">
                <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {item.section[lang]} · <span className="font-medium text-foreground">{item.question[lang]}</span>
                  {!item.sure && (
                    <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">
                      {t("unsure")}
                    </Badge>
                  )}
                </span>
                <span dir="auto" className="text-sm whitespace-pre-wrap">
                  {item.text}
                </span>
                {item.note && (
                  <span dir="auto" className="text-xs text-muted-foreground italic">
                    {item.note}
                  </span>
                )}
              </div>
            ))}
            {preview.leftover && (
              <div className="grid gap-0.5 rounded-lg border border-dashed p-2.5">
                <span className="text-xs text-muted-foreground">{t("leftover")}</span>
                <span dir="auto" className="text-sm">
                  {preview.leftover}
                </span>
              </div>
            )}
            {preview.errors.length > 0 && (
              <div className="grid gap-0.5 rounded-md bg-muted/50 p-2.5 text-xs">
                <span className="font-medium">{t("problems")}</span>
                {preview.errors.slice(0, 8).map((problem, i) => (
                  <span key={i} dir="auto">
                    {problem.question ? `${problem.question}: ` : ""}
                    {problem.message}
                  </span>
                ))}
              </div>
            )}
            {preview.items.length > 0 && (
              <label className="flex items-center gap-2 pt-1 text-sm">
                <Switch checked={redraft} onCheckedChange={setRedraft} /> {t("redraft")}
              </label>
            )}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          {preview ? (
            <>
              <Button variant="outline" disabled={busy} onClick={reset}>
                {t("readAgain")}
              </Button>
              {preview.items.length > 0 && (
                <Button disabled={busy} onClick={save}>
                  {t("saveAnswers", { n: preview.items.length })}
                </Button>
              )}
            </>
          ) : (
            <Button disabled={busy || Boolean(jobId) || !text.trim()} onClick={read}>
              {busy || jobId ? t("reading") : t("read")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
