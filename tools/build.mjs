#!/usr/bin/env node
// Générateur statique de KEDGE Revisions — aucune dépendance.
//   node tools/build.mjs
// Lit content/<matière>/subject.json et content/<matière>/<fiche>.html
// puis écrit les pages HTML + assets/data/*.json. Voir CLAUDE.md.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.env.KR_ROOT || path.join(import.meta.dirname, '..'));
const CONTENT = path.resolve(process.env.KR_CONTENT || path.join(ROOT, 'content'));
const OUT = path.resolve(process.env.KR_OUT || ROOT);
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));

// ---------- utilitaires ----------
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const fmtDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : ''; };
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
const hue = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

function parseFrontMatter(raw, file) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) throw new Error(`Front matter manquant : ${file}`);
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  return { meta, body: m[2] };
}

function plainText(html) {
  return html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

const TAB_LABELS = { fiche: 'Fiche', retenir: 'À retenir', flashcards: 'Flashcards', quiz: 'Quiz', exercices: 'Exercices' };
const TAB_ORDER = Object.keys(TAB_LABELS);
// ids + sommaire à partir des <h2>/<h3>, tableaux dans un conteneur scrollable
function enhanceBody(html) {
  const toc = []; const used = new Set();
  html = html.replace(/<h([23])(\s[^>]*)?>([\s\S]*?)<\/h\1>/g, (all, lvl, attrs = '', inner) => {
    const idm = /\sid="([^"]+)"/.exec(attrs);
    let id = idm ? idm[1] : slugify(plainText(inner)) || 'section';
    if (!idm) { let b = id, i = 2; while (used.has(id)) id = `${b}-${i++}`; }
    used.add(id);
    toc.push({ level: +lvl, id, text: plainText(inner) });
    return `<h${lvl}${idm ? attrs : `${attrs || ''} id="${id}"`}>${inner}</h${lvl}>`;
  });
  const tabs = [];
  html = html.replace(/<section([^>]*?)\sdata-tab="(\w+)"([^>]*)>/g, (all, a, key, b) => {
    if (!TAB_LABELS[key]) return all;
    tabs.push(key);
    return `<section${a} data-tab="${key}"${b} class="panel" id="tab-${key}" role="tabpanel">`;
  });
  html = html.replace(/<table[\s\S]*?<\/table>/g, (t) => `<div class="table-wrap" tabindex="0" role="region" aria-label="Tableau défilable">${t}</div>`);
  return { html, toc, tabs: TAB_ORDER.filter((k) => tabs.includes(k)) };
}

const needsMath = (html) => /\\\(|\\\[|class="[^"]*\bformula\b|data-math/.test(html);

// ---------- chargement du contenu ----------
const subjects = [];
const pages = [];
if (fs.existsSync(CONTENT)) {
  for (const dir of fs.readdirSync(CONTENT, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    const sj = path.join(CONTENT, dir, 'subject.json');
    if (!fs.existsSync(sj)) { console.warn(`! ${dir}: subject.json manquant, ignoré`); continue; }
    const s = { slug: dir, order: 100, ...JSON.parse(fs.readFileSync(sj, 'utf8')) };
    s.hue = s.hue ?? hue(dir);
    subjects.push(s);
    for (const f of fs.readdirSync(path.join(CONTENT, dir)).filter((f) => f.endsWith('.html')).sort()) {
      const file = path.join(CONTENT, dir, f);
      const { meta, body } = parseFrontMatter(fs.readFileSync(file, 'utf8'), file);
      if (!meta.title) throw new Error(`title manquant : ${file}`);
      const slug = f.replace(/\.html$/, '');
      const { html, toc, tabs } = enhanceBody(body);
      const text = plainText(body);
      pages.push({
        id: `${dir}/${slug}`, subject: dir, slug,
        kind: meta.kind === 'exercices' ? 'exercices' : 'fiche',
        title: meta.title, chapter: meta.chapter || '', order: Number(meta.order ?? 100),
        for: meta.for || '', summary: meta.summary || '',
        keywords: (meta.keywords || '').split(',').map((k) => k.trim()).filter(Boolean),
        sources: meta.sources || '', created: meta.created || '', updated: meta.updated || meta.created || '',
        cover: meta.cover || '', coverAlt: meta.coverAlt || '',
        html, toc, tabs, text, math: needsMath(body), minutes: Math.max(1, Math.round(text.split(' ').length / 200)),
        url: `subjects/${dir}/${slug}/`,
      });
    }
  }
}
subjects.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'fr'));
pages.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'fr'));
const subjectOf = (id) => subjects.find((s) => s.slug === id);
const pagesOf = (sl) => pages.filter((p) => p.subject === sl);
const fiches = (sl) => pagesOf(sl).filter((p) => p.kind === 'fiche');
for (const p of pages) {
  if (p.for && !pages.find((q) => q.subject === p.subject && q.slug === p.for)) console.warn(`! ${p.id}: "for: ${p.for}" introuvable`);
}

