import { bracketHtml, esc, heroImg, legendHtml, money, pieSvg, playerName } from './shared.js';

const $ = (id) => document.getElementById(id);
const REFRESH_MS = 30_000;
const COMMENT_MAX = 150; // Tiltify's message limit
const HOW = {
  tag: 'Vote link', player: 'Player name', 'only-game': 'Only open game', 'existing-hero': 'Hero already in that pool',
  'next-game': 'Next game', admin: 'Set by admin', 'free-vote': 'Free Twitch vote',
};

let data;
let heroes = new Map();
let currentGame = null;
let chosenHero = null;

const cur = () => data.settings.currency;
const players = (g) => `${playerName(data, g.a)} vs ${playerName(data, g.b)}`;

function voteComment(g, hero) {
  const full = `Game ${g.id}: ${hero.name} (${players(g)})`;
  return full.length <= COMMENT_MAX ? full : `Game ${g.id}: ${hero.name}`;
}

function voteUrl(g, hero, amount) {
  const url = new URL(data.settings.campaignUrl);
  url.searchParams.set('amount', amount);
  url.searchParams.set('comment', voteComment(g, hero));
  return url.href;
}

function card(g) {
  const hero = g.draw ? heroes.get(g.draw.heroId) : null;
  return `<a class="card" href="#game-${g.id}">
    <div class="card-head"><span class="gid">Game ${g.id}</span><span class="muted">${esc(g.label)} · Bo${g.bestOf}</span>
      ${g.free ? '<span class="badge">Free vote</span>' : ''}</div>
    <h4>${esc(players(g))}</h4>
    ${g.time ? `<p class="muted small">${esc(new Date(g.time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))}</p>` : ''}
    ${hero
    ? `<div class="drawn"><img src="${heroImg(hero)}" alt=""><span>${esc(hero.name)}</span></div>`
    : `<div class="card-pie">${pieSvg(g.slices, heroes, cur())}
        ${g.slices.length ? legendHtml(g.slices, heroes, cur(), 6) : '<p>No heroes in the pool yet. Be the first.</p>'}</div>
        <span class="button primary">Pick a hero</span>`}
  </a>`;
}

function renderGames() {
  const open = data.games.filter((g) => g.status === 'open');
  const drawn = data.games.filter((g) => g.draw).sort((a, b) => b.id - a.id);
  $('games').hidden = $('tab-games').hidden = !open.length && !drawn.length;
  $('open-games').innerHTML = open.map(card).join('') || '<p class="muted">No games are open for voting right now.</p>';
  $('drawn-games').innerHTML = drawn.map(card).join('');
  $('drawn-title').hidden = !drawn.length;
}

function renderVotes() {
  $('votes').hidden = $('tab-votes').hidden = !data.votes.length;
  const needle = $('find-vote').value.trim().toLowerCase();
  const rows = data.votes.flatMap((v) => v.splits.map((s) => ({ ...v, split: s, hero: heroes.get(s.heroId)?.name ?? '?' })))
    .filter((v) => !needle || `${v.donor} ${v.hero} ${v.comment}`.toLowerCase().includes(needle))
    .slice(0, 300); // shortcut: shows the newest 300 matches, add paging if the log outgrows search.
  $('vote-log').innerHTML = `<thead><tr><th>Name</th><th>Amount</th><th>Hero</th><th>Game</th><th>How it was assigned</th><th>Comment</th></tr></thead>
    <tbody>${rows.map((v) => `<tr><td>${esc(v.donor)}</td><td>${money(v.split.amount, cur())}</td><td>${esc(v.hero)}</td>
      <td><a href="#game-${v.split.gameId}">Game ${v.split.gameId}</a></td><td>${esc(HOW[v.how] ?? '')}</td><td>${esc(v.comment)}</td></tr>`).join('')
      || '<tr><td colspan="6" class="muted">No votes yet.</td></tr>'}</tbody>`;
}

