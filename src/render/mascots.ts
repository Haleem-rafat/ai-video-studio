import type { Channel } from "../config.ts";

/**
 * Each mascot is plain SVG with three animated parts the composition drives:
 * #m-body (bob and hop), #m-eyes (blink) and #m-mouth (opens on every word).
 * All share a 200x240 viewBox.
 */
export function mascotSvg(channel: Channel): string {
  const c = channel.colors;

  switch (channel.mascot.kind) {
    case "robot":
      return svg(`
        <g id="m-body">
          <line x1="100" y1="22" x2="100" y2="48" stroke="${c.muted}" stroke-width="6" stroke-linecap="round"/>
          <circle cx="100" cy="18" r="10" fill="${c.accent}"/>
          <rect x="30" y="46" width="140" height="112" rx="28" fill="#c9d1d9"/>
          <rect x="44" y="60" width="112" height="84" rx="18" fill="${c.background}"/>
          <g id="m-eyes">
            <rect x="66" y="80" width="18" height="24" rx="6" fill="${c.accent}"/>
            <rect x="116" y="80" width="18" height="24" rx="6" fill="${c.accent}"/>
          </g>
          <rect id="m-mouth" x="80" y="116" width="40" height="14" rx="7" fill="${c.accent}"/>
          <rect x="58" y="164" width="84" height="56" rx="16" fill="#8b949e"/>
          <circle cx="100" cy="190" r="10" fill="${c.accent}"/>
          <rect x="18" y="168" width="34" height="14" rx="7" fill="#c9d1d9"/>
          <rect x="148" y="168" width="34" height="14" rx="7" fill="#c9d1d9"/>
        </g>`);
    case "coin":
      return svg(`
        <g id="m-body">
          <rect x="66" y="196" width="14" height="34" rx="7" fill="#b8860b"/>
          <rect x="120" y="196" width="14" height="34" rx="7" fill="#b8860b"/>
          <circle cx="100" cy="112" r="92" fill="#d4a017"/>
          <circle cx="100" cy="112" r="78" fill="${c.accent}"/>
          <text x="100" y="74" text-anchor="middle" font-size="34" font-weight="900" fill="#b8860b" font-family="Georgia, serif">$</text>
          <g id="m-eyes">
            <ellipse cx="74" cy="108" rx="10" ry="14" fill="#2b2b2b"/>
            <ellipse cx="126" cy="108" rx="10" ry="14" fill="#2b2b2b"/>
            <circle cx="77" cy="103" r="4" fill="#fff"/>
            <circle cx="129" cy="103" r="4" fill="#fff"/>
          </g>
          <ellipse id="m-mouth" cx="100" cy="150" rx="22" ry="12" fill="#7a3b10"/>
          <circle cx="58" cy="138" r="9" fill="#f08a5d" opacity="0.6"/>
          <circle cx="142" cy="138" r="9" fill="#f08a5d" opacity="0.6"/>
        </g>`);
    case "bear":
      return svg(`
        <g id="m-body">
          <ellipse cx="100" cy="206" rx="62" ry="34" fill="#a0673a"/>
          <circle cx="44" cy="46" r="26" fill="#a0673a"/>
          <circle cx="156" cy="46" r="26" fill="#a0673a"/>
          <circle cx="44" cy="46" r="13" fill="#f4c095"/>
          <circle cx="156" cy="46" r="13" fill="#f4c095"/>
          <circle cx="100" cy="108" r="80" fill="#b5774a"/>
          <g id="m-eyes">
            <ellipse cx="72" cy="96" rx="10" ry="13" fill="#2b2d42"/>
            <ellipse cx="128" cy="96" rx="10" ry="13" fill="#2b2d42"/>
            <circle cx="75" cy="91" r="4" fill="#fff"/>
            <circle cx="131" cy="91" r="4" fill="#fff"/>
          </g>
          <ellipse cx="100" cy="138" rx="36" ry="28" fill="#f4c095"/>
          <ellipse cx="100" cy="124" rx="12" ry="8" fill="#2b2d42"/>
          <ellipse id="m-mouth" cx="100" cy="148" rx="14" ry="9" fill="#c0392b"/>
          <circle cx="54" cy="128" r="10" fill="${c.accent}" opacity="0.45"/>
          <circle cx="146" cy="128" r="10" fill="${c.accent}" opacity="0.45"/>
        </g>`);
  }
}

function svg(body: string): string {
  return `<svg viewBox="0 0 200 240" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}
