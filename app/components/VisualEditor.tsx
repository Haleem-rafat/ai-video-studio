import type { Scene } from "../api.ts";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "./shared.tsx";

type Visual = Scene["visual"];

const LABELS: Record<Visual["type"], string> = {
  title: "Headline",
  chapter: "Chapter card",
  stat: "Big number",
  compare: "A vs B",
  chart: "Bar chart",
  list: "List",
  quote: "Quote",
  code: "Code",
};

/** Keeps whatever text the old visual had when switching type. */
function convert(visual: Visual, type: Visual["type"]): Visual {
  const text = "headline" in visual ? visual.headline : "label" in visual ? visual.label : "text" in visual ? visual.text : "";
  switch (type) {
    case "title":
      return { type, headline: text };
    case "chapter":
      return { type, number: 1, headline: text };
    case "stat":
      return { type, value: "0", label: text };
    case "compare":
      return { type, left: { label: "Before", value: "0" }, right: { label: "After", value: "0" } };
    case "chart":
      return { type, headline: text, bars: [{ label: "A", value: 1 }, { label: "B", value: 2 }] };
    case "list":
      return { type, headline: text, items: [] };
    case "quote":
      return { type, text, author: "" };
    case "code":
      return { type, headline: text, lines: [] };
  }
}

const lines = (value: string) => value.split("\n").map((line) => line.trimEnd()).filter((line, index, all) => line || index < all.length - 1);

export function VisualEditor({ visual, onChange }: { visual: Visual; onChange: (visual: Visual) => void }) {
  const field = (label: string, value: string | number, set: (value: string) => void, wide = false) => (
    <Field label={label} className={wide ? "col-span-2" : undefined}>
      <Input value={value} onChange={(event) => set(event.target.value)} />
    </Field>
  );

  return (
    <div className="grid grid-cols-2 gap-3 rounded-lg border border-dashed p-3" onClick={(event) => event.stopPropagation()}>
      <Field label="On screen" className="col-span-2">
        <Select value={visual.type} onValueChange={(type) => onChange(convert(visual, type as Visual["type"]))}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(LABELS).map(([type, label]) => (
              <SelectItem key={type} value={type}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {visual.type === "title" && field("Headline", visual.headline, (headline) => onChange({ ...visual, headline }), true)}
      {visual.type === "chapter" && (
        <>
          {field("Chapter number", visual.number, (number) => onChange({ ...visual, number: Number(number) || 1 }))}
          {field("Headline", visual.headline, (headline) => onChange({ ...visual, headline }))}
        </>
      )}
      {visual.type === "stat" && (
        <>
          {field("Number", visual.value, (value) => onChange({ ...visual, value }))}
          {field("Label", visual.label, (label) => onChange({ ...visual, label }))}
        </>
      )}
      {visual.type === "compare" && (
        <>
          {field("Left label", visual.left.label, (label) => onChange({ ...visual, left: { ...visual.left, label } }))}
          {field("Left value", visual.left.value, (value) => onChange({ ...visual, left: { ...visual.left, value } }))}
          {field("Right label", visual.right.label, (label) => onChange({ ...visual, right: { ...visual.right, label } }))}
          {field("Right value", visual.right.value, (value) => onChange({ ...visual, right: { ...visual.right, value } }))}
        </>
      )}
      {visual.type === "quote" && (
        <>
          {field("Quote", visual.text, (text) => onChange({ ...visual, text }), true)}
          {field("Who said it", visual.author ?? "", (author) => onChange({ ...visual, author }), true)}
        </>
      )}
      {(visual.type === "list" || visual.type === "code" || visual.type === "chart") && field("Headline", visual.headline, (headline) => onChange({ ...visual, headline }), true)}
      {visual.type === "list" && (
        <Field label="Items" detail="one per line" className="col-span-2">
          <Textarea rows={3} value={visual.items.join("\n")} onChange={(event) => onChange({ ...visual, items: lines(event.target.value) })} />
        </Field>
      )}
      {visual.type === "code" && (
        <Field label="Code" className="col-span-2">
          <Textarea className="font-mono text-xs" rows={4} value={visual.lines.join("\n")} onChange={(event) => onChange({ ...visual, lines: event.target.value.split("\n") })} />
        </Field>
      )}
      {visual.type === "chart" && (
        <Field label="Bars" detail="label: number, one per line" className="col-span-2">
          <Textarea
            className="font-mono text-xs"
            rows={3}
            value={visual.bars.map((bar) => `${bar.label}: ${bar.value}`).join("\n")}
            onChange={(event) =>
              onChange({
                ...visual,
                bars: lines(event.target.value).map((line) => {
                  const [label, value] = line.split(/:(?=[^:]*$)/);
                  return { label: (label ?? "").trim(), value: Number.parseFloat(value ?? "") || 0 };
                }),
              })
            }
          />
        </Field>
      )}
    </div>
  );
}
