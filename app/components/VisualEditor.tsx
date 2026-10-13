import type { Scene } from "../api.ts";

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
    <label className={`field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      <input value={value} onChange={(event) => set(event.target.value)} />
    </label>
  );

  return (
    <div className="visual-editor">
      <label className="field">
        <span>On screen</span>
        <select value={visual.type} onChange={(event) => onChange(convert(visual, event.target.value as Visual["type"]))}>
          {Object.entries(LABELS).map(([type, label]) => (
            <option key={type} value={type}>
              {label}
            </option>
          ))}
        </select>
      </label>

      {visual.type === "title" && field("Headline", visual.headline, (headline) => onChange({ ...visual, headline }), true)}
      {visual.type === "chapter" && (
        <>
          {field("Chapter #", visual.number, (number) => onChange({ ...visual, number: Number(number) || 1 }))}
          {field("Headline", visual.headline, (headline) => onChange({ ...visual, headline }), true)}
        </>
      )}
      {visual.type === "stat" && (
        <>
          {field("Number", visual.value, (value) => onChange({ ...visual, value }))}
          {field("Label", visual.label, (label) => onChange({ ...visual, label }), true)}
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
          {field("Author", visual.author ?? "", (author) => onChange({ ...visual, author }))}
        </>
      )}
      {(visual.type === "list" || visual.type === "code" || visual.type === "chart") && field("Headline", visual.headline, (headline) => onChange({ ...visual, headline }), true)}
      {visual.type === "list" && (
        <label className="field wide">
          <span>Items (one per line)</span>
          <textarea rows={3} value={visual.items.join("\n")} onChange={(event) => onChange({ ...visual, items: lines(event.target.value) })} />
        </label>
      )}
      {visual.type === "code" && (
        <label className="field wide">
          <span>Code</span>
          <textarea className="mono" rows={4} value={visual.lines.join("\n")} onChange={(event) => onChange({ ...visual, lines: event.target.value.split("\n") })} />
        </label>
      )}
      {visual.type === "chart" && (
        <label className="field wide">
          <span>Bars (label: number, one per line)</span>
          <textarea
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
        </label>
      )}
    </div>
  );
}
