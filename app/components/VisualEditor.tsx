import type { Scene } from "../api.ts";
import type { DeepLayout } from "../../src/types.ts";
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
  versus: "Versus round",
  deepdive: "Deep-dive chapter",
};

const LAYOUTS: Record<DeepLayout, { label: string; items: string }> = {
  photo: { label: "Real photo + points", items: "point | detail, up to 3" },
  blocks: { label: "Chip map (blocks light up)", items: "block | what it does, 4–9" },
  steps: { label: "Numbered steps", items: "step | one line, 3–6" },
  stat: { label: "Big number", items: "number | what it counts, one line" },
  table: { label: "Table", items: "values separated by |, 2–5 per row" },
  grid: { label: "Grid of cards", items: "name | detail, empty line = empty cell" },
};

/** Keeps whatever text the old visual had when switching type. */
function convert(visual: Visual, type: Visual["type"]): Visual {
  const text = "headline" in visual ? visual.headline : "title" in visual ? visual.title : "label" in visual ? visual.label : "text" in visual ? visual.text : "";
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
    case "versus":
      return { type, title: text, rows: [{ a: "", b: "" }], pose: "point" };
    case "deepdive":
      return { type, title: text, layout: "photo", items: [], pose: "point" };
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
      {visual.type === "versus" && (
        <>
          {field("Round title", visual.title, (title) => onChange({ ...visual, title }))}
          <Field label="Character pose">
            <Select value={visual.pose ?? "point"} onValueChange={(pose) => onChange({ ...visual, pose: pose as "point" | "think" | "wave" })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="point">Pointing</SelectItem>
                <SelectItem value="think">Thinking</SelectItem>
                <SelectItem value="wave">Waving</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Rows" detail="A | B | winner (a, b or blank), one per line" className="col-span-2">
            <Textarea
              className="font-mono text-xs"
              rows={3}
              value={visual.rows.map((row) => [row.a, row.b, row.winner ?? ""].join(" | ")).join("\n")}
              onChange={(event) =>
                onChange({
                  ...visual,
                  rows: lines(event.target.value).map((line) => {
                    const [a = "", b = "", winner = ""] = line.split("|").map((part) => part.trim());
                    return { a, b, ...(winner === "a" || winner === "b" ? { winner } : {}) };
                  }),
                })
              }
            />
          </Field>
        </>
      )}
      {visual.type === "deepdive" && (
        <>
          {field("Chapter title", visual.title, (title) => onChange({ ...visual, title }))}
          <Field label="Picture">
            <Select value={visual.layout} onValueChange={(layout) => onChange({ ...visual, layout: layout as DeepLayout })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(LAYOUTS).map(([layout, { label }]) => (
                  <SelectItem key={layout} value={layout}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Items" detail={LAYOUTS[visual.layout].items} className="col-span-2">
            <Textarea
              className="text-xs"
              rows={Math.min(6, Math.max(2, visual.items.length))}
              value={visual.items.map((item) => (item.cells?.length ? item.cells.join(" | ") : item.note ? `${item.label} | ${item.note}` : item.label)).join("\n")}
              onChange={(event) =>
                onChange({
                  ...visual,
                  items: event.target.value.split("\n").map((line, index) => {
                    const parts = line.split("|").map((part) => part.trim());
                    // Grid cards keep their picture when only the text is edited.
                    const image = visual.items[index]?.image;
                    const base = parts.length > 2 && visual.layout === "table" ? { label: parts[0], cells: parts } : parts[1] ? { label: parts[0], note: parts.slice(1).join(" | ") } : { label: parts[0] ?? "" };
                    return image ? { ...base, image } : base;
                  }),
                })
              }
            />
          </Field>
          {visual.layout === "table" &&
            field("Headers", (visual.heads ?? []).join(" | "), (heads) => onChange({ ...visual, heads: heads.split("|").map((head) => head.trim()) }), true)}
          {visual.layout === "grid" && field("Columns", visual.columns ?? "", (columns) => onChange({ ...visual, columns: Number(columns) || undefined }))}
          <Field label="Photo search words" detail="English, on Wikimedia Commons">
            <Input value={visual.photo?.query ?? ""} placeholder="e.g. silicon wafer" onChange={(event) => onChange({ ...visual, photo: { query: event.target.value } })} />
          </Field>
          <Field label="Character pose">
            <Select value={visual.pose ?? "point"} onValueChange={(pose) => onChange({ ...visual, pose: pose as "point" | "think" | "wave" })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="point">Pointing</SelectItem>
                <SelectItem value="think">Thinking</SelectItem>
                <SelectItem value="wave">Waving</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </>
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
