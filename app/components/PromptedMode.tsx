import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2Icon, ChevronLeftIcon, ChevronRightIcon, DownloadIcon, EyeIcon, FileJsonIcon, FileTextIcon, FileTypeIcon, LanguagesIcon, LoaderCircleIcon, SparklesIcon, UploadIcon } from "lucide-react";
import { toast } from "sonner";

import { api, profileExportUrl, type Job, type AnswerError, type ImportPreview, type ProfileView, type Purpose, type Value } from "../api.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ImportClientAI, PromptForClient } from "./ClientAIDialogs.tsx";
import { say, type Lang } from "./prompted-text.ts";

type Question = ProfileView["questions"][number];
type Props = { clientId: string; jobs: Job[]; onSaved?: () => void };

const PURPOSES: Purpose[] = ["ideas", "carousel", "reel", "review"];

const isEmpty = (value: Value | undefined) => value === undefined || (Array.isArray(value) ? value.length === 0 : !value.trim());
const shown = (q: Question, values: Record<string, Value>) => {
  if (!q.showIf) return true;
  const value = values[q.showIf.question];
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return q.showIf.anyOf.some((wanted) => list.includes(wanted));
};

/**
 * Prompted mode: a guided questionnaire about the client's business, in
 * English or Arabic, saved section by section, exported for the client to
 * fill in elsewhere and imported back. The answers feed every writer.
 */