function renderRules() {
  const min = money(data.settings.minToShow, cur());
  $('rules-list').innerHTML = [
    'Mirror match: both players play the same hero, and a best-of-three series keeps one hero throughout.',
    'Games before the semi-finals don\'t use this site for drafts. Hero voting here is for the semi-finals and final.',
    'A game opens for voting once both players are known, and closes when its hero is drawn.',
    `A hero joins a game's possible hero pool once it has ${min} in votes. Smaller donations add up toward that.`,
    'More money means a better chance, with diminishing returns: chance follows the square root of each hero\'s total. £100 is only about twice as strong as £25.',
    'If only one hero is in the pool, that hero is drawn. If the pool is empty, any hero can be drawn.',
    'Each series has its own draw, so heroes can repeat, and the final can land on a semi-final\'s hero.',
    'Votes start fresh for each game. Nothing carries over.',
    'Some games may open for free votes in Twitch chat.',
    'All donations go to charity whatever happens in the game, including walkovers.',
  ].map((r) => `<li>${esc(r)}</li>`).join('');
}

function renderDialogPie() {
  const g = currentGame;
  const below = g.below.length
    ? `<p class="small muted">Almost in the pool: ${g.below.map((b) => `${esc(heroes.get(b.heroId)?.name)} (${money(b.total, cur())})`).join(', ')}</p>`
    : '';
  $('dialog-pie').innerHTML = `<div class="pie-big">${pieSvg(g.slices, heroes, cur())}</div>
    <div class="pie-side">${g.slices.length ? legendHtml(g.slices, heroes, cur()) : '<p class="muted">No hero is in the pool yet. Be the first.</p>'}${below}</div>`;
}

function renderVoteBar() {
  const amount = Number($('vote-amount').value);
  const link = $('vote-link');
  const ready = chosenHero && amount >= 1 && data.settings.campaignUrl;
  link.toggleAttribute('aria-disabled', !ready);
  link.classList.toggle('disabled', !ready);
  $('copy-vote').disabled = !chosenHero;
  if (ready) link.href = voteUrl(currentGame, chosenHero, amount); else link.removeAttribute('href');
  link.textContent = chosenHero ? `Donate ${money(amount || 0, cur())} on ${chosenHero.name}` : 'Pick a hero first';
  if (!data.settings.campaignUrl) $('vote-note').textContent = 'The donation page isn\'t live yet.';
  else if (chosenHero) $('vote-note').textContent = `Your vote text is filled in on Tiltify: "${voteComment(currentGame, chosenHero)}". Keep it in your message so your vote counts.`;
  else $('vote-note').textContent = '';
}

function renderHeroGrid() {
  const needle = $('hero-search').value.trim().toLowerCase();
  $('hero-grid').innerHTML = [...heroes.values()]
    .filter((h) => h.name.toLowerCase().includes(needle))
    .map((h) => `<button type="button" class="hero-pick${chosenHero?.id === h.id ? ' chosen' : ''}" data-hero="${h.id}" aria-pressed="${chosenHero?.id === h.id}">
      <img src="${heroImg(h)}" alt="" loading="lazy"><span>${esc(h.name)}</span></button>`).join('');
}

function choose(hero) {
  chosenHero = hero;
  for (const b of document.querySelectorAll('.hero-pick')) {
    const on = Number(b.dataset.hero) === hero.id;
    b.classList.toggle('chosen', on);
    b.setAttribute('aria-pressed', on);
  }
  renderVoteBar();
}