// ---------- gabarits ----------
const I = (n, c = '') => `<svg class="ic ${c}" aria-hidden="true" focusable="false"><use href="#i-${n}"/></svg>`;
const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<symbol id="i-home" viewBox="0 0 24 24"><path d="M3.5 10.8L12 3.5l8.5 7.3V19a1.5 1.5 0 01-1.5 1.5h-3.5V15h-7v5.5H5A1.5 1.5 0 013.5 19z"/></symbol>
<symbol id="i-list" viewBox="0 0 24 24"><rect x="4" y="3.5" width="16" height="17" rx="5"/><path d="M8.5 9.5h7M8.5 14h7"/></symbol>
<symbol id="i-dots" viewBox="0 0 24 24"><circle cx="7.5" cy="7.5" r="2.4"/><circle cx="16.5" cy="7.5" r="2.4"/><circle cx="7.5" cy="16.5" r="2.4"/><circle cx="16.5" cy="16.5" r="2.4"/></symbol>
<symbol id="i-heart" viewBox="0 0 24 24"><path d="M12 20.2S4 15.4 4 9.6A4.6 4.6 0 0112 7a4.6 4.6 0 018 2.6c0 5.8-8 10.6-8 10.6z"/></symbol>
<symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20.5 20.5L16 16"/></symbol>
<symbol id="i-sliders" viewBox="0 0 24 24"><path d="M4 8h5M15 8h5M4 16h9M19 16h1"/><circle cx="12" cy="8" r="2.6"/><circle cx="16" cy="16" r="2.6"/></symbol>
<symbol id="i-edit" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></symbol>
<symbol id="i-check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></symbol>
<symbol id="i-arrow-r" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>
<symbol id="i-back" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></symbol>
<symbol id="i-chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></symbol>
<symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></symbol>
<symbol id="i-refresh" viewBox="0 0 24 24"><path d="M3 12a9 9 0 0115.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 01-15.5 6.2L3 16"/><path d="M3 21v-5h5"/></symbol>
<symbol id="i-book" viewBox="0 0 24 24"><path d="M3.5 5.5Q8 4 12 6q4-2 8.5-.5v13Q16 17 12 19q-4-2-8.5-.5zM12 6v13"/></symbol>
<symbol id="i-chart" viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></symbol>
</defs></svg>`;

const media = (cover, alt, hue, base, eager = false) => cover
  ? `<img src="${base}${esc(cover)}" alt="${esc(alt || '')}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`
  : `<div class="ph" style="--h:${hue}" aria-hidden="true"></div>`;
const heart = (id, label) => `<button type="button" class="round heart" data-fav="${esc(id)}" aria-pressed="false" aria-label="Ajouter aux favoris : ${esc(label)}">${I('heart')}</button>`;
const coverOf = (p) => p.cover || subjectOf(p.subject).cover || '';
const altOf = (p) => (p.cover ? p.coverAlt : subjectOf(p.subject).coverAlt) || '';

function layout({ title, desc, base, active, body, math = false, pageId = '', ogImage = '', view = '', noDock = false }) {
  const full = title === CFG.name ? title : `${title} · ${CFG.name}`;
  const abs = (CFG.siteUrl || '').replace(/\/$/, '');
  const nav = [
    ['home', 'Accueil', '', 'home'],
    ['courses', 'Cours', 'subjects/', 'list'],
    ['reviews', 'Révisions', 'progress/', 'dots'],
    ['favs', 'Favoris', 'favorites/', 'heart'],
  ];
  const link = ([k, label, href, ic]) => `<a class="dk${active === k ? ' is-active' : ''}" href="${base}${href}"${active === k ? ' aria-current="page"' : ''}><i>${I(ic)}</i><span class="dk-l">${label}</span></a>`;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(full)}</title>
