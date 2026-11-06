// Shared by the public site, admin and overlay. Donor text is untrusted, so everything goes through esc().
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const CDN = 'https://cdn.cloudflare.steamstatic.com/apps/dota2';
export const heroImg = (h) => `${CDN}/images/dota_react/heroes/${h.slug}.png`;
export const heroVideo = (h) => `${CDN}/videos/dota_react/heroes/renders/${h.slug}.webm`;

// Fixed order, never extended. The values live in style.css, one set for each theme.
const PALETTE = [1, 2, 3, 4, 5, 6, 7].map((n) => `var(--s${n})`);
const OTHER = 'var(--other)';
const MAX_NAMED = 7;

const SYMBOLS = { GBP: '£', USD: '$', EUR: '€' };
export const money = (n, currency = 'GBP') => `${SYMBOLS[currency] ?? ''}${Number(n).toFixed(Number.isInteger(n) ? 0 : 2)}`;
export const percent = (x) => `${x >= 0.1 ? Math.round(x * 100) : (x * 100).toFixed(1)}%`;

export const playerName = (data, id) => data.players.find((p) => p.id === id)?.name ?? 'TBD';

/** Colours follow the order heroes joined the pie, not their rank, so slices keep their colour as odds change. */
export function colouredSlices(slices, heroes) {
  const named = slices.slice(0, MAX_NAMED);
  const byJoin = [...named].sort((a, b) => a.order - b.order);
  const result = named.map((s) => ({
    ...s, label: heroes.get(s.heroId)?.name ?? '?', colour: PALETTE[byJoin.indexOf(s)],
  }));
  const rest = slices.slice(MAX_NAMED);
  if (rest.length) {
    result.push({
      heroId: null, label: `${rest.length} other${rest.length > 1 ? 's' : ''}`, colour: OTHER,
      chance: rest.reduce((sum, s) => sum + s.chance, 0), total: rest.reduce((sum, s) => sum + s.total, 0),
    });
  }
  return result;
}

const point = (cx, cy, r, turn) => {
  const angle = turn * 2 * Math.PI - Math.PI / 2;
  return `${(cx + r * Math.cos(angle)).toFixed(2)} ${(cy + r * Math.sin(angle)).toFixed(2)}`;
};

export function wedge(start, end, r = 50, cx = 50, cy = 50) {
  const large = end - start > 0.5 ? 1 : 0;
  return `M${cx} ${cy} L${point(cx, cy, r, start)} A${r} ${r} 0 ${large} 1 ${point(cx, cy, r, end)} Z`;
}

export function pieSvg(slices, heroes, currency) {
  const parts = colouredSlices(slices, heroes);
  if (!parts.length) return '<div class="pie-empty">No hero yet</div>';
  let at = 0;
  const marks = parts.map((s) => {
    const title = `<title>${esc(s.label)}: ${percent(s.chance)} (${money(s.total, currency)})</title>`;
    if (s.chance > 0.9999) return `<circle cx="50" cy="50" r="50" style="fill:${s.colour}">${title}</circle>`;
    const d = wedge(at, at + s.chance);
    at += s.chance;
    return `<path d="${d}" style="fill:${s.colour}" stroke="var(--surface)" stroke-width="1">${title}</path>`;
  }).join('');
  const summary = parts.map((s) => `${s.label} ${percent(s.chance)}`).join(', ');
  return `<svg class="pie" viewBox="0 0 100 100" role="img" aria-label="${esc(summary)}">${marks}</svg>`;
}

export function legendHtml(slices, heroes, currency, limit = Infinity) {
  const colours = new Map(colouredSlices(slices, heroes).map((s) => [s.heroId, s.colour]));
  const rows = slices.slice(0, limit).map((s) => {
    const h = heroes.get(s.heroId);
    return `<li data-hero="${s.heroId}">
      <span class="swatch" style="background:${colours.get(s.heroId) ?? OTHER}"></span>
      ${h ? `<img src="${heroImg(h)}" alt="" loading="lazy">` : ''}
      <span class="name">${esc(h?.name ?? '?')}</span>
      <span class="num">${percent(s.chance)}</span>
      <span class="num muted">${money(s.total, currency)}</span>
    </li>`;
  }).join('');
  const more = slices.length > limit ? `<li class="muted">+${slices.length - limit} more</li>` : '';
  return `<ol class="legend">${rows}${more}</ol>`;
}

const BOX_H = 58;
const BOX_W = 200;
const GAP_X = 44;

/** Liquipedia-style columns. Slots are placed by bracket position, so byes leave gaps in round one. */
export function bracketHtml(data, heroes) {
  if (!data.games.length) return '<p class="muted">The bracket will appear here once players are set.</p>';
  const slots = 2 ** (data.rounds - 1);
  const height = slots * (BOX_H + 12);
  const width = data.rounds * (BOX_W + GAP_X);
  const place = (g) => {
    const span = height / (2 ** (data.rounds - g.round));
    return { x: (g.round - 1) * (BOX_W + GAP_X), y: span * (g.pos + 0.5) };
  };
  const lines = [];
  const boxes = data.games.map((g) => {
    const { x, y } = place(g);
    const target = data.games.find((n) => n.id === g.next);
    if (target) {
      const t = place(target);
      const midX = x + BOX_W + GAP_X / 2;
      lines.push(`<path d="M${x + BOX_W} ${y} H${midX} V${t.y} H${t.x}"/>`);
    }
    const row = (id, score) => `<div class="slot${g.winner && g.winner === id ? ' won' : ''}${g.winner && g.winner !== id ? ' lost' : ''}">
      <span class="pname">${esc(id === null ? 'TBD' : playerName(data, id))}</span>
      <span class="score">${g.status === 'done' ? score : ''}</span></div>`;
    const hero = g.draw ? heroes.get(g.draw.heroId) : null;
    return `<a class="match status-${g.status}" href="#game-${g.id}" style="left:${x}px;top:${y - BOX_H / 2}px;width:${BOX_W}px;height:${BOX_H}px">
      <span class="gid">${g.id}</span>
      ${hero ? `<img class="mhero" src="${heroImg(hero)}" alt="${esc(hero.name)}" title="${esc(hero.name)}">` : ''}
      ${row(g.a, g.scoreA)}${row(g.b, g.scoreB)}</a>`;
  }).join('');
  const heads = Array.from({ length: data.rounds }, (_, i) => {
    const { label, bestOf } = data.games.find((g) => g.round === i + 1);
    return `<div class="round-head" style="left:${i * (BOX_W + GAP_X)}px;width:${BOX_W}px">${label}<span class="muted"> Bo${bestOf}</span></div>`;
  }).join('');
  return `<div class="bracket-scroll"><div class="round-heads" style="width:${width}px">${heads}</div>
    <div class="bracket" style="width:${width}px;height:${height}px">
    <svg class="links" width="${width}" height="${height}">${lines.join('')}</svg>${boxes}</div></div>`;
}
