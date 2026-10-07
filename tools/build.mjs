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
  html = html.replace(/<table[\s\S]*?<\/table>/g, (t) => `<div class="table-wrap" tabindex="0" role="region" aria-label="Tableau défilable">${t}</div>`);
  return { html, toc };
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
      const { html, toc } = enhanceBody(body);
      const text = plainText(body);
      pages.push({
        id: `${dir}/${slug}`, subject: dir, slug,
        kind: meta.kind === 'exercices' ? 'exercices' : 'fiche',
        title: meta.title, chapter: meta.chapter || '', order: Number(meta.order ?? 100),
        for: meta.for || '', summary: meta.summary || '',
        keywords: (meta.keywords || '').split(',').map((k) => k.trim()).filter(Boolean),
        sources: meta.sources || '', created: meta.created || '', updated: meta.updated || meta.created || '',
        cover: meta.cover || '', coverAlt: meta.coverAlt || '',
        html, toc, text, math: needsMath(body), minutes: Math.max(1, Math.round(text.split(' ').length / 200)),
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
<symbol id="i-home" viewBox="0 0 24 24"><path d="M3 11l9-8 9 8"/><path d="M5 9.5V20h14V9.5"/></symbol>
<symbol id="i-grid" viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/></symbol>
<symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20.5 20.5L16 16"/></symbol>
<symbol id="i-edit" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></symbol>
<symbol id="i-chart" viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></symbol>
<symbol id="i-check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></symbol>
<symbol id="i-arrow-r" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>
<symbol id="i-arrow-l" viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6"/></symbol>
<symbol id="i-chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></symbol>
<symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></symbol>
<symbol id="i-refresh" viewBox="0 0 24 24"><path d="M3 12a9 9 0 0115.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 01-15.5 6.2L3 16"/><path d="M3 21v-5h5"/></symbol>
<symbol id="i-book" viewBox="0 0 24 24"><path d="M3.5 5.5Q8 4 12 6q4-2 8.5-.5v13Q16 17 12 19q-4-2-8.5-.5zM12 6v13"/></symbol>
<symbol id="i-flag" viewBox="0 0 24 24"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></symbol>
</defs></svg>`;

function layout({ title, desc, base, active, body, math = false, pageId = '', ogImage = '' }) {
  const full = title === CFG.name ? title : `${title} · ${CFG.name}`;
  const abs = (CFG.siteUrl || '').replace(/\/$/, '');
  const nav = [
    ['home', 'Accueil', '', 'home'],
    ['subjects', 'Matières', 'subjects/', 'grid'],
    ['exercises', 'Exercices', 'exercises/', 'edit'],
    ['search', 'Recherche', 'search/', 'search'],
    ['progress', 'Suivi', 'progress/', 'chart'],
  ];
  const link = ([k, label, href, ic], cls) => `<a class="${cls}${active === k ? ' is-active' : ''}" href="${base}${href}"${active === k ? ' aria-current="page"' : ''}>${I(ic)}<span>${label}</span></a>`;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(full)}</title>
<meta name="description" content="${esc(desc || CFG.description)}">
<meta name="theme-color" content="#f4f4f5" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#111113" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light dark">
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
<body data-base="${base}" data-page-id="${esc(pageId)}"${math ? ' data-math="1"' : ''}>
${SPRITE}
<a class="skip" href="#main">Aller au contenu</a>
<div class="app">
  <aside class="side" aria-label="Navigation principale">
    <a class="brand" href="${base}"><img src="${base}assets/icons/favicon.svg" alt="" width="36" height="36"><span>${esc(CFG.name)}</span></a>
    <nav class="side-nav">${nav.map((n) => link(n, 'side-link')).join('')}</nav>
    <p class="side-foot">Appuie sur <kbd>/</kbd> pour chercher</p>
  </aside>
  <div class="col">
    <header class="topbar"><a class="brand brand-sm" href="${base}"><img src="${base}assets/icons/favicon.svg" alt="" width="30" height="30"><span>${esc(CFG.name)}</span></a>
      <a class="icon-btn" href="${base}search/" aria-label="Rechercher">${I('search')}</a></header>
    <main id="main" tabindex="-1">
${body}
    </main>
    <footer class="foot"><span>${esc(CFG.name)} · usage personnel</span></footer>
  </div>
</div>
<nav class="tabbar" aria-label="Navigation principale">${nav.filter((n) => n[0] !== 'exercises').map((n) => link(n, 'tab')).join('')}</nav>
${math ? `<script src="${base}assets/vendor/katex/katex.min.js" defer></script><script src="${base}assets/vendor/katex/auto-render.min.js" defer></script>` : ''}
<script src="${base}assets/js/app.js?v=${CFG.assetVersion}" defer></script>
</body>
</html>
`;
}

const coverStyle = (s) => (s.cover ? '' : ` style="--h:${s.hue}"`);

function subjectCard(s, base) {
  const n = fiches(s.slug).length;
  const img = s.cover ? `<img src="${base}${esc(s.cover)}" alt="${esc(s.coverAlt || '')}" loading="lazy" decoding="async" width="800" height="600">` : '';
  return `<a class="scard${s.cover ? '' : ' scard-plain'}" href="${base}subjects/${s.slug}/" data-subject="${s.slug}"${coverStyle(s)}>
  ${img}<div class="scard-in"><span class="pill pill-glass">${plural(n, 'fiche', 'fiches')}</span>
  <div><h3>${esc(s.title)}</h3>${s.description ? `<p>${esc(s.description)}</p>` : ''}</div></div>
  <span class="scard-go" aria-hidden="true">${I('arrow-r')}</span></a>`;
}

function pageCard(p, base) {
  const s = subjectOf(p.subject);
  return `<a class="pcard" href="${base}${p.url}">
  <span class="pcard-kind">${p.kind === 'exercices' ? I('edit') : I('book')}</span>
  <span class="pcard-body"><span class="pcard-meta">${esc(s.title)}${p.chapter ? ` · ${esc(p.chapter)}` : ''}</span>
  <strong>${esc(p.title)}</strong>${p.summary ? `<span class="pcard-sum">${esc(p.summary)}</span>` : ''}</span>
  <span class="pcard-go" aria-hidden="true">${I('arrow-r')}</span></a>`;
}

const EMPTY = (base) => `<div class="empty"><div class="empty-ic">${I('book')}</div>
  <h3>Ta bibliothèque est prête</h3>
  <p>Aucune matière pour l’instant. Envoie tes premiers cours (PDF, slides, Word, Excel…) : chaque cours deviendra une fiche de révision, avec exercices et corrections.</p></div>`;

// ---------- écriture ----------
const written = [];
function write(rel, content) {
  const f = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
  written.push(rel);
}

// copie des fichiers statiques si OUT ≠ ROOT (tests)
if (OUT !== ROOT) {
  for (const p of ['assets', 'manifest.webmanifest', 'sw.js']) fs.cpSync(path.join(ROOT, p), path.join(OUT, p), { recursive: true });
}
// nettoyage du contenu généré
for (const d of ['subjects', 'exercises', 'search', 'progress']) fs.rmSync(path.join(OUT, d), { recursive: true, force: true });

// Accueil
{
  const base = './';
  const recent = [...pages].filter((p) => p.kind === 'fiche').sort((a, b) => (b.updated || '').localeCompare(a.updated || '') || b.order - a.order).slice(0, 4);
  const body = `
<section class="hero">
  <div class="hero-glow" aria-hidden="true"></div>
  <p class="eyebrow">KEDGE Business School</p>
  <h1>Prêt à réviser&nbsp;?</h1>
  <p class="hero-sub">Toutes tes fiches, exercices et corrections au même endroit.</p>
  <div class="search" data-search data-limit="6">
    <form class="searchbox" role="search" action="${base}search/" method="get">
      <label class="sr" for="q-home">Rechercher une fiche, une matière ou un mot-clé</label>
      ${I('search')}
      <input id="q-home" name="q" type="search" placeholder="Rechercher une fiche" autocomplete="off" enterkeyhint="search">
    </form>
    <div class="search-results" data-results aria-live="polite"></div>
  </div>
</section>

<section class="block" aria-labelledby="h-subjects">
  <div class="block-head"><h2 id="h-subjects">Matières</h2>${subjects.length ? `<a class="more" href="${base}subjects/">Tout voir ${I('arrow-r')}</a>` : ''}</div>
  ${subjects.length ? `<div class="chips" role="list">${subjects.map((s) => `<a role="listitem" class="chip" href="${base}subjects/${s.slug}/">${esc(s.title)}</a>`).join('')}</div>
  <div class="grid grid-subjects">${subjects.map((s) => subjectCard(s, base)).join('')}</div>` : EMPTY(base)}
</section>

<section class="block" data-todo hidden aria-labelledby="h-todo">
  <div class="block-head"><h2 id="h-todo">À réviser</h2><a class="more" href="${base}progress/">Suivi ${I('arrow-r')}</a></div>
  <div class="list" data-todo-list></div>
</section>

<section class="block" data-viewed hidden aria-labelledby="h-viewed">
  <div class="block-head"><h2 id="h-viewed">Consultées récemment</h2></div>
  <div class="list" data-viewed-list></div>
</section>

${recent.length ? `<section class="block" aria-labelledby="h-new">
  <div class="block-head"><h2 id="h-new">Ajoutées récemment</h2></div>
  <div class="list">${recent.map((p) => pageCard(p, base)).join('')}</div>
</section>` : ''}`;
  write('index.html', layout({ title: CFG.name, desc: CFG.description, base, active: 'home', body }));
}

// Liste des matières
{
  const base = '../';
  const body = `<header class="page-head"><h1>Matières</h1><p>${subjects.length ? plural(subjects.length, 'matière', 'matières') : 'Aucune matière pour le moment'}</p></header>
${subjects.length ? `<div class="grid grid-subjects">${subjects.map((s) => subjectCard(s, base)).join('')}</div>` : EMPTY(base)}`;
  write('subjects/index.html', layout({ title: 'Matières', desc: 'Toutes les matières de ta bibliothèque de révision.', base, active: 'subjects', body }));
}

// Page matière
for (const s of subjects) {
  const base = '../../';
  const fs_ = fiches(s.slug);
  const groups = [];
  for (const p of fs_) {
    const name = p.chapter || 'Fiches';
    let g = groups.find((x) => x.name === name);
    if (!g) groups.push((g = { name, id: `${s.slug}/${slugify(name)}`, items: [], order: p.order }));
    g.items.push(p);
  }
  groups.sort((a, b) => a.order - b.order);
  const exos = pagesOf(s.slug).filter((p) => p.kind === 'exercices');
  const exoFor = (p) => exos.filter((e) => e.for === p.slug);
  const hero = s.cover
    ? `<div class="banner"><img src="${base}${esc(s.cover)}" alt="${esc(s.coverAlt || '')}" decoding="async" fetchpriority="high"><div class="banner-in">`
    : `<div class="banner banner-plain" style="--h:${s.hue}"><div class="banner-in">`;
  const body = `<nav class="crumbs" aria-label="Fil d’Ariane"><a href="${base}">Accueil</a><span>/</span><a href="${base}subjects/">Matières</a><span>/</span><span aria-current="page">${esc(s.title)}</span></nav>
${hero}<span class="pill pill-glass">${plural(fs_.length, 'fiche', 'fiches')}${exos.length ? ` · ${plural(exos.length, 'exercice', 'exercices')}` : ''}</span><h1>${esc(s.title)}</h1>${s.description ? `<p>${esc(s.description)}</p>` : ''}</div></div>
<div class="progress-line" data-subject-progress="${s.slug}" data-ids="${fs_.map((p) => p.id).join(',')}" hidden><div class="bar"><i></i></div><span></span></div>
${groups.length ? groups.map((g) => `<section class="block chapter" data-chapter="${g.id}">
  <div class="block-head"><h2>${esc(g.name)}</h2><button type="button" class="pill pill-toggle" data-master="${g.id}" aria-pressed="false">${I('check')}<span>Chapitre maîtrisé</span></button></div>
  <div class="list">${g.items.map((p) => `${pageCard(p, base)}${exoFor(p).map((e) => `<a class="pcard pcard-sub" href="${base}${e.url}"><span class="pcard-kind">${I('edit')}</span><span class="pcard-body"><strong>${esc(e.title)}</strong><span class="pcard-meta">Exercices associés</span></span><span class="pcard-go" aria-hidden="true">${I('arrow-r')}</span></a>`).join('')}`).join('')}</div>
</section>`).join('') : `<div class="empty"><p>Cette matière n’a pas encore de fiche.</p></div>`}
${exos.filter((e) => !e.for || !fs_.find((p) => p.slug === e.for)).length ? `<section class="block"><div class="block-head"><h2>Exercices</h2></div><div class="list">${exos.filter((e) => !e.for || !fs_.find((p) => p.slug === e.for)).map((p) => pageCard(p, base)).join('')}</div></section>` : ''}`;
  write(`subjects/${s.slug}/index.html`, layout({ title: s.title, desc: s.description || `Fiches de révision : ${s.title}`, base, active: 'subjects', body, ogImage: s.cover }));
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
  const tocHtml = p.toc.length ? `<ol>${p.toc.map((t) => `<li class="l${t.level}"><a href="#${t.id}">${esc(t.text)}</a></li>`).join('')}</ol>` : '';
  const dates = [p.created && `Créée le ${fmtDate(p.created)}`, p.updated && p.updated !== p.created && `Mise à jour le ${fmtDate(p.updated)}`].filter(Boolean);
  const head = p.cover
    ? `<header class="banner banner-doc"><img src="${base}${esc(p.cover)}" alt="${esc(p.coverAlt || '')}" decoding="async" fetchpriority="high"><div class="banner-in">`
    : `<header class="banner banner-doc banner-plain" style="--h:${s.hue}"><div class="banner-in">`;
  const body = `<nav class="crumbs" aria-label="Fil d’Ariane"><a href="${base}">Accueil</a><span>/</span><a href="${base}subjects/${s.slug}/">${esc(s.title)}</a>${p.chapter ? `<span>/</span><span>${esc(p.chapter)}</span>` : ''}</nav>
${head}<div class="meta-row"><span class="pill pill-glass">${p.kind === 'exercices' ? 'Exercices' : 'Fiche'}</span>${p.chapter ? `<span class="pill pill-glass">${esc(p.chapter)}</span>` : ''}<span class="pill pill-glass">${I('clock')}${p.minutes} min</span></div>
  <h1>${esc(p.title)}</h1>${p.summary ? `<p>${esc(p.summary)}</p>` : ''}</div></header>
<div class="doc">
  <aside class="toc toc-d" aria-label="Sommaire">${tocHtml ? `<p class="toc-t">Sommaire</p>${tocHtml}` : ''}</aside>
  <article class="prose" data-article>
    ${tocHtml ? `<details class="toc toc-m"><summary>Sommaire ${I('chev')}</summary>${tocHtml}</details>` : ''}
${p.html}
    <div class="doc-actions">
      ${p.kind === 'fiche' ? `<button type="button" class="btn btn-dark" data-reviewed aria-pressed="false">${I('check')}<span>Marquer comme révisée</span></button>` : ''}
      ${parent ? `<a class="btn btn-light" href="${base}${parent.url}">${I('arrow-l')}<span>Retour à la fiche</span></a>` : ''}
      <a class="btn btn-light" href="${base}subjects/${s.slug}/">${I('grid')}<span>Retour à la matière</span></a>
    </div>
    ${exos.length ? `<section class="related"><h2 class="plain">Exercices associés</h2><div class="list">${exos.map((e) => pageCard(e, base)).join('')}</div></section>` : ''}
    ${prev || next ? `<nav class="pn" aria-label="Fiches précédente et suivante">${prev ? `<a class="pn-prev" href="${base}${prev.url}">${I('arrow-l')}<span><small>Précédente</small>${esc(prev.title)}</span></a>` : '<span></span>'}${next ? `<a class="pn-next" href="${base}${next.url}"><span><small>Suivante</small>${esc(next.title)}</span>${I('arrow-r')}</a>` : '<span></span>'}</nav>` : ''}
    <footer class="provenance">${p.sources ? `<p><strong>Sources du cours :</strong> ${esc(p.sources)}</p>` : ''}${dates.length ? `<p>${dates.join(' · ')}</p>` : ''}</footer>
  </article>
</div>`;
  write(p.url + 'index.html', layout({ title: `${p.title} — ${s.title}`, desc: p.summary || `${p.title} (${s.title})`, base, active: p.kind === 'exercices' ? 'exercises' : 'subjects', body, math: p.math, pageId: p.id, ogImage: p.cover || s.cover }));
}

// Exercices (zone dédiée)
{
  const base = '../';
  const exos = pages.filter((p) => p.kind === 'exercices');
  const bySub = subjects.map((s) => ({ s, list: exos.filter((e) => e.subject === s.slug) })).filter((x) => x.list.length);
  const body = `<header class="page-head"><h1>Exercices</h1><p>QCM, flashcards et exercices corrigés.</p></header>
${bySub.length ? bySub.map(({ s, list }) => `<section class="block"><div class="block-head"><h2>${esc(s.title)}</h2></div><div class="list">${list.map((p) => pageCard(p, base)).join('')}</div></section>`).join('') : `<div class="empty"><div class="empty-ic">${I('edit')}</div><h3>Pas encore d’exercices</h3><p>Les exercices d’entraînement et leurs corrections apparaîtront ici avec tes premiers cours.</p></div>`}`;
  write('exercises/index.html', layout({ title: 'Exercices', desc: 'Zone d’entraînement : QCM, flashcards, exercices corrigés.', base, active: 'exercises', body }));
}

// Recherche
write('search/index.html', layout({
  title: 'Recherche', desc: 'Recherche dans toutes tes fiches.', base: '../', active: 'search',
  body: `<header class="page-head"><h1>Recherche</h1><p>Titre, matière, chapitre, mot-clé ou contenu.</p></header>
<div class="search search-page" data-search data-limit="40" data-autofocus>
  <form class="searchbox" role="search" action="" method="get"><label class="sr" for="q-page">Rechercher</label>${I('search')}<input id="q-page" name="q" type="search" placeholder="Ex. : VAN, segmentation, taux…" autocomplete="off" enterkeyhint="search"></form>
  <div class="search-results" data-results aria-live="polite"></div>
</div>`,
}));

// Suivi
write('progress/index.html', layout({
  title: 'Suivi', desc: 'Ton suivi de révision.', base: '../', active: 'progress',
  body: `<header class="page-head"><h1>Suivi de révision</h1><p>Stocké uniquement sur cet appareil.</p></header>
<div data-progress-root>
  <section class="block" data-todo-all hidden><div class="block-head"><h2>À réviser</h2></div><div class="list" data-todo-list></div></section>
  <section class="block" data-quiz-all hidden><div class="block-head"><h2>Résultats de QCM</h2></div><div class="list" data-quiz-list></div></section>
  <section class="block" data-done-all hidden><div class="block-head"><h2>Fiches révisées</h2></div><div class="list" data-done-list></div></section>
  <section class="block" data-mastered-all hidden><div class="block-head"><h2>Chapitres maîtrisés</h2></div><div class="list" data-mastered-list></div></section>
  <div class="empty" data-progress-empty><div class="empty-ic">${I('chart')}</div><h3>Rien à suivre pour l’instant</h3><p>Ouvre une fiche : elle apparaîtra ici. Tu pourras la marquer comme révisée et suivre tes résultats de QCM.</p></div>
  <p class="reset"><button type="button" class="btn btn-light" data-reset>${I('refresh')}<span>Réinitialiser mon suivi</span></button></p>
</div>`,
}));

// 404 (chemins absolus basés sur basePath)
{
  const bp = (CFG.basePath || '').replace(/\/$/, '');
  const html = layout({ title: 'Page introuvable', desc: 'Page introuvable', base: `${bp}/`, active: '', body: `<div class="empty"><div class="empty-ic">${I('search')}</div><h3>Page introuvable</h3><p>Cette page n’existe pas (ou plus).</p><p><a class="btn btn-dark" href="${bp}/">${I('home')}<span>Retour à l’accueil</span></a></p></div>` });
  write('404.html', html);
}

// Données JS
const meta = pages.map((p) => ({ id: p.id, url: p.url, title: p.title, subject: p.subject, subjectTitle: subjectOf(p.subject).title, chapter: p.chapter, kind: p.kind, summary: p.summary, keywords: p.keywords, updated: p.updated, order: p.order }));
write('assets/data/library.json', JSON.stringify({ subjects: subjects.map((s) => ({ slug: s.slug, title: s.title })), pages: meta }));
write('assets/data/search.json', JSON.stringify(Object.fromEntries(pages.map((p) => [p.id, p.text.slice(0, 8000)]))));

console.log(`✓ ${subjects.length} matière(s), ${pages.length} page(s) — ${written.length} fichiers écrits dans ${OUT}`);
