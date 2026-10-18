import { ExternalLinkIcon } from "lucide-react";

import type { ProjectState } from "../api.ts";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Field } from "./shared.tsx";

type Marketing = NonNullable<ProjectState["marketing"]>;

type Props = {
  project: ProjectState;
  busy: boolean;
  onEdit: (change: (marketing: Marketing) => Marketing) => void;
};

/** Gemini voices that suit an ad read: calm and clear. */
const VOICES = [
  { id: "Charon", label: "Charon · male, informative" },
  { id: "Orus", label: "Orus · male, firm" },
  { id: "Sulafat", label: "Sulafat · female, warm" },
  { id: "Kore", label: "Kore · female, firm" },
  { id: "Aoede", label: "Aoede · female, light" },
];

const COLOR_NAMES: Record<keyof Marketing["brand"]["colors"], string> = {
  background: "Background",
  panel: "Cards",
  text: "Text",
  accent: "Accent",
  cta: "Button",
  muted: "Soft text",
};

/** A marketing video's brand (read from its website), voice and subtitles. */
export function MarketingPanel({ project, busy, onEdit }: Props) {
  const m = project.marketing!;
  const { brand } = m;
  const setColor = (key: keyof Marketing["brand"]["colors"], value: string) => onEdit((current) => ({ ...current, brand: { ...current.brand, colors: { ...current.brand.colors, [key]: value } } }));

  return (
    <div className="grid gap-4 rounded-xl border p-4">
      <div className="flex items-center gap-3">
        {brand.logo && <img src={`/files/${project.id}/${brand.logo}`} alt="" className="size-10 rounded-lg border object-contain" style={{ background: brand.colors.background }} />}
        <div className="grid min-w-0 flex-1">
          <span className="truncate text-sm font-semibold">{brand.name}</span>
          <a href={brand.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 truncate text-xs text-muted-foreground hover:underline">
            {brand.url.replace(/^https?:\/\//, "")} <ExternalLinkIcon className="size-3" />
          </a>
        </div>
        <Badge variant="outline">{m.language === "ar" ? "العربية" : "English"}</Badge>
        <Badge variant="outline">{m.creativity === "bold" ? "Bold" : m.creativity === "creative" ? "Creative" : "Close to the site"}</Badge>
        <Badge variant="outline">{m.brief.data === "real" ? "Real numbers" : "Example numbers"}</Badge>
      </div>

      <Field label="Brand colours (from the website)">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(COLOR_NAMES) as (keyof typeof COLOR_NAMES)[]).map((key) => (
            <label key={key} className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
              <input type="color" value={brand.colors[key]} disabled={busy} onChange={(event) => setColor(key, event.target.value)} className="size-5 cursor-pointer rounded border-0 bg-transparent p-0" />
              {COLOR_NAMES[key]}
            </label>
          ))}
        </div>
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Voice">
          <Select value={m.narrator.voice} disabled={busy} onValueChange={(voice) => onEdit((current) => ({ ...current, narrator: { ...current.narrator, voice } }))}>
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VOICES.map((voice) => (
                <SelectItem key={voice.id} value={voice.id}>
                  {voice.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Subtitles">
          <label className="flex h-8 items-center gap-2 text-sm">
            <Switch checked={m.captions} disabled={busy} onCheckedChange={(captions) => onEdit((current) => ({ ...current, captions }))} />
            {m.captions ? "The whole narration, word by word" : "Only the short on-screen phrases"}
          </label>
        </Field>
      </div>

      {m.post && (
        <Field label="Post caption" detail={`${m.post.hashtags.length} hashtags`}>
          <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-xs" dir="auto">
            {m.post.caption}
            {"\n\n"}
            {m.post.hashtags.map((tag) => `#${tag}`).join(" ")}
          </p>
        </Field>
      )}
    </div>
  );
}