export function PromptedMode({ clientId, jobs, onSaved }: Props) {
  const [view, setView] = useState<ProfileView | null>(null);
  const [failed, setFailed] = useState(false);
  const [values, setValues] = useState<Record<string, Value>>({});
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>(() => {
    try {
      return (localStorage.getItem("prompted-lang") as Lang) || "ar";
    } catch {
      return "ar";
    }
  });
  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState(false);
  /** An import in progress: checked first (nothing saved), then confirmed; `force` once the user accepts another client's file. */
  const [importing, setImporting] = useState<{ file: File; force?: boolean; preview?: ImportPreview; otherClient?: boolean; error?: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const top = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    setFailed(false);
    api
      .profile(clientId)
      .then((next) => {
        setView(next);
        setValues(next.values);
        setDirty(new Set());
        setConfirmed(new Set());
        setSavedAt(next.updatedAt ?? null);
      })
      .catch(() => setFailed(true));
  }, [clientId]);
  useEffect(load, [load]);
  useEffect(() => {
    try {
      localStorage.setItem("prompted-lang", lang);
    } catch {
      // Private windows: the language just isn't remembered.
    }
  }, [lang]);

  const rtl = lang === "ar";
  const t = (key: Parameters<typeof say>[1], vars?: Record<string, string | number>) => say(lang, key, vars);

  const sections = view?.sections ?? [];
  const section = sections[step];
  const questions = useMemo(() => (view && section ? view.questions.filter((q) => q.section === section.id && shown(q, values)) : []), [view, section, values]);
  const progress = useMemo(() => {
    if (!view) return { answered: 0, total: 0, required: 0, requiredAnswered: 0, bySection: {} as Record<string, { answered: number; total: number }> };
    const visible = view.questions.filter((q) => shown(q, values));
    const has = (q: Question) => !isEmpty(values[q.id]);
    const required = visible.filter((q) => q.required);
    return {
      answered: visible.filter(has).length,
      total: visible.length,
      required: required.length,
      requiredAnswered: required.filter(has).length,
      bySection: Object.fromEntries(sections.map((s) => [s.id, { answered: visible.filter((q) => q.section === s.id && has(q)).length, total: visible.filter((q) => q.section === s.id).length }])),
    };
  }, [view, values, sections]);

  const set = (id: string, value: Value, fromWebsite = false) => {
    setValues((current) => ({ ...current, [id]: value }));
    setDirty((current) => new Set(current).add(id));
    setConfirmed((current) => {
      const next = new Set(current);
      if (fromWebsite) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  /** Saves what changed; on failure the answers stay on screen. */
  const save = async (): Promise<boolean> => {
    if (!dirty.size) return true;
    setSaving(true);
    try {
      // A "your own words" box left blank is no answer, not a broken one.
      const tidy = (value: Value | undefined): Value => (Array.isArray(value) ? value.filter((item) => item.replace(/^other:/, "").trim()) : value?.startsWith("other:") && !value.slice(6).trim() ? "" : (value ?? ""));
      const changed = Object.fromEntries([...dirty].map((id) => [id, tidy(values[id])]));
      const next = await api.saveProfile(clientId, changed, [...confirmed].filter((id) => dirty.has(id)));
      setView(next);
      setDirty(new Set());
      setConfirmed(new Set());
      setSavedAt(next.updatedAt ?? new Date().toISOString());
      if (next.errors.length) toast.warning(next.errors.map((e) => e.message).join(" · "));
      onSaved?.();
      return true;
    } catch {
      toast.error(t("saveFailed"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const go = async (to: number) => {
    if (!(await save())) return;
    setStep(Math.max(0, Math.min(sections.length - 1, to)));
    top.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const startImport = (file: File, force = false) => {
    setImporting({ file, force });
    api
      .importProfile<ImportPreview>(clientId, file, { dryRun: true, force })
      .then((result) => setImporting({ file, force, preview: result }))
      .catch((error: Error & { status?: number }) => setImporting(error.status === 409 ? { file, otherClient: true } : { file, error: error.message }));
  };
  const finishImport = () => {
    if (!importing) return;
    api
      .importProfile<ProfileView & { imported: number; errors: AnswerError[] }>(clientId, importing.file, { force: importing.force })
      .then((next) => {
        setView(next);
        setValues(next.values);
        setDirty(new Set());
        setSavedAt(next.updatedAt ?? null);
        setImporting(null);
        toast.success(t("importDone", { n: next.imported }));
        onSaved?.();
      })
      .catch((error: Error) => setImporting({ ...importing, error: error.message }));
  };

  if (failed)
    return (
      <div className="grid max-w-md gap-3 rounded-xl border p-5 text-sm">
        <p>{t("loadFailed")}</p>
        <div>
          <Button size="sm" variant="outline" onClick={load}>
            {t("retry")}
          </Button>
        </div>
      </div>
    );
  if (!view || !section)
    return (
      <p className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
        <LoaderCircleIcon className="size-4 animate-spin" /> {t("loading")}
      </p>
    );

  const sourceNote = (id: string) => {
    if (dirty.has(id)) return null;
    const source = view.sources[id];
    return source === "website" ? t("sourceWebsite") : source === "docx" ? t("sourceDocx") : source === "json" ? t("sourceJson") : source === "chat" ? t("sourceChat") : null;
  };

  return (
    <div ref={top} dir={rtl ? "rtl" : "ltr"} className="grid scroll-mt-4 gap-4">
      {/* Header: title, progress, language, export, import, preview */}
      <div className="grid gap-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="grid min-w-0 flex-1 gap-1">
            <h2 className="flex items-center gap-2 font-semibold">
              <SparklesIcon className="size-4 text-primary" /> {t("title")}
            </h2>
            <p className="max-w-3xl text-sm text-muted-foreground">{t("intro")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border p-0.5" role="group" aria-label="Language">
              <LanguagesIcon className="mx-1.5 size-4 self-center text-muted-foreground" />
              {(["en", "ar"] as const).map((option) => (
                <Button key={option} size="sm" variant={lang === option ? "secondary" : "ghost"} className="h-7" onClick={() => setLang(option)}>
                  {option === "en" ? "English" : "عربي"}
                </Button>
              ))}
            </div>
            <DropdownMenu dir={rtl ? "rtl" : "ltr"}>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <DownloadIcon /> {t("export")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(["ar", "en"] as const).map((docLang, i) => (
                  <div key={docLang}>
                    {i > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuLabel>{t("exportIn", { lang: docLang === "ar" ? t("arabic") : t("english") })}</DropdownMenuLabel>
                    <DropdownMenuItem asChild>
                      <a href={profileExportUrl(clientId, "docx", docLang)} download>
                        <FileTextIcon /> {t("exportWord")}
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href={profileExportUrl(clientId, "pdf", docLang)} download>
                        <FileTypeIcon /> {t("exportPdf")}
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href={profileExportUrl(clientId, "json", docLang)} download>
                        <FileJsonIcon /> {t("exportJson")}
                      </a>
                    </DropdownMenuItem>
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <input
              ref={fileInput}
              type="file"
              accept=".docx,.json,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) startImport(file);
              }}
            />
            <Button size="sm" variant="outline" title={t("importHint")} onClick={() => fileInput.current?.click()}>
              <UploadIcon /> {t("import")}
            </Button>
            <PromptForClient clientId={clientId} lang={lang} />
            <ImportClientAI
              clientId={clientId}
              lang={lang}
              jobs={jobs}
              onSaved={() => {
                load();
                onSaved?.();
              }}
            />
            <Button size="sm" variant="outline" onClick={async () => (await save()) && setPreview(true)}>
              <EyeIcon /> {t("preview")}
            </Button>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Progress value={progress.total ? (progress.answered / progress.total) * 100 : 0} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{t("answered", { n: progress.answered, total: progress.total })}</span>
            <span>{progress.requiredAnswered === progress.required ? <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2Icon className="size-3.5" /> {t("complete")}</span> : t("important", { n: progress.requiredAnswered, total: progress.required })}</span>
            <span className="ms-auto">{saving ? t("saving") : dirty.size ? t("unsaved") : savedAt ? `${t("saved")} · ${new Date(savedAt).toLocaleString(lang === "ar" ? "ar-EG" : undefined)}` : ""}</span>
          </div>
        </div>
      </div>

      <div className="grid items-start gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
        {/* Steps: a list beside the form; a scrolling row on narrow screens */}
        <nav aria-label={t("sections")} className="flex gap-1.5 overflow-x-auto pb-1 md:sticky md:top-2 md:grid md:overflow-visible md:pb-0">
          {sections.map((s, i) => {
            const count = progress.bySection[s.id] ?? { answered: 0, total: 0 };
            const done = count.total > 0 && count.answered === count.total;
            return (
              <Button key={s.id} variant={i === step ? "secondary" : "ghost"} className="h-auto shrink-0 justify-start gap-2 py-2 text-start" aria-current={i === step ? "step" : undefined} onClick={() => void go(i)}>
                <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium tabular-nums", done && "border-emerald-500 bg-emerald-500 text-white")}>{done ? <CheckCircle2Icon className="size-3.5" /> : i + 1}</span>
                <span className="grid min-w-0">
                  <span className="truncate text-sm">{s.title[lang]}</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {count.answered}/{count.total}
                  </span>
                </span>
              </Button>
            );
          })}
        </nav>

        <div className="grid gap-4">
          <div className="grid gap-1">
            <h3 className="text-lg font-semibold">{section.title[lang]}</h3>
            <p className="text-sm text-muted-foreground">{section.intro[lang]}</p>
          </div>

          {questions.map((q) => (
            <QuestionCard key={q.id} q={q} lang={lang} value={values[q.id]} known={view.known[q.id]} note={sourceNote(q.id)} onChange={(value, fromWebsite) => set(q.id, value, fromWebsite)} />
          ))}

          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Button variant="outline" disabled={step === 0 || saving} onClick={() => void go(step - 1)}>
              {rtl ? <ChevronRightIcon /> : <ChevronLeftIcon />} {t("back")}
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums">
              {step + 1} / {sections.length}
            </span>
            <span className="ms-auto flex gap-2">
              {step < sections.length - 1 ? (
                <Button disabled={saving} onClick={() => void go(step + 1)}>
                  {t("next")} {rtl ? <ChevronLeftIcon /> : <ChevronRightIcon />}
                </Button>
              ) : (
                <Button disabled={saving || !dirty.size} onClick={() => void save().then((ok) => ok && toast.success(t("saved")))}>
                  {t("finish")}
                </Button>
              )}
            </span>
          </div>
        </div>
      </div>

      <ContextPreview open={preview} onOpenChange={setPreview} clientId={clientId} lang={lang} />

      <Dialog open={Boolean(importing)} onOpenChange={(open) => !open && setImporting(null)}>
        <DialogContent dir={rtl ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle>{importing?.preview ? (importing.preview.count ? t("importTitle", { n: importing.preview.count }) : t("importNone")) : t("import")}</DialogTitle>
            <DialogDescription>{importing?.file.name}</DialogDescription>
          </DialogHeader>
          {!importing?.preview && !importing?.otherClient && !importing?.error && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircleIcon className="size-4 animate-spin" /> {t("loading")}
            </p>
          )}
          {importing?.otherClient && <p className="text-sm">{t("importOther")}</p>}
          {importing?.error && <p className="text-sm text-destructive">{importing.error}</p>}
          {importing?.preview && importing.preview.count > 0 && <p className="text-sm text-muted-foreground">{t("importBody")}</p>}
          {importing?.preview?.errors.length ? (
            <div className="grid gap-1 rounded-md bg-muted/50 p-3 text-xs">
              <span className="font-medium">{t("problems")}</span>
              {importing.preview.errors.slice(0, 8).map((error, i) => (
                <span key={i} dir="auto">
                  {error.question ? `${error.question}: ` : ""}
                  {error.message}
                </span>
              ))}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setImporting(null)}>
              {t("cancel")}
            </Button>
            {importing?.otherClient && <Button onClick={() => startImport(importing.file, true)}>{t("importAnyway")}</Button>}
            {importing?.preview && importing.preview.count > 0 && <Button onClick={finishImport}>{t("importDo")}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** One question: its label, help, example, what the website says, and the field to answer in. */
function QuestionCard({ q, lang, value, known, note, onChange }: { q: Question; lang: Lang; value: Value | undefined; known?: string; note: string | null; onChange: (value: Value, fromWebsite?: boolean) => void }) {
  const t = (key: Parameters<typeof say>[1]) => say(lang, key);
  const list = Array.isArray(value) ? value : value ? [value] : [];
  const own = list.find((item) => item.startsWith("other:"))?.slice(6) ?? "";
  const picked = list.filter((item) => !item.startsWith("other:"));
  const id = `q-${q.id.replace(/\W/g, "-")}`;

  const setChoice = (ids: string[], words: string) => {
    const next = [...ids, ...(words ? [`other:${words}`] : [])];
    onChange(q.kind === "single" ? (next[0] ?? "") : next);
  };
  const useKnown = () => {
    if (!known) return;
    if (q.kind === "short" || q.kind === "long") onChange(known, true);
    else if (q.options!.some((option) => option.id === known)) onChange(q.kind === "single" ? known : [known], true);
  };

  return (
    <div className="grid gap-2 rounded-xl border p-4">
      <label htmlFor={id} className="flex flex-wrap items-center gap-2 font-medium">
        {q.label[lang]}
        {q.required && (
          <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">
            {t("required")}
          </Badge>
        )}
        {note && <span className="text-xs font-normal text-muted-foreground">· {note}</span>}
      </label>
      {q.help && <p className="text-sm text-muted-foreground">{q.help[lang]}</p>}

      {known && isEmpty(value) && (
        <div className="flex flex-wrap items-start gap-2 rounded-lg bg-muted/50 p-2.5 text-sm">
          <div className="grid min-w-0 flex-1 gap-0.5">
            <span className="text-xs text-muted-foreground">{t("fromWebsite")}</span>
            <span dir="auto" className="whitespace-pre-wrap">
              {q.options?.find((option) => option.id === known)?.label[lang] ?? known}
            </span>
          </div>
          <Button size="sm" variant="outline" onClick={useKnown}>
            {t("useThis")}
          </Button>
        </div>
      )}

      {q.kind === "short" && <Input id={id} dir="auto" value={(value as string) ?? ""} onChange={(event) => onChange(event.target.value)} />}
      {q.kind === "long" && <Textarea id={id} dir="auto" rows={3} value={(value as string) ?? ""} onChange={(event) => onChange(event.target.value)} />}
      {(q.kind === "single" || q.kind === "multi") && (
        <div className="grid gap-2">
          <div id={id} role={q.kind === "single" ? "radiogroup" : "group"} aria-label={q.label[lang]} className="flex flex-wrap gap-1.5">
            {q.options!.map((option) => {
              const on = picked.includes(option.id);
              return (
                <Button
                  key={option.id}
                  type="button"
                  size="sm"
                  variant={on ? "default" : "outline"}
                  role={q.kind === "single" ? "radio" : "checkbox"}
                  aria-checked={on}
                  onClick={() => setChoice(q.kind === "single" ? (on ? [] : [option.id]) : on ? picked.filter((item) => item !== option.id) : [...picked, option.id], q.kind === "single" ? "" : own)}
                >
                  {option.label[lang]}
                </Button>
              );
            })}
          </div>
          {q.other && <Input dir="auto" placeholder={t("other")} value={own} onChange={(event) => setChoice(q.kind === "single" ? [] : picked, event.target.value)} className="max-w-md" />}
        </div>
      )}
      {q.example && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">{t("example")}</span> <span dir="auto">{q.example[lang]}</span>
        </p>
      )}
    </div>
  );
}

/** What each writer will be given, so the profile can be reviewed before any post is made. */
function ContextPreview({ open, onOpenChange, clientId, lang }: { open: boolean; onOpenChange: (open: boolean) => void; clientId: string; lang: Lang }) {
  const [texts, setTexts] = useState<Partial<Record<Purpose, string>>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setError(null);
    Promise.all(PURPOSES.map((purpose) => api.profileContext(clientId, purpose)))
      .then((all) => setTexts(Object.fromEntries(all.map((item) => [item.purpose, item.text]))))
      .catch((failure: Error) => setError(failure.message));
  }, [open, clientId]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl" dir={lang === "ar" ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle>{say(lang, "preview")}</DialogTitle>
          <DialogDescription>{say(lang, "previewIntro")}</DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <Tabs defaultValue="ideas">
            <TabsList>
              {PURPOSES.map((purpose) => (
                <TabsTrigger key={purpose} value={purpose}>
                  {say(lang, purpose)}
                </TabsTrigger>
              ))}
            </TabsList>
            {PURPOSES.map((purpose) => (
              <TabsContent key={purpose} value={purpose}>
                <pre dir="auto" className="max-h-[60vh] overflow-auto rounded-lg bg-muted/50 p-3 font-mono text-xs whitespace-pre-wrap">
                  {texts[purpose] === undefined ? say(lang, "loading") : texts[purpose] || say(lang, "empty")}
                </pre>
              </TabsContent>
            ))}
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
