import { useState } from "react";
import { SparklesIcon } from "lucide-react";
import { toast } from "sonner";

import { api, type Client, type Knowledge } from "../api.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "./shared.tsx";

type Props = { client: Client; working: boolean; onSaved: (client: Client) => void; onJob: () => void };

const toLines = (list: string[]) => list.join("\n");
const fromLines = (text: string) => text.split("\n").map((line) => line.trim()).filter(Boolean);

/** What the writers know about the client: drafted from the website, grown by an interview, editable. */
export function KnowledgePanel({ client, working, onSaved, onJob }: Props) {
  const knowledge = client.knowledge;
  const [draft, setDraft] = useState<Knowledge | undefined>(knowledge);
  const [answer, setAnswer] = useState("");
  const [skipped, setSkipped] = useState<string[]>([]);

  const start = (work: Promise<unknown>, message: string) =>
    work
      .then(() => {
        toast.success(message);
        onJob();
      })
      .catch((error: Error) => toast.error(error.message));

  if (!knowledge || !draft) {
    return (
      <div className="grid max-w-2xl gap-3 rounded-xl border p-5">
        <p className="text-sm">
          Writers don't know <b>{client.name}</b>'s product yet. Draft its knowledge from the website and brief: how it works step by step, who buys and how they talk, what they doubt, and what is true to claim. Then a short interview fills what the site doesn't say.
        </p>
        <div>
          <Button disabled={working} onClick={() => start(api.draftKnowledge(client.id), "Reading the website…")}>
            <SparklesIcon /> {working ? "Working…" : "Draft knowledge (~$0.03)"}
          </Button>
        </div>
      </div>
    );
  }

  const open = knowledge.questions.filter((q) => !q.answer?.trim() && !skipped.includes(q.id));
  const question = open[0];
  const answered = knowledge.questions.filter((q) => q.answer?.trim()).length;
  const set = (change: Partial<Knowledge>) => setDraft({ ...draft, ...change });
  const save = () =>
    api
      .editClient(client.id, { knowledge: draft })
      .then((next) => {
        toast.success("Knowledge saved");
        onSaved(next);
      })
      .catch((error: Error) => toast.error(error.message));

  return (
    <div className="grid max-w-3xl gap-4">
      <div className="grid gap-2 rounded-xl border bg-muted/30 p-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Interview</span>
          <Badge variant="outline">
            {answered}/{knowledge.questions.length} answered
          </Badge>
        </div>
        {question ? (
          <>
            <p className="font-medium" dir="auto">
              {question.question}
            </p>
            <Textarea dir="auto" rows={3} value={answer} placeholder="Your answer, in your own words" onChange={(e) => setAnswer(e.target.value)} />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={working || !answer.trim()}
                onClick={() => {
                  start(api.answerKnowledge(client.id, question.id, answer), "Adding your answer to the knowledge…");
                  setAnswer("");
                  setSkipped([...skipped, question.id]);
                }}
              >
                Answer
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSkipped([...skipped, question.id])}>
                Skip
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No open questions. Edit any section below, or draft again after the website changes.</p>
        )}
      </div>

      <Field label="How it works (one step per line, the customer's side)">
        <Textarea dir="auto" rows={5} value={toLines(draft.howItWorks)} onChange={(e) => set({ howItWorks: fromLines(e.target.value) })} />
      </Field>
      <Field label="What makes it different">
        <Textarea dir="auto" rows={3} value={toLines(draft.different)} onChange={(e) => set({ different: fromLines(e.target.value) })} />
      </Field>

      <Field label="Customers">
        <div className="grid gap-3 sm:grid-cols-2">
          {draft.personas.map((persona, i) => {
            const setPersona = (change: Partial<Knowledge["personas"][number]>) => set({ personas: draft.personas.map((p, j) => (j === i ? { ...p, ...change } : p)) });
            return (
              <div key={i} className="grid gap-2 rounded-lg border p-3">
                <Input dir="auto" value={persona.name} onChange={(e) => setPersona({ name: e.target.value })} />
                <Textarea dir="auto" rows={2} value={persona.who} onChange={(e) => setPersona({ who: e.target.value })} />
                <span className="text-xs text-muted-foreground">What they say</span>
                <Textarea dir="auto" rows={3} value={toLines(persona.words)} onChange={(e) => setPersona({ words: fromLines(e.target.value) })} />
                <span className="text-xs text-muted-foreground">Worries</span>
                <Textarea dir="auto" rows={2} value={toLines(persona.worries)} onChange={(e) => setPersona({ worries: fromLines(e.target.value) })} />
                <span className="text-xs text-muted-foreground">Wishes</span>
                <Textarea dir="auto" rows={2} value={toLines(persona.wishes)} onChange={(e) => setPersona({ wishes: fromLines(e.target.value) })} />
              </div>
            );
          })}
        </div>
      </Field>

      <Field label="What they doubt → the answer (one per line, with →)">
        <Textarea
          dir="auto"
          rows={4}
          value={draft.objections.map((o) => `${o.doubt} → ${o.answer}`).join("\n")}
          onChange={(e) => set({ objections: fromLines(e.target.value).map((line) => ({ doubt: line.split("→")[0].trim(), answer: (line.split("→")[1] ?? "").trim() })) })}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="True facts a post may state">
          <Textarea dir="auto" rows={4} value={toLines(draft.facts)} onChange={(e) => set({ facts: fromLines(e.target.value) })} />
        </Field>
        <Field label="Real proof and results">
          <Textarea dir="auto" rows={4} value={toLines(draft.proof)} onChange={(e) => set({ proof: fromLines(e.target.value) })} />
        </Field>
        <Field label="Words to use">
          <Textarea dir="auto" rows={3} value={toLines(draft.use)} onChange={(e) => set({ use: fromLines(e.target.value) })} />
        </Field>
        <Field label="Never say or claim">
          <Textarea dir="auto" rows={3} value={toLines(draft.avoid)} onChange={(e) => set({ avoid: fromLines(e.target.value) })} />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button onClick={save}>Save knowledge</Button>
        <Button variant="outline" disabled={working} onClick={() => start(api.draftKnowledge(client.id), "Drafting again from the website… (answers are kept)")}>
          Draft again
        </Button>
      </div>
    </div>
  );
}