<meta name="description" content="${esc(desc || CFG.description)}">
<meta name="theme-color" content="#ffffff">
<meta name="color-scheme" content="light">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(CFG.name)}">
<meta property="og:title" content="${esc(full)}">
<meta property="og:description" content="${esc(desc || CFG.description)}">
<meta property="og:image" content="${abs}/${ogImage || 'assets/icons/icon-512.png'}">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${esc(CFG.shortName)}">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="manifest" href="${base}manifest.webmanifest">
<link rel="icon" href="${base}assets/icons/favicon.svg" type="image/svg+xml">
<link rel="icon" href="${base}assets/icons/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="${base}assets/icons/apple-touch-icon.png">
<link rel="stylesheet" href="${base}assets/css/style.css?v=${CFG.assetVersion}">
${math ? `<link rel="stylesheet" href="${base}assets/vendor/katex/katex.min.css">` : ''}
</head>
<body class="${view}${noDock ? ' no-dock' : ''}" data-base="${base}" data-user="${esc(CFG.userName || '')}" data-page-id="${esc(pageId)}"${math ? ' data-math="1"' : ''}>
${SPRITE}
<a class="skip" href="#main">Aller au contenu</a>
<header class="deskbar"><a class="brand" href="${base}"><img src="${base}assets/icons/favicon.svg" alt="" width="36" height="36"><span>${esc(CFG.name)}</span></a>
  <a class="avatar" href="${base}progress/" aria-label="Mes révisions">${esc((CFG.userName || 'E')[0])}</a></header>
<main id="main" tabindex="-1">
${body}
</main>
<nav class="dock" aria-label="Navigation principale">${nav.map(link).join('')}</nav>
${math ? `<script src="${base}assets/vendor/katex/katex.min.js" defer></script><script src="${base}assets/vendor/katex/auto-render.min.js" defer></script>` : ''}
<script src="${base}assets/js/app.js?v=${CFG.assetVersion}" defer></script>
</body>
</html>
`;
}

// Grande carte visuelle (matière) — style « Rio de Janeiro »
function subjectCard(s, base) {
  const n = fiches(s.slug).length;
  const ex = pagesOf(s.slug).filter((p) => p.kind === 'exercices').length;
  const upd = pagesOf(s.slug).map((p) => p.updated).sort().pop();
  return `<article class="scard" data-subject="${s.slug}" style="--h:${s.hue}">
  <div class="scard-media">${media(s.cover, s.coverAlt, s.hue, base)}</div>
  ${heart('s:' + s.slug, s.title)}
  <div class="scard-in">
    <p class="eyebrow">Matière</p>
    <h3>${esc(s.title)}</h3>
    <p class="meta">${plural(n, 'fiche', 'fiches')}${ex ? ` · ${plural(ex, 'exercice', 'exercices')}` : ''}${upd ? ` · mis à jour le ${fmtDate(upd)}` : ''}</p>
    <a class="cta-soft stretch" href="${base}subjects/${s.slug}/"><span>Voir la matière</span><i class="circle">${I('arrow-r')}</i></a>
  </div></article>`;
}

// Carte de fiche (scroll horizontal) — style « Upcoming tours »
function tCard(p, base) {
  return `<article class="tcard" style="--h:${subjectOf(p.subject).hue}">
  <div class="tcard-media">${media(coverOf(p), altOf(p), subjectOf(p.subject).hue, base)}${heart(p.id, p.title)}<span class="tag">${p.kind === 'exercices' ? 'Exercices' : 'Fiche'}</span></div>
  <div class="tcard-body"><h3>${esc(p.title)}</h3><p class="meta">${I('clock')} ${p.minutes} min${p.summary ? ` · ${esc(p.summary)}` : ''}</p></div>
  <a class="circle dark stretch" href="${base}${p.url}" aria-label="Ouvrir : ${esc(p.title)}">${I('arrow-r')}</a></article>`;
}

// Ligne compacte (listes, résultats)
function row(p, base, extra = '') {
  const s = subjectOf(p.subject);
  return `<a class="row" href="${base}${p.url}"><span class="thumb">${media(coverOf(p), '', s.hue, base)}</span>
  <span class="row-b"><span class="meta">${esc(s.title)}${p.chapter ? ` · ${esc(p.chapter)}` : ''}</span><strong>${esc(p.title)}</strong>${extra}</span>
  <i class="circle dark sm">${I('arrow-r')}</i></a>`;
}
const mini = (p, base) => {
  const s = subjectOf(p.subject);
  return `<a class="mini" href="${base}${p.url}"><span class="thumb">${media(coverOf(p), '', s.hue, base)}</span><span class="row-b"><span class="meta">${esc(s.title)}</span><strong>${esc(p.title)}</strong></span></a>`;
};
const WELCOME = (t, msg) => `<div class="welcome"><i class="circle">${I('book')}</i><h3>${t}</h3><p>${msg}</p></div>`;
const EMPTY = () => WELCOME('Ta bibliothèque est prête', 'Aucune matière pour l’instant. Envoie tes premiers cours : chaque document deviendra une fiche de révision avec flashcards, quiz et exercices corrigés.');
const searchBox = (id, ph, action) => `<form class="searchbox" role="search" action="${action}" method="get"><label class="sr" for="${id}">Rechercher une fiche, une matière ou un mot-clé</label>${I('search')}<input id="${id}" name="q" type="search" placeholder="${ph}" autocomplete="off" enterkeyhint="search"><button class="circle dark" type="submit" aria-label="Lancer la recherche">${I('sliders')}</button></form>`;

// ---------- écriture ----------
const written = [];
function write(rel, content) {
  const f = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
  written.push(rel);
}
if (OUT !== ROOT) {
  for (const p of ['assets', 'manifest.webmanifest', 'sw.js']) fs.cpSync(path.join(ROOT, p), path.join(OUT, p), { recursive: true });
}
for (const d of ['subjects', 'exercises', 'search', 'progress', 'favorites']) fs.rmSync(path.join(OUT, d), { recursive: true, force: true });

// Accueil
{
  const base = './';
  const recent = pages.filter((p) => p.kind === 'fiche').sort((a, b) => (b.updated || '').localeCompare(a.updated || '') || b.order - a.order).slice(0, 8);
  const body = `
