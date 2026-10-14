import { useEffect, useState } from "react";

import { api, type Channel, type FormatId, type Job, type StyleId, type TopicIdea } from "../api.ts";

type Props = { channels: Channel[]; llmReady: boolean; jobs: Job[] };

const MASCOT: Record<string, string> = { robot: "🤖", coin: "🪙", bear: "🧸" };

export function NewVideo({ channels, llmReady, jobs }: Props) {
  const [channel, setChannel] = useState("");
  const [format, setFormat] = useState<FormatId>("short");
  const [style, setStyle] = useState<StyleId>("motion");
  const [topic, setTopic] = useState("");
  const [focus, setFocus] = useState("");
  const [ideasJob, setIdeasJob] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<TopicIdea[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!channel && channels[0]) setChannel(channels[0].id);
  }, [channels, channel]);

  const job = jobs.find((candidate) => candidate.id === ideasJob);
  useEffect(() => {
    if (job?.status === "done" && Array.isArray(job.result)) setIdeas(job.result as TopicIdea[]);
    if (job?.status === "failed") setError(job.error ?? "Topic ideas failed.");
  }, [job?.status, job?.result, job?.error]);

  const writing = jobs.find((candidate) => candidate.label.startsWith("Write script") && (candidate.status === "running" || candidate.status === "queued"));

  const run = async (action: () => Promise<Job>) => {
    setError("");
    try {
      return await action();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  return (
    <div className="new-video-page">
      <h1>New video</h1>
      <p className="lead">Bonsai writes and fact-checks the script, ElevenLabs narrates it, FLUX draws the backgrounds, and HyperFrames renders it.</p>

      <section className="card">
        <h2>1. Channel</h2>
        <div className="channel-grid">
          {channels.map((option) => (
            <button
              key={option.id}
              className={`channel-card ${channel === option.id ? "active" : ""}`}
              style={{ borderColor: channel === option.id ? option.colors.accent : undefined }}
              onClick={() => setChannel(option.id)}
            >
              <span className="channel-mascot">{MASCOT[option.mascot.kind]}</span>
              <span className="channel-name" style={{ color: option.colors.accent }}>
                {option.name}
              </span>
              <span className="channel-audience">{option.audience}</span>
            </button>
          ))}
        </div>

        <h2>2. Format</h2>
        <div className="segmented">
          <button className={format === "short" ? "active" : ""} onClick={() => setFormat("short")}>
            📱 Short · 9:16 · ~70s
          </button>
          <button className={format === "long" ? "active" : ""} onClick={() => setFormat("long")}>
            🖥 Long · 16:9 · ~8 min
          </button>
        </div>

        <h2>Look</h2>
        <div className="segmented">
          <button className={style === "motion" ? "active" : ""} onClick={() => setStyle("motion")}>
            🎨 Motion graphics
          </button>
          <button className={style === "whiteboard" ? "active" : ""} onClick={() => setStyle("whiteboard")}>
            ✏️ Whiteboard
          </button>
        </div>
        {style === "whiteboard" && <p className="hint">A hand draws each picture and writes the key words on paper. Pictures use FLUX dev, about $0.025 each.</p>}
      </section>

      <section className="card">
        <h2>3. Topic</h2>
        <div className="row">
          <input className="grow" placeholder="Optional focus for ideas, e.g. surprising money history" value={focus} onChange={(event) => setFocus(event.target.value)} />
          <button
            disabled={!llmReady || job?.status === "running" || job?.status === "queued"}
            onClick={async () => {
              setIdeas([]);
              const started = await run(() => api.topics(channel, format, focus));
              if (started) setIdeasJob(started.id);
            }}
          >
            {job?.status === "running" || job?.status === "queued" ? "Thinking…" : "💡 Get topic ideas"}
          </button>
        </div>

        {ideas.length > 0 && (
          <ul className="ideas">
            {ideas.map((idea) => (
              <li key={idea.title}>
                <button className={topic === idea.topic ? "active" : ""} onClick={() => setTopic(idea.topic)}>
                  <strong>{idea.title}</strong>
                  <span>{idea.why}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <textarea rows={2} placeholder="What is the video about?" value={topic} onChange={(event) => setTopic(event.target.value)} />

        <div className="row end">
          {!llmReady && <span className="hint">Start Bonsai (top right) first.</span>}
          <button className="primary" disabled={!llmReady || !topic.trim() || Boolean(writing)} onClick={() => run(() => api.create(channel, format, topic, style))}>
            {writing ? "Writing script…" : "✍️ Write script"}
          </button>
        </div>
        {format === "long" && <p className="hint">A long script takes Bonsai about 30–40 minutes (outline, chapters and fact-checks).</p>}
        {error && <p className="error">{error}</p>}
      </section>
    </div>
  );
}