function openGame(id) {
  const g = data.games.find((x) => x.id === id);
  if (!g) return;
  currentGame = g;
  chosenHero = null;
  $('dialog-title').textContent = `Game ${g.id}: ${players(g)}`;
  const hero = g.draw ? heroes.get(g.draw.heroId) : null;
  const statusText = {
    open: 'Voting is open.', 'no-vote': 'This game doesn\'t use this site for its draft.', held: 'Voting opens soon.', waiting: 'Voting opens once both players are known.',
    drawn: `Hero drawn: ${hero?.name}.`, done: hero ? `Played on ${hero.name}.` : 'This game has finished.',
  }[g.status];
  $('dialog-sub').textContent = `${g.label}, best of ${g.bestOf}. ${statusText}`;
  renderDialogPie();
  $('dialog-pie').hidden = !g.vote;
  $('dialog-vote').hidden = g.status !== 'open';
  if (g.status === 'open') {
    $('hero-search').value = '';
    $('vote-amount').value = data.settings.defaultVote;
    renderHeroGrid();
    renderVoteBar();
  }
  if (!$('game-dialog').open) $('game-dialog').showModal();
}

function route() {
  const match = /^#game-(\d+)$/.exec(location.hash);
  if (match) openGame(Number(match[1]));
  else if ($('game-dialog').open) $('game-dialog').close();
}

async function refresh() {
  try {
    data = await (await fetch(`./data.json?t=${Date.now()}`)).json();
  } catch {
    return; // Keep showing the last good data.
  }
  document.title = data.settings.eventName;
  $('event-name').textContent = data.settings.eventName;
  $('charity').textContent = data.settings.charity ? `For ${data.settings.charity}` : '';
  $('start-note').textContent = data.settings.startNote;
  $('join').hidden = $('signup-top').hidden = !data.settings.signupUrl;
  for (const link of document.querySelectorAll('.signup')) link.href = data.settings.signupUrl;
  $('raised').textContent = money(data.raised, cur());
  $('goal-bar').value = data.raised;
  $('goal-percent').textContent = `${Math.floor((data.raised / $('goal-bar').max) * 100)}% of goal`;
  $('donate').hidden = !data.settings.campaignUrl;
  if (data.settings.campaignUrl) $('donate').href = data.settings.campaignUrl;
  $('updated').textContent = `Updated ${new Date(data.updated).toLocaleTimeString([], { timeStyle: 'short' })}. Hero pools refresh about every ${data.settings.publishMinutes} minutes during voting.`;
  renderGames();
  $('bracket-view').innerHTML = bracketHtml(data, heroes);
  renderVotes();
  renderRules();
  if ($('game-dialog').open && currentGame) {
    currentGame = data.games.find((g) => g.id === currentGame.id);
    renderDialogPie();
    if (currentGame.status !== 'open') openGame(currentGame.id);
  }
}

$('find-vote').addEventListener('input', renderVotes);
$('hero-search').addEventListener('input', renderHeroGrid);
$('vote-amount').addEventListener('input', renderVoteBar);
// Clears the hash without a jump, so closing a game keeps your place in the bracket.
function closeGame() {
  history.replaceState(null, '', location.pathname + location.search);
  $('game-dialog').close();
}
$('dialog-close').addEventListener('click', closeGame);
$('game-dialog').addEventListener('cancel', closeGame);
$('game-dialog').addEventListener('click', (e) => { if (e.target === $('game-dialog')) closeGame(); });
$('hero-grid').addEventListener('click', (e) => {
  const button = e.target.closest('.hero-pick');
  if (!button) return;
  choose(heroes.get(Number(button.dataset.hero)));
});
$('dialog-pie').addEventListener('click', (e) => {
  const row = e.target.closest('[data-hero]');
  if (!row || currentGame.status !== 'open') return;
  const hero = heroes.get(Number(row.dataset.hero));
  if (hero) choose(hero);
});
$('copy-vote').addEventListener('click', async () => {
  await navigator.clipboard.writeText(voteComment(currentGame, chosenHero));
  $('copy-vote').textContent = 'Copied';
  setTimeout(() => { $('copy-vote').textContent = 'Copy vote text'; }, 1500);
});
window.addEventListener('hashchange', route);

heroes = new Map((await (await fetch('./heroes.json')).json()).map((h) => [h.id, h]));
await refresh();
route();
setInterval(refresh, REFRESH_MS);