<header class="greet"><div><h1>Bonjour ${esc(CFG.userName || '')}</h1><p>Prêt pour une session de révision&nbsp;?</p></div>
  <a class="avatar" href="${base}progress/" aria-label="Mes révisions">${esc((CFG.userName || 'E')[0])}</a></header>
<div class="search" data-search data-limit="6">${searchBox('q-home', 'Rechercher', base + 'search/')}<div class="search-results" data-results aria-live="polite"></div></div>

<section class="block" data-continue hidden aria-labelledby="h-cont"><h2 id="h-cont">Continuer à réviser</h2><div data-continue-card></div></section>

<section class="block" aria-labelledby="h-subjects"><div class="block-head"><h2 id="h-subjects">Mes matières</h2></div>
  ${subjects.length ? `<div class="pills" role="group" aria-label="Filtrer par matière"><button type="button" class="pill is-on" data-filter="all" aria-pressed="true">Toutes</button>${subjects.map((s) => `<button type="button" class="pill" data-filter="${s.slug}" aria-pressed="false">${esc(s.title)}</button>`).join('')}</div>
  <div class="hscroll hscroll-big" data-subject-list>${subjects.map((s) => subjectCard(s, base)).join('')}</div>` : EMPTY()}
</section>

<section class="block" data-todo hidden aria-labelledby="h-todo"><div class="block-head"><h2 id="h-todo">À réviser</h2><a class="more" href="${base}progress/">Tout voir</a></div><div class="list" data-todo-list></div></section>
${recent.length ? `<section class="block" aria-labelledby="h-new"><h2 id="h-new">Récemment ajouté</h2><div class="hscroll">${recent.map((p) => mini(p, base)).join('')}</div></section>` : ''}`;
  write('index.html', layout({ title: CFG.name, desc: CFG.description, base, active: 'home', body, view: 'v-home' }));
}

// Cours (liste des matières)
{
  const base = '../';
  const body = `<header class="head"><h1>Cours</h1><p>${subjects.length ? plural(subjects.length, 'matière', 'matières') : 'Tes matières apparaîtront ici'}</p></header>
