import { brandPaths } from "../brand/brand.ts";
import type { Channel } from "../config.ts";

const esc = (text: string) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/**
 * The channel's logo and @handle as a small pill in a top corner, on every
 * look. Without a logo or handle the channel shows only its name. `u` scales
 * it with the frame (1 at 1080 px tall).
 */
export function brandBadge(channel: Channel, u: number, options: { top: number; side: "left" | "right" | "center"; dark?: boolean }): { css: string; html: string } {
  const { logo } = brandPaths(channel);
  const label = channel.brand?.handle ?? channel.name;
  const place =
    options.side === "center" ? "left: 50%; transform: translateX(-50%);" : `${options.side}: ${40 * u}px;`;
  const ink = options.dark ? "#111" : "#fff";
  const css = `
      #brand-badge { position: absolute; top: ${options.top * u}px; ${place} z-index: 1001; display: flex; align-items: center; gap: ${12 * u}px;
        padding: ${6 * u}px ${18 * u}px ${6 * u}px ${6 * u}px; border-radius: ${999}px; background: ${options.dark ? "#ffffffb8" : "#00000059"};
        color: ${ink}; font: 700 ${26 * u}px ${channel.font}; letter-spacing: 0.02em; direction: ltr; opacity: 0.92; }
      #brand-badge img { width: ${48 * u}px; height: ${48 * u}px; border-radius: 50%; object-fit: cover; background: #fff; }`;
  const html = `<div id="brand-badge">${logo ? `<img src="${logo}" alt="" />` : ""}<span>${esc(label)}</span></div>`;
  return { css, html };
}
