// The Hourly cast: one clock-with-glasses family, one character per chip.
// Same face geometry (circle 60,68 r48; eyes at 42/78,69) so they share animation hooks.
const INK = "#1f1e21";
const ticks = (c) => `<circle cx="60" cy="68" r="40" fill="none" stroke="${c}" stroke-width="3" stroke-dasharray="2.2 18.9" stroke-dashoffset="1.1" transform="rotate(-90 60 68)" opacity=".9"/>`;
const hands = (c) => `<g class="hand h"><line x1="60" y1="68" x2="60" y2="46" stroke="${c}" stroke-width="5" stroke-linecap="round"/></g><g class="hand m"><line x1="60" y1="68" x2="60" y2="36" stroke="${c}" stroke-width="3.2" stroke-linecap="round"/></g><circle cx="60" cy="68" r="4.5" fill="${c}"/>`;
const eye = (x, r = 14, lid = 0) => `<g class="eye"><circle cx="${x}" cy="69" r="${r}" fill="#fff" stroke="${INK}" stroke-width="4.5"/><circle class="pupil" cx="${x}" cy="69" r="5.5" fill="${INK}"/><circle cx="${x + 2}" cy="67" r="1.9" fill="#fff"/>${lid ? `<path d="M${x - r},${69 - r + lid} h${r * 2}" stroke="none"/><rect x="${x - r - 2}" y="${69 - r - 2}" width="${r * 2 + 4}" height="${lid + 2}" fill="CLOCK" />` : ""}</g>`;
const brows = (d, w = 7.5) => `<path d="${d}" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" fill="none"/>`;
const smile = (d) => `<path d="${d}" stroke="${INK}" stroke-width="4" stroke-linecap="round" fill="none"/>`;
const arms = `<path class="arm l" d="M28,66 L19,61" stroke="${INK}" stroke-width="4" stroke-linecap="round" fill="none"/><path class="arm r" d="M92,66 L101,61" stroke="${INK}" stroke-width="4" stroke-linecap="round" fill="none"/>`;

export const CAST = {
  H100_SXM: { name: "Tick", role: "The original. Steady, curious, always on time.", color: "#2f6bff" },
  H200: { name: "Tock", role: "Tick's bigger sibling. More memory, more opinions.", color: "#4d8dff" },
  B200: { name: "Flux", role: "Two dies, one grin. Moves fast, sees both sides.", color: "#18b6ff" },
  A100_SXM4: { name: "Gramps", role: "The veteran. Cheap, calm, has seen every cycle.", color: "#7f95c9" },
};

export function char(code, cls = "") {
  const c = CAST[code] || CAST.H100_SXM;
  let body = "";
  if (code === "H200") {
    body = `<circle cx="60" cy="68" r="48" fill="${c.color}"/>${ticks("#fff")}${hands("#fff")}
      <path d="M48,22 q4,-14 12,-4 q4,-12 12,0 M54,24 q6,-8 12,0" stroke="${INK}" stroke-width="4.5" stroke-linecap="round" fill="none"/>
      ${brows("M30,47 L52,43 M68,43 L90,47")}
      <rect x="26" y="54" width="32" height="30" rx="9" fill="#fff" stroke="${INK}" stroke-width="4.5"/><rect x="62" y="54" width="32" height="30" rx="9" fill="#fff" stroke="${INK}" stroke-width="4.5"/>
      <path d="M58,68 h4" stroke="${INK}" stroke-width="4.5"/>
      <circle class="pupil" cx="42" cy="69" r="6" fill="${INK}"/><circle class="pupil" cx="78" cy="69" r="6" fill="${INK}"/><circle cx="44" cy="67" r="2" fill="#fff"/><circle cx="80" cy="67" r="2" fill="#fff"/>
      ${arms}${smile("M44,95 q16,16 32,0").replace("<path","<path class=\"mouth\"")}`;
  } else if (code === "B200") {
    body = `<rect x="6" y="56" width="12" height="26" rx="4" fill="${c.color}" stroke="${INK}" stroke-width="3"/><rect x="102" y="56" width="12" height="26" rx="4" fill="${c.color}" stroke="${INK}" stroke-width="3"/>
      <circle cx="60" cy="68" r="48" fill="${c.color}"/>${ticks("#fff")}${hands("#fff")}
      ${brows("M32,48 L54,44 M66,44 L88,48")}
      <rect x="24" y="52" width="72" height="32" rx="16" fill="#fff" stroke="${INK}" stroke-width="4.5"/><path d="M60,52 v32" stroke="${INK}" stroke-width="3"/>
      <circle class="pupil" cx="42" cy="69" r="6" fill="${INK}"/><circle class="pupil" cx="78" cy="69" r="6" fill="${INK}"/><circle cx="44" cy="67" r="2" fill="#fff"/><circle cx="80" cy="67" r="2" fill="#fff"/>
      <path class="mouth" d="M40,95 q20,18 40,0 z" fill="${INK}"/><path d="M46,96 h28" stroke="#fff" stroke-width="3"/>`;
  } else if (code === "A100_SXM4") {
    body = `<circle cx="60" cy="68" r="48" fill="${c.color}"/>${ticks("#fff")}${hands("#fff")}
      <path d="M22,40 q-10,-4 -4,-14 q8,-4 12,6 M98,40 q10,-4 4,-14 q-8,-4 -12,6" fill="#fff" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
      ${brows("M30,50 L52,47 M68,47 L90,50", 6)}
      <circle cx="42" cy="69" r="14" fill="#fff" stroke="${INK}" stroke-width="4.5"/><circle cx="78" cy="69" r="14" fill="#fff" stroke="${INK}" stroke-width="4.5"/>
      <circle class="pupil" cx="42" cy="72" r="5" fill="${INK}"/><circle class="pupil" cx="78" cy="72" r="5" fill="${INK}"/>
      <path d="M26,60 h32 M62,60 h32" stroke="${c.color}" stroke-width="9"/><path d="M28,60 h28 M64,60 h28" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
      <path d="M55,68 q5,-5 10,0" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M40,88 q20,-8 40,0 q-6,10 -20,6 q-14,4 -20,-6z" fill="#fff" stroke="${INK}" stroke-width="3"/>${smile("M50,101 q10,6 20,0")}`;
  } else {
    body = `<circle cx="60" cy="68" r="48" fill="${c.color}"/>${ticks("#fff")}${hands("#fff")}
      ${brows("M29,46 L52,41 M68,41 L91,46").replace("<path","<path class=\"brows\"")}<path d="M55,68 q5,-5 10,0" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>${arms}
      ${eye(42).replace("CLOCK", c.color)}${eye(78).replace("CLOCK", c.color)}${smile("M47,96 q13,11 26,0").replace("<path","<path class=\"mouth\"")}`;
  }
  return `<svg class="char c-${(CAST[code]||CAST.H100_SXM).name.toLowerCase()} ${cls}" data-char="${code}" viewBox="0 0 120 130" role="img" aria-label="${c.name}">${body}</svg>`;
}
