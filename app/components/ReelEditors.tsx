import { useRef, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, CheckCircle2Icon, ClapperboardIcon, CopyIcon, ImagePlusIcon, Loader2Icon, MicIcon, PlusIcon, SparklesIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { insertLine, moveLine, removeLine } from "../../src/reels/lines.ts";
import { api, reelFileUrl, type Channel, type CounterIcon, type Expression, type KineticKind, type KineticReel, type PhoneModel, type StoryKind, type StoryReel, type NewsReel, type Pose, type ProofReel, type ReelOptions, type ReelState, type RpgReel } from "../api.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { PlayButton } from "./PlayButton.tsx";
import { Field } from "./shared.tsx";

type Edit = (next: Partial<ReelState>) => void;

const EXPRESSIONS: Expression[] = ["talk", "smile", "wink"];
const POSES: Pose[] = ["point", "think", "wave"];
const KINDS: { id: KineticKind; label: string }[] = [
  { id: "hook", label: "Hook (big words)" },
  { id: "text", label: "Words only" },
  { id: "chat", label: "AI chat window" },
  { id: "dm", label: "DM screen" },
  { id: "browser", label: "Browser + picture" },
  { id: "phone", label: "Phone + picture" },
  { id: "counter", label: "Rolling number" },
  { id: "grid", label: "Grid of labels" },
  { id: "cta", label: "Closing ask (CTA)" },
];
const ICONS: CounterIcon[] = ["eye", "star", "clock", "dollar", "users", "download", "bolt"];

/** Moves item `from` of a list to `to`. */
const moved = <T,>(list: T[], from: number, to: number) => {
  const next = [...list];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
};

/** One row per spoken line: its text, its take to listen to, and the style's per-line choices. */
/** `saved` is the reel as stored: a line's take only plays while the draft still has that line there. */
export function LinesEditor({ draft, saved, edit }: { draft: ReelState; saved: ReelState; edit: Edit }) {
  const apply = (next: ReelState) => edit({ lines: next.lines, rpg: next.rpg, news: next.news, proof: next.proof, kinetic: next.kinetic, story: next.story });
  const setLine = (index: number, text: string) => edit({ lines: draft.lines.map((line, i) => (i === index ? text : line)) });
  const words = draft.lines.join(" ").split(/\s+/).filter(Boolean).length;
  const target = draft.shape === "wide" ? "8–15 minutes" : draft.style === "proof" || draft.style === "kinetic" ? "30–45s" : "60s or more";

  return (
    <div className="grid gap-2">
      <p className="text-xs text-muted-foreground">
        Egyptian Arabic, numbers as digits ($1,999, 24 ساعة), product names in English. {words} words ≈ {Math.round(words / 2.3)}s spoken: aim for {target}.
      </p>
      {draft.lines.map((line, index) => (
        <div key={index} className="grid gap-1.5 rounded-lg border p-2">
          <div className="flex items-start gap-2">
            <span className="mt-2 w-5 shrink-0 text-right font-mono text-xs text-muted-foreground">{index + 1}</span>
            <Textarea dir="rtl" rows={2} value={line} onChange={(event) => setLine(index, event.target.value)} className={cn("min-h-0 flex-1", !line.trim() && "border-destructive")} />
            <div className="flex shrink-0 flex-col gap-0.5">
              <Button size="icon" variant="ghost" className="size-7" title="Move up" disabled={index === 0} onClick={() => apply(moveLine(draft, index, index - 1))}>
                <ArrowUpIcon />
              </Button>
              <Button size="icon" variant="ghost" className="size-7" title="Move down" disabled={index === draft.lines.length - 1} onClick={() => apply(moveLine(draft, index, index + 1))}>
                <ArrowDownIcon />
              </Button>
            </div>
            <div className="flex shrink-0 flex-col gap-0.5">
              <Button size="icon" variant="ghost" className="size-7" title="Insert a line after this one" onClick={() => apply(insertLine(draft, index))}>
                <PlusIcon />
              </Button>
              <Button size="icon" variant="ghost" className="size-7" title="Remove line" disabled={draft.lines.length <= 1} onClick={() => apply(removeLine(draft, index))}>
                <XIcon />
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 ps-7">
            {saved.takes?.[index] && saved.lines[index] === line ? <PlayButton src={reelFileUrl(saved.id, saved.takes[index]!)} label="Listen" /> : <span className="text-[11px] text-muted-foreground">Not voiced yet</span>}
            {draft.rpg && <RpgLine rpg={draft.rpg} index={index} onChange={(rpg) => edit({ rpg })} />}
            {draft.proof && <ProofLine proof={draft.proof} index={index} onChange={(proof) => edit({ proof })} />}
            {draft.kinetic && <KineticLine kinetic={draft.kinetic} index={index} onChange={(kinetic) => edit({ kinetic })} />}
            {draft.story && <StoryLine story={draft.story} index={index} onChange={(story) => edit({ story })} />}
          </div>
        </div>
      ))}
      <Button size="sm" variant="outline" className="w-fit" onClick={() => apply(insertLine(draft, draft.lines.length - 1))}>
        <PlusIcon /> Add line
      </Button>
    </div>
  );
}

function RpgLine({ rpg, index, onChange }: { rpg: RpgReel; index: number; onChange: (rpg: RpgReel) => void }) {
  const sub = rpg.subs.find((each) => each.line === index) ?? { line: index, expression: "talk" as Expression, key: "" };
  const set = (change: Partial<typeof sub>) => onChange({ ...rpg, subs: [...rpg.subs.filter((each) => each.line !== index), { ...sub, ...change }].sort((a, b) => a.line - b.line) });
  return (
    <>
      <div className="flex gap-1">
        {EXPRESSIONS.map((face) => (
          <Button key={face} size="sm" variant={sub.expression === face ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => set({ expression: face })}>
            {face}
          </Button>
        ))}
      </div>
      <Input dir="auto" value={sub.key} placeholder="Underlined word" onChange={(event) => set({ key: event.target.value })} className="h-7 w-40 text-xs" />
      <Select value={String(sub.questIndex ?? "none")} onValueChange={(value) => set({ questIndex: value === "none" ? undefined : Number(value) })}>
        <SelectTrigger size="sm" className="h-7 w-48 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Checks no quest</SelectItem>
          {rpg.quests.map((quest, q) => (
            <SelectItem key={q} value={String(q)}>Checks quest {q + 1}: {quest.text}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

function ProofLine({ proof, index, onChange }: { proof: ProofReel; index: number; onChange: (proof: ProofReel) => void }) {
  const sub = proof.subs.find((each) => each.line === index) ?? { line: index, pose: POSES[index % 3], keys: [] };
  const set = (change: Partial<typeof sub>) => onChange({ ...proof, subs: [...proof.subs.filter((each) => each.line !== index), { ...sub, ...change }].sort((a, b) => a.line - b.line) });
  return (
    <>
      <div className="flex gap-1">
        {POSES.map((pose) => (
          <Button key={pose} size="sm" variant={sub.pose === pose ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => set({ pose })}>
            {pose}
          </Button>
        ))}
      </div>
      <Input dir="auto" value={sub.keys.join(" ")} placeholder="Highlighted words" onChange={(event) => set({ keys: event.target.value.split(/\s+/).filter(Boolean) })} className="h-7 w-48 text-xs" />
    </>
  );
}

function KineticLine({ kinetic, index, onChange }: { kinetic: KineticReel; index: number; onChange: (kinetic: KineticReel) => void }) {
  const sub = kinetic.subs.find((each) => each.line === index) ?? { line: index, key: "" };
  return (
    <Input
      dir="auto"
      value={sub.key}
      placeholder="Word in the selection box"
      onChange={(event) => onChange({ ...kinetic, subs: [...kinetic.subs.filter((each) => each.line !== index), { line: index, key: event.target.value }].sort((a, b) => a.line - b.line) })}
      className="h-7 w-52 text-xs"
    />
  );
}

/** The reel's pictures: pick one for a scene, or add one. */
function MediaPicker({ reel, value, onPick, onMedia }: { reel: ReelState; value?: string; onPick: (file: string) => void; onMedia: (reel: ReelState) => void }) {
  const upload = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const pictures = reel.media.filter((file) => !file.endsWith(".svg") && !/avatar-/.test(file));
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
      {pictures.map((file) => (
        <button key={file} type="button" title={file} onClick={() => onPick(file)} className={cn("shrink-0 overflow-hidden rounded border-2", value === file ? "border-primary" : "border-transparent opacity-70 hover:opacity-100")}>
          {/\.(mp4|mov)$/i.test(file) ? <video src={`${reelFileUrl(reel.id, file)}#t=1`} muted preload="metadata" className="h-16 w-24 bg-black object-cover" /> : <img src={reelFileUrl(reel.id, file)} className="h-16 w-24 bg-black object-cover object-top" />}
        </button>
      ))}
      <input
        ref={upload}
        type="file"
        accept="image/jpeg,image/png,image/webp,video/mp4"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setUploading(true);
          api.addReelMedia(reel.id, file).then((next) => { onMedia(next); onPick(next.media.at(-1)!); }).catch((error: Error) => toast.error(error.message)).finally(() => setUploading(false));
        }}
      />
      <Button size="sm" variant="outline" className="h-16 shrink-0" disabled={uploading} onClick={() => upload.current?.click()} title="Add a real picture or clip">
        {uploading ? <Loader2Icon className="animate-spin" /> : <ImagePlusIcon />} Add
      </Button>
    </div>
  );
}

/** Scene header: its lines, and buttons to move, copy or remove it. */
function SceneBar<T extends { lines: [number, number] }>({ reel, scenes, index, label, onChange }: { reel: ReelState; scenes: T[]; index: number; label: string; onChange: (scenes: T[]) => void }) {
  const scene = scenes[index];
  const options = reel.lines.map((line, i) => ({ value: String(i), label: `${i + 1}. ${line.slice(0, 36)}${line.length > 36 ? "…" : ""}` }));
  const set = (lines: [number, number]) => onChange(scenes.map((each, i) => (i === index ? { ...each, lines } : each)));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xs text-muted-foreground">lines</span>
      {[0, 1].map((end) => (
        <Select key={end} value={String(scene.lines[end])} onValueChange={(value) => set(end === 0 ? [Number(value), Math.max(Number(value), scene.lines[1])] : [scene.lines[0], Number(value)])}>
          <SelectTrigger size="sm" className="h-7 w-44 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
      <div className="ms-auto flex gap-0.5">
        <Button size="icon" variant="ghost" className="size-7" title="Move scene up" disabled={index === 0} onClick={() => onChange(moved(scenes, index, index - 1))}>
          <ArrowUpIcon />
        </Button>
        <Button size="icon" variant="ghost" className="size-7" title="Move scene down" disabled={index === scenes.length - 1} onClick={() => onChange(moved(scenes, index, index + 1))}>
          <ArrowDownIcon />
        </Button>
        <Button size="icon" variant="ghost" className="size-7" title="Duplicate scene" onClick={() => onChange([...scenes.slice(0, index + 1), structuredClone(scene), ...scenes.slice(index + 1)])}>
          <CopyIcon />
        </Button>
        <Button size="icon" variant="ghost" className="size-7" title="Remove scene" disabled={scenes.length <= 1} onClick={() => onChange(scenes.filter((_, i) => i !== index))}>
          <XIcon />
        </Button>
      </div>
    </div>
  );
}

/** The next scene's lines: the line after the last scene's end. */
const nextLines = (reel: ReelState, scenes: { lines: [number, number] }[]): [number, number] => {
  const from = Math.min(reel.lines.length - 1, (scenes.at(-1)?.lines[1] ?? -1) + 1);
  return [from, from];
};

export function QuestsEditor({ rpg, onChange }: { rpg: RpgReel; onChange: (rpg: RpgReel) => void }) {
  const setQuest = (index: number, text: string) => onChange({ ...rpg, quests: rpg.quests.map((quest, i) => (i === index ? { ...quest, text: text.toUpperCase() } : quest)) });
  return (
    <div className="grid max-w-xl gap-4">
      <Field label="Quests" detail="short English, checked when their line ends (pick it on the Lines tab)">
        <div className="grid gap-2">
          {rpg.quests.map((quest, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="w-5 text-right font-mono text-xs text-muted-foreground">{index + 1}</span>
              <Input value={quest.text} maxLength={24} onChange={(event) => setQuest(index, event.target.value)} className="font-mono" />
              <Input type="number" value={quest.xp} min={10} max={500} step={10} onChange={(event) => onChange({ ...rpg, quests: rpg.quests.map((each, i) => (i === index ? { ...each, xp: Number(event.target.value) || 50 } : each)) })} className="w-20 font-mono" title="XP" />
              <Button
                size="icon"
                variant="ghost"
                className="size-8 shrink-0"
                title="Remove quest"
                disabled={rpg.quests.length <= 1}
                onClick={() => onChange({ ...rpg, quests: rpg.quests.filter((_, i) => i !== index), subs: rpg.subs.map((sub) => (sub.questIndex === index ? { ...sub, questIndex: undefined } : sub.questIndex !== undefined && sub.questIndex > index ? { ...sub, questIndex: sub.questIndex - 1 } : sub)) })}
              >
                <XIcon />
              </Button>
            </div>
          ))}
          {rpg.quests.length < 5 && (
            <Button size="sm" variant="outline" className="w-fit" onClick={() => onChange({ ...rpg, quests: [...rpg.quests, { text: "NEW QUEST", xp: 50 }] })}>
              <PlusIcon /> Add quest
            </Button>
          )}
        </div>
      </Field>
      <Field label="Character">
        <div className="flex flex-wrap items-center gap-2">
          {(["girl", "guy"] as const).map((preset) => (
            <Button key={preset} size="sm" variant={rpg.character.preset === preset ? "default" : "outline"} onClick={() => onChange({ ...rpg, character: { ...rpg.character, preset } })}>
              {preset === "girl" ? "Girl with glasses" : "Guy with glasses and beard"}
            </Button>
          ))}
          <Input value={rpg.character.name} placeholder="Name tag" onChange={(event) => onChange({ ...rpg, character: { ...rpg.character, name: event.target.value } })} className="h-8 w-48" />
        </div>
      </Field>
      <div className="flex flex-wrap gap-4">
        <ColorField label="Shirt" value={rpg.character.shirt} fallback={rpg.character.preset === "guy" ? "#2dd4bf" : "#7c5cff"} onChange={(shirt) => onChange({ ...rpg, character: { ...rpg.character, shirt } })} />
        <ColorField label="Hair" value={rpg.character.hairColor} fallback={rpg.character.preset === "guy" ? "#2b2220" : "#6b3e26"} onChange={(hairColor) => onChange({ ...rpg, character: { ...rpg.character, hairColor } })} />
        <Field label="Level at the start">
          <Input type="number" min={1} max={99} value={rpg.level} onChange={(event) => onChange({ ...rpg, level: Math.max(1, Math.min(99, Number(event.target.value) || 1)) })} className="h-8 w-20" />
        </Field>
      </div>
    </div>
  );
}

/** A colour with a swatch picker and its hex; empty uses `fallback`. */
function ColorField({ label, value, fallback, onChange }: { label: string; value?: string; fallback: string; onChange: (value: string | undefined) => void }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-1.5">
        <input type="color" value={value ?? fallback} onChange={(event) => onChange(event.target.value)} className="h-8 w-10 cursor-pointer rounded border bg-transparent" aria-label={label} />
        <Input value={value ?? ""} placeholder={fallback} onChange={(event) => onChange(/^#[0-9a-fA-F]{6}$/.test(event.target.value) ? event.target.value : event.target.value ? value : undefined)} className="h-8 w-24 font-mono text-xs" />
        {value && (
          <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => onChange(undefined)}>
            Reset
          </Button>
        )}
      </div>
    </Field>
  );
}

export function NewsEditor({ reel, news, onChange, onMedia }: { reel: ReelState; news: NewsReel; onChange: (news: NewsReel) => void; onMedia: (reel: ReelState) => void }) {
  const setScenes = (scenes: NewsReel["scenes"]) => onChange({ ...news, scenes });
  const setScene = (index: number, change: Partial<NewsReel["scenes"][number]>) => setScenes(news.scenes.map((scene, i) => (i === index ? { ...scene, ...change } : scene)));
  return (
    <div className="grid gap-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="Source line"><Input dir="auto" value={news.source} onChange={(event) => onChange({ ...news, source: event.target.value })} /></Field>
        <Field label="Date"><Input dir="auto" value={news.date} onChange={(event) => onChange({ ...news, date: event.target.value })} /></Field>
        <Field label="Picture credit"><Input dir="auto" value={news.credit} onChange={(event) => onChange({ ...news, credit: event.target.value })} /></Field>
      </div>
      {news.scenes.map((scene, index) => (
        <div key={index} className="grid gap-3 rounded-lg border p-3">
          <SceneBar reel={reel} scenes={news.scenes} index={index} label={`Scene ${index + 1}`} onChange={setScenes} />
          <MediaPicker reel={reel} value={scene.media} onPick={(media) => setScene(index, { media })} onMedia={onMedia} />
          <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
            <Field label="Headline"><Input dir="rtl" value={scene.headline} onChange={(event) => setScene(index, { headline: event.target.value })} /></Field>
            <Field label="Punchline (accent colour)"><Input dir="rtl" value={scene.highlight} onChange={(event) => setScene(index, { highlight: event.target.value })} /></Field>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {scene.stats.map((stat, s) => {
              const setStat = (change: Partial<typeof stat>) => setScene(index, { stats: scene.stats.map((each, i) => (i === s ? { ...each, ...change } : each)) });
              return (
                <div key={s} className="grid gap-1.5 rounded-md border bg-muted/30 p-2">
                  <Input dir="auto" value={stat.label} placeholder="Label" onChange={(event) => setStat({ label: event.target.value })} className="h-7 text-xs" />
                  <Input dir="auto" value={stat.value} placeholder="Value" onChange={(event) => setStat({ value: event.target.value })} className="h-8 font-semibold" />
                  <Input dir="auto" value={stat.sub} placeholder="Note" onChange={(event) => setStat({ sub: event.target.value })} className="h-7 text-xs" />
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Switch checked={stat.count !== false} onCheckedChange={(on) => setStat({ count: on ? undefined : false })} /> Count up
                    </label>
                    <Button size="icon" variant="ghost" className="size-6" title="Remove card" disabled={scene.stats.length <= 1} onClick={() => setScene(index, { stats: scene.stats.filter((_, i) => i !== s) })}>
                      <XIcon />
                    </Button>
                  </div>
                </div>
              );
            })}
            {scene.stats.length < 3 && (
              <Button size="sm" variant="outline" className="h-auto min-h-20" onClick={() => setScene(index, { stats: [...scene.stats, { label: "", value: "", sub: "" }] })}>
                <PlusIcon /> Card
              </Button>
            )}
          </div>
        </div>
      ))}
      {news.scenes.length < 8 && (
        <Button size="sm" variant="outline" className="w-fit" onClick={() => setScenes([...news.scenes, { lines: nextLines(reel, news.scenes), media: news.scenes.at(-1)?.media ?? "", headline: "", highlight: "", stats: [] }])}>
          <PlusIcon /> Add scene
        </Button>
      )}
    </div>
  );
}

export function ProofEditor({ reel, proof, onChange, onMedia }: { reel: ReelState; proof: ProofReel; onChange: (proof: ProofReel) => void; onMedia: (reel: ReelState) => void }) {
  const setScenes = (scenes: ProofReel["scenes"]) => onChange({ ...proof, scenes });
  const setScene = (index: number, change: Partial<ProofReel["scenes"][number]>) => setScenes(proof.scenes.map((scene, i) => (i === index ? { ...scene, ...change } : scene)));
  return (
    <div className="grid gap-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="Hook card title (English)"><Input value={proof.hook.title} onChange={(event) => onChange({ ...proof, hook: { ...proof.hook, title: event.target.value } })} /></Field>
        <Field label="On the blue bar"><Input value={proof.hook.highlight} onChange={(event) => onChange({ ...proof, hook: { ...proof.hook, highlight: event.target.value } })} /></Field>
        <Field label="Comment keyword (CTA)"><Input dir="auto" value={proof.keyword} onChange={(event) => onChange({ ...proof, keyword: event.target.value })} /></Field>
      </div>
      <Field label="Character" detail="from the channel page; poses are picked per line on the Lines tab">
        <div className="flex gap-2">
          {POSES.map((pose) => (
            <img key={pose} src={reelFileUrl(reel.id, proof.avatar[pose])} title={pose} className="h-24 rounded border bg-muted object-contain" />
          ))}
        </div>
      </Field>
      {proof.scenes.map((scene, index) => (
        <div key={index} className="grid gap-3 rounded-lg border p-3">
          <SceneBar reel={reel} scenes={proof.scenes} index={index} label={`Scene ${index + 1}`} onChange={setScenes} />
          <MediaPicker reel={reel} value={scene.media} onPick={(media) => setScene(index, { media })} onMedia={onMedia} />
          <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
            <Field label="Address in the browser bar"><Input value={scene.url} onChange={(event) => setScene(index, { url: event.target.value })} className="font-mono text-xs" /></Field>
            <Field label="Big number (real)"><Input value={scene.stat?.value ?? ""} placeholder="e.g. 16K" onChange={(event) => setScene(index, { stat: event.target.value ? { value: event.target.value, label: scene.stat?.label ?? "" } : undefined })} /></Field>
            <Field label="Its label"><Input value={scene.stat?.label ?? ""} placeholder="GitHub stars" disabled={!scene.stat} onChange={(event) => setScene(index, { stat: { value: scene.stat!.value, label: event.target.value } })} /></Field>
          </div>
        </div>
      ))}
      {proof.scenes.length < 8 && (
        <Button size="sm" variant="outline" className="w-fit" onClick={() => setScenes([...proof.scenes, { lines: nextLines(reel, proof.scenes), media: proof.scenes.at(-1)?.media ?? "", url: "" }])}>
          <PlusIcon /> Add scene
        </Button>
      )}
    </div>
  );
}

function StoryLine({ story, index, onChange }: { story: StoryReel; index: number; onChange: (story: StoryReel) => void }) {
  const sub = story.subs.find((each) => each.line === index) ?? { line: index, key: "" };
  return (
    <Input
      dir="auto"
      value={sub.key}
      placeholder="Key word"
      onChange={(event) => onChange({ ...story, subs: [...story.subs.filter((each) => each.line !== index), { line: index, key: event.target.value }].sort((a, b) => a.line - b.line) })}
      className="h-7 w-40 text-xs"
    />
  );
}

const PHONES: PhoneModel[] = ["original", "3g", "4", "5", "6", "7", "x", "11", "11pro", "12", "13", "14pro", "15", "16", "17", "air", "17pro", "18pro", "duo"];

const STORY_KINDS: { id: StoryKind; label: string }[] = [
  { id: "hook", label: "Hook (product picture)" },
  { id: "photo", label: "Press photo" },
  { id: "layers", label: "Exploded layers" },
  { id: "touch", label: "Finger touch (3D reel)" },
  { id: "phone", label: "3D iPhone + real photo (3D reel)" },
  { id: "timeline", label: "3D timeline of phones (3D reel)" },
  { id: "quote", label: "Press quote" },
  { id: "stamp", label: "Stamp word" },
  { id: "price", label: "Price" },
  { id: "bars", label: "Bar chart" },
  { id: "specs", label: "Spec pills" },
  { id: "choice", label: "Pick one (comments)" },
  { id: "follow", label: "Follow card (last)" },
  { id: "point", label: "Big number + tip (new looks)" },
  { id: "chat", label: "Chat bubbles (new looks)" },
];

/** Lists as one item per line in a textarea. */
const listOf = (text: string) => text.split("\n");

/** Diagram and editorial reels: the headline and each scene's picture idea. */
export function StoryEditor({ reel, story, onChange, onMedia }: { reel: ReelState; story: StoryReel; onChange: (story: StoryReel) => void; onMedia: (reel: ReelState) => void }) {
  type Scene = StoryReel["scenes"][number];
  const setScenes = (scenes: Scene[]) => onChange({ ...story, scenes });
  const setScene = (index: number, change: Partial<Scene>) => setScenes(story.scenes.map((scene, i) => (i === index ? { ...scene, ...change } : scene)));
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Headline"><Input dir="rtl" value={story.headline.text} onChange={(event) => onChange({ ...story, headline: { ...story.headline, text: event.target.value } })} className="w-96" /></Field>
        <Field label="Gold punch phrase"><Input dir="rtl" value={story.headline.highlight} onChange={(event) => onChange({ ...story, headline: { ...story.headline, highlight: event.target.value } })} className="w-56" /></Field>
      </div>
      {story.scenes.map((scene, index) => (
        <div key={index} className="grid gap-3 rounded-lg border p-3">
          <SceneBar reel={reel} scenes={story.scenes} index={index} label={`Scene ${index + 1}`} onChange={setScenes} />
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Shows">
              <Select value={scene.kind} onValueChange={(kind) => setScene(index, { kind: kind as StoryKind })}>
                <SelectTrigger size="sm" className="h-8 w-52 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STORY_KINDS.map((kind) => (
                    <SelectItem key={kind.id} value={kind.id}>{kind.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {scene.kind !== "follow" && <Field label="Caption"><Input dir="auto" value={scene.label ?? ""} placeholder="none" onChange={(event) => setScene(index, { label: event.target.value || undefined })} className="h-8 w-60" /></Field>}
            {scene.kind === "stamp" && <Field label="Stamp"><Input dir="auto" value={scene.stamp ?? ""} onChange={(event) => setScene(index, { stamp: event.target.value })} className="h-8 w-40" /></Field>}
            {scene.kind === "price" && (
              <>
                <Field label="Real price"><Input value={scene.price?.value ?? ""} placeholder="$2,899" onChange={(event) => setScene(index, { price: { label: "", ...scene.price, value: event.target.value } })} className="h-8 w-32" /></Field>
                <Field label="Label"><Input dir="auto" value={scene.price?.label ?? ""} onChange={(event) => setScene(index, { price: { value: "", ...scene.price, label: event.target.value } })} className="h-8 w-52" /></Field>
              </>
            )}
            {scene.kind === "bars" && <Field label="Sticker"><Input value={scene.delta ?? ""} placeholder="+$900" onChange={(event) => setScene(index, { delta: event.target.value || undefined })} className="h-8 w-28" /></Field>}
            {scene.kind === "choice" && (
              <>
                <Field label="Answer 1"><Input dir="auto" value={scene.choice?.[0] ?? ""} onChange={(event) => setScene(index, { choice: [event.target.value, scene.choice?.[1] ?? ""] })} className="h-8 w-36" /></Field>
                <Field label="Answer 2"><Input dir="auto" value={scene.choice?.[1] ?? ""} onChange={(event) => setScene(index, { choice: [scene.choice?.[0] ?? "", event.target.value] })} className="h-8 w-36" /></Field>
              </>
            )}
          </div>
          {reel.style === "3d" && (scene.kind === "hook" || scene.kind === "photo") && (
            <div className="flex gap-1">
              {(["laptop", "tablet"] as const).map((device) => (
                <Button key={device} size="sm" variant={(scene.device ?? "laptop") === device ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => setScene(index, { device })}>
                  3D {device}
                </Button>
              ))}
            </div>
          )}
          {(scene.kind === "hook" || scene.kind === "photo" || scene.kind === "phone") && <MediaPicker reel={reel} value={scene.media} onPick={(media) => setScene(index, { media })} onMedia={onMedia} />}
          {scene.kind === "phone" && (
            <div className="flex flex-wrap items-end gap-2">
              <Field label="3D model">
                <Select value={scene.phone ?? "17pro"} onValueChange={(phone) => setScene(index, { phone: phone as PhoneModel })}>
                  <SelectTrigger size="sm" className="h-8 w-36 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PHONES.map((phone) => (
                      <SelectItem key={phone} value={phone}>{phone}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Year"><Input value={scene.year ?? ""} onChange={(event) => setScene(index, { year: event.target.value })} className="h-8 w-20" /></Field>
              <Field label="Name"><Input value={scene.title ?? ""} onChange={(event) => setScene(index, { title: event.target.value })} className="h-8 w-44" /></Field>
              <Field label="Photo credit"><Input value={scene.credit ?? ""} onChange={(event) => setScene(index, { credit: event.target.value })} className="h-8 w-72 text-xs" /></Field>
            </div>
          )}
          {scene.kind === "timeline" && <Field label="Year lit on the timeline" detail="empty: the camera travels the whole row"><Input value={scene.year ?? ""} onChange={(event) => setScene(index, { year: event.target.value || undefined })} className="h-8 w-24" /></Field>}
          {scene.kind === "layers" && (
            <Field label="Layers" detail="one per line, top to bottom, 3–6">
              <Textarea dir="auto" rows={4} value={(scene.layers ?? []).join("\n")} onChange={(event) => setScene(index, { layers: listOf(event.target.value) })} />
            </Field>
          )}
          {scene.kind === "point" && (
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Big number or sign"><Input dir="auto" value={scene.point?.mark ?? ""} placeholder="٣" onChange={(event) => setScene(index, { point: { mark: event.target.value, text: scene.point?.text ?? "" } })} className="h-8 w-24" /></Field>
              <Field label="Tip"><Input dir="auto" value={scene.point?.text ?? ""} onChange={(event) => setScene(index, { point: { mark: scene.point?.mark ?? "", text: event.target.value } })} className="h-8 w-96" /></Field>
            </div>
          )}
          {scene.kind === "chat" && (
            <div className="grid gap-2">
              <Field label="Chat with"><Input dir="auto" value={scene.title ?? ""} placeholder="عميل جديد" onChange={(event) => setScene(index, { title: event.target.value || undefined })} className="h-8 w-52" /></Field>
              <Field label="Bubbles" detail="one per line, 2–4, the client first">
                <Textarea dir="auto" rows={4} value={(scene.messages ?? []).join("\n")} onChange={(event) => setScene(index, { messages: listOf(event.target.value) })} />
              </Field>
            </div>
          )}
          {scene.kind === "specs" && (
            <Field label="Spec pills" detail="one per line, 3–6, real numbers">
              <Textarea dir="auto" rows={4} value={(scene.specs ?? []).join("\n")} onChange={(event) => setScene(index, { specs: listOf(event.target.value) })} />
            </Field>
          )}
          {scene.kind === "quote" && (
            <div className="grid gap-2">
              <Field label="Source"><Input value={scene.quote?.source ?? ""} onChange={(event) => setScene(index, { quote: { text: "", highlight: "", ...scene.quote, source: event.target.value } })} className="h-8 w-60" /></Field>
              <Field label="Real quote"><Textarea dir="auto" rows={3} value={scene.quote?.text ?? ""} onChange={(event) => setScene(index, { quote: { source: "", highlight: "", ...scene.quote, text: event.target.value } })} /></Field>
              <Field label="Highlighted part" detail="copied exactly from the quote"><Input dir="auto" value={scene.quote?.highlight ?? ""} onChange={(event) => setScene(index, { quote: { source: "", text: "", ...scene.quote, highlight: event.target.value } })} /></Field>
            </div>
          )}
          {scene.kind === "bars" && (
            <Field label="Bars" detail="one per line: label | number | shown (e.g. MacBook Pro M5 | 1999 | $1,999); the last is the subject">
              <Textarea
                dir="auto"
                rows={3}
                value={(scene.bars ?? []).map((bar) => `${bar.label} | ${bar.value} | ${bar.shown}`).join("\n")}
                onChange={(event) => setScene(index, { bars: listOf(event.target.value).map((row) => { const [label = "", value = "0", shown = ""] = row.split("|").map((part) => part.trim()); return { label, value: Number(value.replace(/[^\d.]/g, "")) || 0, shown }; }) })}
              />
            </Field>
          )}
        </div>
      ))}
      {story.scenes.length < 12 && (
        <Button size="sm" variant="outline" className="w-fit" onClick={() => setScenes([...story.scenes, { lines: nextLines(reel, story.scenes), kind: "specs", specs: [] }])}>
          <PlusIcon /> Add scene
        </Button>
      )}
    </div>
  );
}

export function KineticEditor({ reel, kinetic, onChange, onMedia }: { reel: ReelState; kinetic: KineticReel; onChange: (kinetic: KineticReel) => void; onMedia: (reel: ReelState) => void }) {
  type Scene = KineticReel["scenes"][number];
  const setScenes = (scenes: Scene[]) => onChange({ ...kinetic, scenes });
  const setScene = (index: number, change: Partial<Scene>) => setScenes(kinetic.scenes.map((scene, i) => (i === index ? { ...scene, ...change } : scene)));
  return (
    <div className="grid gap-4">
      <Field label="Comment keyword (CTA scene)"><Input dir="auto" value={kinetic.keyword} onChange={(event) => onChange({ ...kinetic, keyword: event.target.value })} className="max-w-xs" /></Field>
      {kinetic.scenes.map((scene, index) => (
        <div key={index} className="grid gap-3 rounded-lg border p-3">
          <SceneBar reel={reel} scenes={kinetic.scenes} index={index} label={`Scene ${index + 1}`} onChange={setScenes} />
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Shows">
              <Select value={scene.kind} onValueChange={(kind) => setScene(index, { kind: kind as KineticKind })}>
                <SelectTrigger size="sm" className="h-8 w-52 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((kind) => (
                    <SelectItem key={kind.id} value={kind.id}>{kind.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {scene.kind !== "hook" && scene.kind !== "text" && scene.kind !== "counter" && scene.kind !== "grid" && (
              <Field label="Button the cursor clicks"><Input dir="auto" value={scene.button ?? ""} placeholder="none" onChange={(event) => setScene(index, { button: event.target.value || undefined })} className="h-8 w-44" /></Field>
            )}
            {(scene.kind === "chat" || scene.kind === "cta") && (
              <Field label={scene.kind === "chat" ? "Window title" : "Link card text"}><Input dir="auto" value={scene.title ?? ""} onChange={(event) => setScene(index, { title: event.target.value || undefined })} className="h-8 w-52" /></Field>
            )}
            {scene.kind === "browser" && <Field label="Address"><Input value={scene.url ?? ""} onChange={(event) => setScene(index, { url: event.target.value })} className="h-8 w-64 font-mono text-xs" /></Field>}
          </div>
          {(scene.kind === "browser" || scene.kind === "phone") && <MediaPicker reel={reel} value={scene.media} onPick={(media) => setScene(index, { media })} onMedia={onMedia} />}
          {(scene.kind === "chat" || scene.kind === "dm") && (
            <Field label="Bubbles" detail="one per line, alternating you → reply; from the facts, never a real person's words">
              <Textarea dir="rtl" rows={4} value={(scene.messages ?? []).join("\n")} onChange={(event) => setScene(index, { messages: event.target.value.split("\n") })} />
            </Field>
          )}
          {scene.kind === "grid" && (
            <Field label="Labels" detail="one per line, 3–6">
              <Textarea dir="auto" rows={4} value={(scene.items ?? []).join("\n")} onChange={(event) => setScene(index, { items: event.target.value.split("\n") })} />
            </Field>
          )}
          {scene.kind === "counter" && (
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Real number"><Input value={scene.counter?.value ?? ""} placeholder="16K" onChange={(event) => setScene(index, { counter: { label: "", icon: "star", ...scene.counter, value: event.target.value } })} className="h-8 w-32" /></Field>
              <Field label="Label"><Input dir="auto" value={scene.counter?.label ?? ""} onChange={(event) => setScene(index, { counter: { value: "", icon: "star", ...scene.counter, label: event.target.value } })} className="h-8 w-56" /></Field>
              <div className="flex gap-1">
                {ICONS.map((icon) => (
                  <Button key={icon} size="sm" variant={scene.counter?.icon === icon ? "default" : "outline"} className="h-8 px-2 text-xs" onClick={() => setScene(index, { counter: { value: "", label: "", ...scene.counter, icon } })}>
                    {icon}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
      {kinetic.scenes.length < 9 && (
        <Button size="sm" variant="outline" className="w-fit" onClick={() => setScenes([...kinetic.scenes, { lines: nextLines(reel, kinetic.scenes), kind: "text" }])}>
          <PlusIcon /> Add scene
        </Button>
      )}
    </div>
  );
}

/** Per-reel choices: accent colour, Figma blue, music and its volume, voice speed. */
export function OptionsEditor({ reel, options, accent, onChange }: { reel: ReelState; options: ReelOptions; accent: string; onChange: (options: ReelOptions) => void }) {
  const music = reel.style !== "rpg";
  const gain = options.musicGain ?? (reel.style === "proof" ? 0.4 : reel.style === "kinetic" ? 0.45 : 0.55);
  return (
    <div className="grid max-w-xl gap-4">
      {reel.style !== "rpg" && <ColorField label="Accent colour" value={options.accent} fallback={accent} onChange={(value) => onChange({ ...options, accent: value })} />}
      {(reel.style === "kinetic" || reel.style === "editorial") && (
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={Boolean(options.figmaBlue)} onCheckedChange={(on) => onChange({ ...options, figmaBlue: on || undefined })} /> Figma blue selection box (#3B82F6) instead of the accent
        </label>
      )}
      {music && (
        <div className="grid gap-2">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={options.music !== false} onCheckedChange={(on) => onChange({ ...options, music: on ? undefined : false })} /> Background beat
          </label>
          {options.music !== false && (
            <Field label="Beat volume" detail={`${Math.round(gain * 100)}%`}>
              <Slider min={0} max={1.5} step={0.05} value={[gain]} onValueChange={([value]) => onChange({ ...options, musicGain: value })} />
            </Field>
          )}
        </div>
      )}
      <Field label="Voice speed" detail={`${(options.speed ?? 1).toFixed(2)}× · changing it voices every line again (about $0.02)`}>
        <Slider min={0.8} max={1.3} step={0.05} value={[options.speed ?? 1]} onValueChange={([value]) => onChange({ ...options, speed: Math.abs(value - 1) < 0.001 ? undefined : value })} />
      </Field>
    </div>
  );
}

export const REEL_VOICES = [
  { id: "VxSsN5NGusWQZXue7VE9", name: "Hammam · همام (مصري طبيعي)", gender: "male", badge: "🇪🇬 مصري أصلي · الأفضل", hint: "صوت مصري طبيعي وهادئ ومقنع جداً للريلز والقصص (VxSsN5NGusWQZXue7VE9)" },
  { id: "Ojb0nFbyzZn95u0i5a5p", name: "Marco Nady · ماركو نادي (مصري)", gender: "male", badge: "🇪🇬 مصري · واثق وواضح", hint: "نبرة مصرية واضحة ومرتبة للشرح والتركات العملية (Ojb0nFbyzZn95u0i5a5p)" },
  { id: "68MRVrnQAt8vLbu0FCzw", name: "Mamdoh · ممدوح (مصري عميق)", gender: "male", badge: "🇪🇬 مصري · عميق وفخم", hint: "صوت مصري رخيم وعميق للبزنس والاستشارات (68MRVrnQAt8vLbu0FCzw)" },
  { id: "vghiSqG5ezdhd8F3tKAD", name: "Sara · سارة (مصرية طبيعية)", gender: "female", badge: "🇪🇬 نسائي مصري · واضح", hint: "صوت نسائي مصري هادئ وطبيعي وواضح الحروف (vghiSqG5ezdhd8F3tKAD)" },
  { id: "IES4nrmZdUBHByLBde0P", name: "ElevenLabs · IES4nrmZdUBHByLBde0P", gender: "male", badge: "عربي · عام/خليجي", hint: "المعرّف المخصص السابق (IES4nrmZdUBHByLBde0P)" },
  { id: "Charon", name: "Charon · شيرون", gender: "male", badge: "رجالي · فخم وواضح", hint: "صوت عميق وهادئ ومقنع جداً للبزنس والخدمات" },
  { id: "Orus", name: "Orus · أوروس", gender: "male", badge: "رجالي · ودود وحماسي", hint: "نبرة طبيعية قريبة كأنك بتحكي لصاحبك" },
  { id: "Fenrir", name: "Fenrir · فنرير", gender: "male", badge: "رجالي · قوي وحاسم", hint: "ممتاز للهوك السريع والتركات المباشرة" },
  { id: "Puck", name: "Puck · باك", gender: "male", badge: "رجالي · شبابي وسريع", hint: "إيقاع خفيف وسريع للفيديوهات التفاعلية" },
  { id: "Zephyr", name: "Zephyr · زيفير", gender: "female", badge: "نسائي · عامية واضحة", hint: "أنقى نطق عامي مصري دافئ وطبيعي" },
  { id: "Laomedeia", name: "Laomedeia · لاوميديا", gender: "female", badge: "نسائي · حيوي ومشرق", hint: "طاقة عالية ومبهجة تجذب الانتباه" },
  { id: "Sulafat", name: "Sulafat · سلافات", gender: "female", badge: "نسائي · هادئ ومريح", hint: "نبرة هادئة ومرتبة للشرح والخطوات" },
  { id: "Kore", name: "Kore · كوري", gender: "female", badge: "نسائي · احترافي وواثق", hint: "أسلوب استشاري رصين وواضح" },
] as const;

export function VoiceEditor({
  draft,
  saved,
  channel,
  running,
  edit,
  onInstantSwitch,
  onVoiceAction,
}: {
  draft: ReelState;
  saved: ReelState;
  channel?: Channel;
  running: boolean;
  edit: Edit;
  onInstantSwitch: (patch: Partial<ReelState>, runVoice: boolean) => void;
  onVoiceAction: (action: "voice" | "preview" | "render") => void;
}) {
  const [autoVoice, setAutoVoice] = useState(true);
  const options = draft.options ?? {};
  const activeVoice = options.voice || draft.client?.voice || channel?.narrator?.voice || "Charon";
  const activeDialect = options.dialect || draft.client?.dialect || "egyptian";
  const speed = options.speed ?? 1;
  const voicedCount = saved.takes.filter(Boolean).length;

  const pickVoice = (voice: string) => {
    const nextOptions: ReelOptions = { ...options, voice };
    const patch: Partial<ReelState> = {
      options: nextOptions,
      ...(draft.client ? { client: { ...draft.client, voice } } : {}),
    };
    edit(patch);
    onInstantSwitch(patch, autoVoice);
  };

  const pickDialect = (dialect: "egyptian" | "gulf") => {
    const nextOptions: ReelOptions = { ...options, dialect };
    const patch: Partial<ReelState> = {
      options: nextOptions,
      ...(draft.client ? { client: { ...draft.client, dialect } } : {}),
    };
    edit(patch);
    onInstantSwitch(patch, autoVoice);
  };

  return (
    <div className="grid max-w-3xl gap-5">
      <div className="grid gap-3 rounded-xl border bg-muted/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <MicIcon className="size-4 text-primary" />
            <span className="font-semibold">الصوت الحالي: {REEL_VOICES.find((v) => v.id === activeVoice)?.name ?? activeVoice}</span>
            <Badge variant="outline">{activeDialect === "gulf" ? "لهجة خليجية" : "عامية مصرية واضحة"}</Badge>
            <Badge variant={saved.voiceCurrent ? "secondary" : "default"}>
              {saved.voiceCurrent ? `جاهز · ${saved.voice?.seconds.toFixed(1)}s` : `${voicedCount}/${draft.lines.length} جمل مسجلة`}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={running} onClick={() => onVoiceAction("voice")}>
              {running ? <Loader2Icon className="animate-spin" /> : <MicIcon />} توليد الصوت الآن
            </Button>
            <Button size="sm" variant="outline" disabled={running} onClick={() => onVoiceAction("render")}>
              <ClapperboardIcon /> رندرة الفيديو بالصوت الجديد
            </Button>
          </div>
        </div>

        {saved.voice ? (
          <div className="grid gap-1.5 pt-1">
            <span className="text-xs text-muted-foreground">المسار الصوتي الكامل (`voice.mp3`):</span>
            <audio controls src={reelFileUrl(saved.id, "voice.mp3", saved.voice.at)} className="h-9 w-full" />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">لم يتم توليد المسار الصوتي الكامل بعد — اختر صوتاً أو اضغط «توليد الصوت الآن».</p>
        )}
      </div>

      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">اختر المعلق الصوتي (تغيير فوري)</h3>
            <p className="text-xs text-muted-foreground">اضغط على أي صوت للتبديل إليه فوراً وتوليد النطق بالعامية الواضحة.</p>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={autoVoice} onCheckedChange={setAutoVoice} />
            توليد الصوت تلقائياً بمجرد الاختيار
          </label>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2">
          {REEL_VOICES.map((v) => {
            const selected = activeVoice === v.id;
            return (
              <div
                key={v.id}
                role="button"
                tabIndex={0}
                onClick={() => !running && pickVoice(v.id)}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === " ") && !running) {
                    e.preventDefault();
                    pickVoice(v.id);
                  }
                }}
                className={cn(
                  "flex flex-col justify-between gap-2 rounded-xl border p-3 text-left transition-all hover:bg-muted/50",
                  selected && "border-primary bg-primary/5 ring-1 ring-primary",
                  running && "pointer-events-none opacity-60",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">{v.name}</span>
                  <Badge variant={selected ? "default" : "outline"} className="text-[11px]">
                    {v.badge}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground" dir="rtl">
                  {v.hint}
                </p>
                <div className="flex items-center justify-between pt-1">
                  {selected ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-primary">
                      <CheckCircle2Icon className="size-3.5" /> الصوت المختار حالياً
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">اضغط لاختيار هذا الصوت</span>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant={selected ? "secondary" : "ghost"}
                    className="h-7 px-2.5 text-xs"
                    disabled={running}
                    onClick={(e) => {
                      e.stopPropagation();
                      const nextOptions: ReelOptions = { ...options, voice: v.id };
                      const patch: Partial<ReelState> = {
                        options: nextOptions,
                        ...(draft.client ? { client: { ...draft.client, voice: v.id } } : {}),
                      };
                      edit(patch);
                      onInstantSwitch(patch, true);
                    }}
                  >
                    <SparklesIcon className="size-3" /> {selected ? "إعادة توليد" : "تطبيق وتوليد فوراً"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <Field label="اللهجة وطريقة النطق (Dialect)">
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant={activeDialect === "egyptian" ? "default" : "outline"}
              disabled={running}
              onClick={() => pickDialect("egyptian")}
            >
              🇪🇬 عامية مصرية واضحة
            </Button>
            <Button
              type="button"
              size="sm"
              variant={activeDialect === "gulf" ? "default" : "outline"}
              disabled={running}
              onClick={() => pickDialect("gulf")}
            >
              🇸🇦 لهجة خليجية
            </Button>
          </div>
        </Field>

        <Field label="سرعة القراءة (Voice Speed)" detail={`${speed.toFixed(2)}×`}>
          <div className="pt-2">
            <Slider
              min={0.8}
              max={1.3}
              step={0.05}
              value={[speed]}
              onValueChange={([value]) => edit({ options: { ...options, speed: Math.abs(value - 1) < 0.001 ? undefined : value } })}
            />
          </div>
        </Field>

        <div className="sm:col-span-2">
          <Field label="معرّف صوت ElevenLabs مخصّص (ElevenLabs Voice ID)" detail="يمكنك لصق أي Voice ID من ElevenLabs مباشرة وتطبيقه فوراً">
            <div className="flex gap-2">
              <Input
                dir="ltr"
                value={activeVoice}
                placeholder="IES4nrmZdUBHByLBde0P"
                onChange={(event) => {
                  const v = event.target.value.trim();
                  edit({
                    options: { ...options, voice: v || undefined },
                    ...(draft.client && v ? { client: { ...draft.client, voice: v } } : {}),
                  });
                }}
                className="font-mono text-xs"
              />
              <Button
                type="button"
                size="sm"
                disabled={running || !activeVoice.trim()}
                onClick={() => pickVoice(activeVoice.trim())}
              >
                <SparklesIcon className="size-3.5" /> تطبيق الـ ID وتوليد الصوت
              </Button>
            </div>
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field label="توجيه خاص لنبرة الصوت (اختياري)" detail="مثال: اقرأ بالعامية المصرية القاهرية الواضحة، بهدوء وثقة كأنك بتشرح لصاحب بيزنس">
            <Input
              dir="rtl"
              value={options.voiceStyle ?? ""}
              placeholder="اتكلم بالعامية المصرية القاهرية الواضحة من غير فصحى ولا تشكيل رسمي..."
              onChange={(event) => edit({ options: { ...options, voiceStyle: event.target.value || undefined } })}
            />
          </Field>
        </div>
      </div>

      <div className="grid gap-2">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">مقاطع الجمل الصوتية ({voicedCount}/{draft.lines.length})</span>
        <div className="grid gap-1.5">
          {draft.lines.map((line, index) => (
            <div key={index} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
              <div className="flex min-w-0 flex-1 items-center gap-2" dir="rtl">
                <span className="w-5 shrink-0 font-mono text-xs text-muted-foreground">{index + 1}.</span>
                <span className="truncate">{line}</span>
              </div>
              <div className="shrink-0">
                {saved.takes?.[index] && saved.lines[index] === line ? (
                  <PlayButton src={reelFileUrl(saved.id, saved.takes[index]!)} label="استمع" />
                ) : (
                  <span className="text-xs text-muted-foreground">غير مسجل بهذا الصوت</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