<div class="search" data-search data-limit="8">${searchBox('q-c', 'Rechercher', base + 'search/')}<div class="search-results" data-results aria-live="polite"></div></div>
<section class="block">${subjects.length ? `<div class="stack">${subjects.map((s) => subjectCard(s, base)).join('')}</div>` : EMPTY()}</section>`;
  write('subjects/index.html', layout({ title: 'Cours', desc: 'Toutes les matières de ta bibliothèque de révision.', base, active: 'courses', body, view: 'v-list' }));
}

// Page matière — hero immersif + panneau blanc
for (const s of subjects) {
  const base = '../../';
  const fs_ = fiches(s.slug);
  const exos = pagesOf(s.slug).filter((p) => p.kind === 'exercices');
  const groups = [];
  for (const p of fs_) {
    const name = p.chapter || 'Fiches';
    let g = groups.find((x) => x.name === name);
    if (!g) groups.push((g = { name, id: `${s.slug}/${slugify(name)}`, items: [], order: p.order }));
    g.items.push(p);
  }
  groups.sort((a, b) => a.order - b.order);
  const loose = exos.filter((e) => !e.for || !fs_.find((p) => p.slug === e.for));
  const body = `<div class="hero-img" style="--h:${s.hue}">${media(s.cover, s.coverAlt, s.hue, base, true)}
  <a class="round back" href="${base}subjects/" aria-label="Retour aux cours">${I('back')}</a>${heart('s:' + s.slug, s.title)}</div>
<div class="sheet">
  <h1>${esc(s.title)}</h1>
  <p class="meta">${plural(fs_.length, 'fiche', 'fiches')}${exos.length ? ` · ${plural(exos.length, 'exercice', 'exercices')}` : ''}</p>
  ${s.description ? `<p class="lead">${esc(s.description)}</p>` : ''}
  <div class="progress-line" data-subject-progress="${s.slug}" data-ids="${fs_.map((p) => p.id).join(',')}" hidden><div class="bar"><i></i></div><span></span></div>
  ${groups.length ? groups.map((g) => `<section class="block chapter" data-chapter="${g.id}"><div class="block-head"><h2>${esc(g.name)}</h2><button type="button" class="pill pill-check" data-master="${g.id}" aria-pressed="false">${I('check')}<span>Maîtrisé</span></button></div>
    <div class="hscroll hscroll-t">${g.items.map((p) => tCard(p, base)).join('')}${exos.filter((e) => e.for && g.items.some((p) => p.slug === e.for)).map((e) => tCard(e, base)).join('')}</div></section>`).join('') : WELCOME('Pas encore de fiche', 'Cette matière n’a pas encore de fiche.')}
  ${loose.length ? `<section class="block"><h2>Exercices</h2><div class="hscroll hscroll-t">${loose.map((p) => tCard(p, base)).join('')}</div></section>` : ''}
