import type { Channel, ProjectSummary } from "../api.ts";

type Props = {
  projects: ProjectSummary[];
  channels: Channel[];
  selected: string | null;
  onSelect: (id: string | null) => void;
};

export function Sidebar({ projects, channels, selected, onSelect }: Props) {
  const channelName = (id: string) => channels.find((channel) => channel.id === id)?.name ?? id;

  return (
    <aside className="sidebar">
      <button className={`new-video ${selected === null ? "active" : ""}`} onClick={() => onSelect(null)}>
        + New video
      </button>
      <div className="sidebar-label">Projects</div>
      <ul className="project-list">
        {projects.map((project) => (
          <li key={project.id}>
            <button className={selected === project.id ? "active" : ""} onClick={() => onSelect(project.id)}>
              <span className="project-title">{project.title}</span>
              <span className="project-meta">
                {channelName(project.channel)} · {project.format === "short" ? "Short" : "Long"} · {project.sceneCount} scenes
                {project.hasVideo && <span className="badge ok">video</span>}
              </span>
            </button>
          </li>
        ))}
        {projects.length === 0 && <li className="empty">No videos yet.</li>}
      </ul>
    </aside>
  );
}