</div>
${fs_.length ? `<div class="cta-bar"><a class="cta" href="${base}${fs_[0].url}" data-cta-subject data-urls="${fs_.map((p) => p.url).join(',')}" data-ids="${fs_.map((p) => p.id).join(',')}"><span>Commencer la révision</span></a></div>` : ''}`;
  write(`subjects/${s.slug}/index.html`, layout({ title: s.title, desc: s.description || `Fiches de révision : ${s.title}`, base, active: 'courses', body, ogImage: s.cover, view: 'v-subject', noDock: true }));
}

// Fiches et exercices
for (const p of pages) {
  const s = subjectOf(p.subject);
  const base = '../../../';
  const siblings = fiches(p.subject);
  const idx = siblings.findIndex((x) => x.id === p.id);
  const prev = p.kind === 'fiche' && idx > 0 ? siblings[idx - 1] : null;
  const next = p.kind === 'fiche' && idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
  const exos = p.kind === 'fiche' ? pagesOf(p.subject).filter((e) => e.kind === 'exercices' && e.for === p.slug) : [];
  const parent = p.kind === 'exercices' && p.for ? pages.find((q) => q.subject === p.subject && q.slug === p.for) : null;
  const tocHtml = p.toc.filter((t) => t.level === 2).length >= 3 ? `<details class="toc"><summary>Sommaire ${I('chev')}</summary><ol>${p.toc.filter((t) => t.level === 2).map((t) => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`).join('')}</ol></details>` : '';
  const dates = [p.created && `Créée le ${fmtDate(p.created)}`, p.updated && p.updated !== p.created && `mise à jour le ${fmtDate(p.updated)}`].filter(Boolean);
  const tabKeys = p.tabs;
  const hasExoTab = exos.length > 0 && !tabKeys.includes('exercices');
  const showTabs = tabKeys.length + (hasExoTab ? 1 : 0) >= 2;
  const tabs = showTabs ? `<div class="tabs" role="tablist" aria-label="Sections de la fiche">${tabKeys.map((k, i) => `<button type="button" role="tab" class="tab${i === 0 ? ' is-on' : ''}" data-tab-btn="${k}" aria-selected="${i === 0}" aria-controls="tab-${k}" id="tb-${k}">${TAB_LABELS[k]}</button>`).join('')}${hasExoTab ? `<a class="tab tab-link" href="${base}${exos[0].url}">Exercices ${I('arrow-r')}</a>` : ''}</div>` : '';
  const cover = p.cover ? `<div class="doc-cover">${media(p.cover, p.coverAlt, s.hue, base, true)}</div>` : '';
  const back = parent ? parent.url : `subjects/${s.slug}/`;
  const body = `<header class="fh"><a class="round" href="${base}${back}" aria-label="${parent ? 'Retour à la fiche' : 'Retour à la matière'}">${I('back')}</a>
  <div class="fh-t"><h1>${esc(p.title)}</h1><p>${esc(s.title)}${p.chapter ? ` · ${esc(p.chapter)}` : ''}</p></div>${heart(p.id, p.title)}</header>
${tabs}
<article class="doc" data-article${showTabs ? ' data-has-tabs' : ''}>
  <div class="doc-head" data-doc-head>
  ${cover}
  <p class="doc-meta"><span class="chip">${I('clock')} ${p.minutes} min</span><span class="chip">${p.kind === 'exercices' ? 'Exercices' : 'Fiche'}</span>${p.summary ? `<span class="doc-sum">${esc(p.summary)}</span>` : ''}</p>
  ${tocHtml}
  </div>
  <div class="prose">
${p.html}
  </div>
  ${exos.length ? `<section class="related"><h2>Exercices associés</h2><div class="list">${exos.map((e) => row(e, base)).join('')}</div></section>` : ''}
  ${prev || next ? `<nav class="pn" aria-label="Fiches précédente et suivante">${prev ? `<a class="pn-prev" href="${base}${prev.url}"><i class="circle">${I('back')}</i><span><small>Précédente</small>${esc(prev.title)}</span></a>` : '<span></span>'}${next ? `<a class="pn-next" href="${base}${next.url}"><span><small>Suivante</small>${esc(next.title)}</span><i class="circle">${I('arrow-r')}</i></a>` : '<span></span>'}</nav>` : ''}
  <footer class="provenance">${p.sources ? `<p><strong>Sources du cours :</strong> ${esc(p.sources)}</p>` : ''}${dates.length ? `<p>${dates.join(' · ')}</p>` : ''}</footer>
</article>
${p.kind === 'fiche' ? `<div class="cta-bar"><button type="button" class="cta" data-reviewed aria-pressed="false">${I('check')}<span>Marquer comme révisée</span></button></div>` : parent ? `<div class="cta-bar"><a class="cta" href="${base}${parent.url}"><span>Retour à la fiche</span></a></div>` : ''}`;
  write(p.url + 'index.html', layout({ title: `${p.title} — ${s.title}`, desc: p.summary || `${p.title} (${s.title})`, base, active: p.kind === 'exercices' ? 'reviews' : 'courses', body, math: p.math, pageId: p.id, ogImage: p.cover || s.cover, view: 'v-fiche', noDock: true }));
}

// Exercices
{
  const base = '../';
  const exos = pages.filter((p) => p.kind === 'exercices');
  const bySub = subjects.map((s) => ({ s, list: exos.filter((e) => e.subject === s.slug) })).filter((x) => x.list.length);
  const body = `<header class="head"><a class="round" href="${base}progress/" aria-label="Retour aux révisions">${I('back')}</a><h1>Exercices</h1><p>QCM, flashcards et exercices corrigés.</p></header>
${bySub.length ? bySub.map(({ s, list }) => `<section class="block"><h2>${esc(s.title)}</h2><div class="list">${list.map((p) => row(p, base)).join('')}</div></section>`).join('') : WELCOME('Pas encore d’exercices', 'Les exercices d’entraînement et leurs corrections apparaîtront ici avec tes premiers cours.')}`;
  write('exercises/index.html', layout({ title: 'Exercices', desc: 'Zone d’entraînement.', base, active: 'reviews', body, view: 'v-list' }));
}

// Recherche
write('search/index.html', layout({
  title: 'Recherche', desc: 'Recherche dans toutes tes fiches.', base: '../', active: 'courses', view: 'v-list',
  body: `<header class="head"><a class="round" href="../" aria-label="Retour">${I('back')}</a><h1>Recherche</h1><p>Titre, matière, chapitre, mot-clé ou contenu.</p></header>
<div class="search" data-search data-limit="40" data-autofocus>${searchBox('q-page', 'Ex. : VAN, segmentation…', '')}<div class="search-results" data-results aria-live="polite"></div></div>`,
}));

// Révisions (suivi)
write('progress/index.html', layout({
  title: 'Révisions', desc: 'Ton suivi de révision.', base: '../', active: 'reviews', view: 'v-list',
  body: `<header class="head"><h1>Révisions</h1><p>Ton suivi, stocké uniquement sur cet appareil.</p></header>
<a class="row row-link" href="../exercises/"><span class="thumb thumb-dark">${I('edit')}</span><span class="row-b"><strong>Exercices</strong><span class="meta">QCM, flashcards et exercices corrigés</span></span><i class="circle dark sm">${I('arrow-r')}</i></a>
<div data-progress-root>
  <section class="block" data-todo-all hidden><h2>À réviser</h2><div class="list" data-todo-list></div></section>
  <section class="block" data-quiz-all hidden><h2>Résultats de QCM</h2><div class="list" data-quiz-list></div></section>
  <section class="block" data-done-all hidden><h2>Fiches révisées</h2><div class="list" data-done-list></div></section>
  <section class="block" data-mastered-all hidden><h2>Chapitres maîtrisés</h2><div class="list" data-mastered-list></div></section>
  <div data-progress-empty class="block">${WELCOME('Rien à suivre pour l’instant', 'Ouvre une fiche : elle apparaîtra ici. Tu pourras la marquer comme révisée et suivre tes résultats de QCM.')}</div>
  <p class="reset"><button type="button" class="cta-soft light" data-reset><span>Réinitialiser mon suivi</span></button></p>
</div>`,
}));

// Favoris
write('favorites/index.html', layout({
  title: 'Favoris', desc: 'Tes fiches et matières favorites.', base: '../', active: 'favs', view: 'v-list',
  body: `<header class="head"><h1>Favoris</h1><p>Retrouve vite ce qui compte le plus.</p></header>
<section class="block" data-fav-subjects hidden><h2>Matières</h2><div class="hscroll hscroll-big" data-fav-subjects-list></div></section>
<section class="block" data-fav-pages hidden><h2>Fiches</h2><div class="list" data-fav-pages-list></div></section>
<div data-fav-empty class="block">${WELCOME('Aucun favori', 'Touche le cœur d’une matière ou d’une fiche pour la retrouver ici.')}</div>`,
}));

// 404
{
  const bp = (CFG.basePath || '').replace(/\/$/, '');
  write('404.html', layout({ title: 'Page introuvable', desc: 'Page introuvable', base: `${bp}/`, active: '', view: 'v-list', body: `<div class="block">${WELCOME('Page introuvable', 'Cette page n’existe pas (ou plus).')}<div class="cta-bar cta-inline"><a class="cta" href="${bp}/"><span>Retour à l’accueil</span></a></div></div>` }));
}

// Données JS
const meta = pages.map((p) => ({ id: p.id, url: p.url, title: p.title, subject: p.subject, subjectTitle: subjectOf(p.subject).title, hue: subjectOf(p.subject).hue, cover: coverOf(p), chapter: p.chapter, kind: p.kind, summary: p.summary, keywords: p.keywords, updated: p.updated, order: p.order, minutes: p.minutes }));
const subjMeta = subjects.map((s) => ({ slug: s.slug, title: s.title, cover: s.cover || '', coverAlt: s.coverAlt || '', hue: s.hue, count: fiches(s.slug).length }));
write('assets/data/library.json', JSON.stringify({ subjects: subjMeta, pages: meta }));
write('assets/data/search.json', JSON.stringify(Object.fromEntries(pages.map((p) => [p.id, p.text.slice(0, 8000)]))));

console.log(`✓ ${subjects.length} matière(s), ${pages.length} page(s) — ${written.length} fichiers écrits dans ${OUT}`);
