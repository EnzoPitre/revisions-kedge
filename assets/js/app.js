// KEDGE Revisions — JS côté client (aucun backend). Suivi personnel dans localStorage.
(() => {
  'use strict';
  const body = document.body;
  const base = body.dataset.base || './';
  const pageId = body.dataset.pageId || '';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const icon = (n) => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;

  // ---------- Stockage ----------
  const KEY = 'kr:v1';
  const blank = () => ({ viewed: {}, reviewed: {}, mastered: {}, quiz: {}, fav: {} });
  const store = {
    get() { try { return Object.assign(blank(), JSON.parse(localStorage.getItem(KEY)) || {}); } catch { return blank(); } },
    set(fn) { const s = store.get(); fn(s); try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* stockage indisponible */ } return s; },
    clear() { try { localStorage.removeItem(KEY); } catch { /* noop */ } },
  };

  // ---------- Données ----------
  let libP, textP;
  const lib = () => (libP ||= fetch(base + 'assets/data/library.json').then((r) => r.json()).catch(() => ({ subjects: [], pages: [] })));
  const texts = () => (textP ||= fetch(base + 'assets/data/search.json').then((r) => r.json()).catch(() => ({})));

  // Mêmes gabarits que tools/build.mjs (row, scard)
  const thumb = (p) => `<span class="thumb">${p.cover ? `<img src="${base}${esc(p.cover)}" alt="" loading="lazy" decoding="async">` : `<span class="ph" style="--h:${p.hue}"></span>`}</span>`;
  const row = (p, extra = '', cls = '') => `<a class="row ${cls}" href="${base}${p.url}">${thumb(p)}<span class="row-b"><span class="meta">${esc(p.subjectTitle)}${p.chapter ? ' · ' + esc(p.chapter) : ''}</span><strong>${esc(p.title)}</strong>${extra}</span><i class="circle dark sm">${icon('arrow-r')}</i></a>`;
  const heartBtn = (id, label) => `<button type="button" class="round heart" data-fav="${esc(id)}" aria-pressed="false" aria-label="Ajouter aux favoris : ${esc(label)}">${icon('heart')}</button>`;
  const bigCard = ({ id, hue, cover, coverAlt, eyebrow, title, meta, href, cta }) => `<article class="scard" style="--h:${hue}"><div class="scard-media">${cover ? `<img src="${base}${esc(cover)}" alt="${esc(coverAlt || '')}" loading="lazy" decoding="async">` : `<div class="ph"></div>`}</div>${heartBtn(id, title)}
    <div class="scard-in"><p class="eyebrow">${esc(eyebrow)}</p><h3>${esc(title)}</h3><p class="meta">${esc(meta)}</p><a class="cta-soft stretch" href="${href}"><span>${esc(cta)}</span><i class="circle">${icon('arrow-r')}</i></a></div></article>`;

  // ---------- Consultation + PWA ----------
  if (pageId) store.set((s) => { s.viewed[pageId] = Date.now(); });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register(base + 'sw.js').catch(() => {});

  // ---------- Favoris (cœurs) ----------
  const syncHearts = (root = document) => { const f = store.get().fav; $$('[data-fav]', root).forEach((b) => b.setAttribute('aria-pressed', !!f[b.dataset.fav])); };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fav]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    store.set((s) => { s.fav[b.dataset.fav] ? delete s.fav[b.dataset.fav] : (s.fav[b.dataset.fav] = Date.now()); });
    syncHearts(); if (renderFavs) renderFavs();
  }, true);
  syncHearts();

  // ---------- Recherche ----------
  function search(q, pages, txt) {
    const toks = norm(q).split(/[^a-z0-9]+/).filter(Boolean);
    if (!toks.length) return [];
    const out = [];
    for (const p of pages) {
      const f = { t: norm(p.title), s: norm(p.subjectTitle), c: norm(p.chapter), k: norm(p.keywords.join(' ')), m: norm(p.summary), x: norm(txt[p.id] || '') };
      let score = 0, ok = true;
      for (const t of toks) {
        const sc = (f.t.includes(t) ? 10 : 0) + (f.s.includes(t) ? 6 : 0) + (f.k.includes(t) ? 6 : 0) + (f.c.includes(t) ? 5 : 0) + (f.m.includes(t) ? 3 : 0) + (f.x.includes(t) ? 1 : 0);
        if (!sc) { ok = false; break; }
        score += sc;
      }
      if (ok) out.push({ p, score, x: txt[p.id] || '', toks });
    }
    return out.sort((a, b) => b.score - a.score);
  }
  function snippet(x, toks, p) {
    const n = norm(x);
    const hit = toks.map((t) => n.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
    const inMeta = toks.every((t) => norm(p.title + p.subjectTitle + p.chapter + p.keywords.join(' ')).includes(t));
    if (hit === undefined || inMeta) return '';
    const from = Math.max(0, hit - 40);
    return `<span class="snip">…${esc(x.slice(from, from + 130))}…</span>`;
  }
  $$('[data-search]').forEach((root) => {
    const input = $('input', root), out = $('[data-results]', root), limit = +root.dataset.limit || 8;
    const run = async () => {
      const q = input.value.trim();
      if (!q) { out.innerHTML = ''; return; }
      const [l, t] = await Promise.all([lib(), texts()]);
      if (q !== input.value.trim()) return;
      const res = search(q, l.pages, t);
      out.innerHTML = res.length
        ? `<p class="res-count">${res.length} résultat${res.length > 1 ? 's' : ''}</p>` + res.slice(0, limit).map((r) => row(r.p, snippet(r.x, r.toks, r.p))).join('')
        : `<p class="res-empty">Aucun résultat pour « ${esc(q)} ».</p>`;
    };
    let tm; input.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(run, 120); });
    const q0 = new URLSearchParams(location.search).get('q');
    if (root.hasAttribute('data-autofocus')) {
      if (q0) { input.value = q0; run(); } else if (matchMedia('(hover: hover)').matches) input.focus();
      $('form', root).addEventListener('submit', (e) => { e.preventDefault(); run(); });
    } else {
      // sur l'accueil / les cours : Entrée ouvre la page de recherche
    }
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { input.value = ''; out.innerHTML = ''; } });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
      const i = $('[data-search] input');
      if (i) { e.preventDefault(); i.focus(); } else location.href = base + 'search/';
    }
  });

  // ---------- Accueil : filtre des matières ----------
  $$('.pills [data-filter]').forEach((b) => b.addEventListener('click', () => {
    const f = b.dataset.filter;
    $$('.pills [data-filter]').forEach((x) => { const on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-pressed', on); });
    $$('[data-subject-list] [data-subject]').forEach((c) => { c.hidden = f !== 'all' && c.dataset.subject !== f; });
    const list = $('[data-subject-list]'); if (list) list.scrollTo({ left: 0 });
  }));

  // ---------- Accueil / Révisions / Favoris ----------
  let renderFavs = null;
  const needsLib = $('[data-todo]') || $('[data-progress-root]') || $('[data-continue]') || $('[data-fav-pages]');
  if (needsLib) {
    lib().then(({ pages, subjects }) => {
      const s = store.get();
      const by = Object.fromEntries(pages.map((p) => [p.id, p]));
      const viewed = Object.entries(s.viewed).filter(([id]) => by[id]).sort((a, b) => b[1] - a[1]);
      const todo = viewed.filter(([id]) => by[id].kind === 'fiche' && !s.reviewed[id]).map(([id]) => by[id]);
      const weak = Object.entries(s.quiz).filter(([k, v]) => by[k.split('#')[0]] && v.score / v.total < 0.7).map(([k]) => by[k.split('#')[0]]);
      const toDo = [...new Map([...weak, ...todo].map((p) => [p.id, p])).values()];
      const fill = (sec, listSel, items, html) => { const el = $(sec); if (!el) return; el.hidden = !items.length; $(listSel, el).innerHTML = items.map(html).join(''); };
      const asTodo = (p) => row(p, `<span class="meta">${weak.includes(p) ? 'QCM à refaire' : 'Consultée, pas encore révisée'}</span>`);

      // Continuer à réviser
      const cont = $('[data-continue]');
      if (cont) {
        const last = viewed.map(([id]) => by[id]).find((p) => p.kind === 'fiche');
        if (last) {
          cont.hidden = false;
          $('[data-continue-card]', cont).innerHTML = bigCard({ id: last.id, hue: last.hue, cover: last.cover, eyebrow: last.subjectTitle, title: last.title, meta: `${last.chapter ? last.chapter + ' · ' : ''}${last.minutes} min${s.reviewed[last.id] ? ' · révisée' : ''}`, href: base + last.url, cta: 'Continuer' });
          syncHearts(cont);
        }
      }
      fill('[data-todo]', '[data-todo-list]', toDo.slice(0, 4), asTodo);

      if ($('[data-progress-root]')) {
        fill('[data-todo-all]', '[data-todo-list]', toDo, asTodo);
        const quizzes = Object.entries(s.quiz).filter(([k]) => by[k.split('#')[0]]).sort((a, b) => b[1].ts - a[1].ts);
        fill('[data-quiz-all]', '[data-quiz-list]', quizzes, ([k, v]) => row(by[k.split('#')[0]], `<span class="meta">Score : ${v.score}/${v.total}</span>`));
        fill('[data-done-all]', '[data-done-list]', pages.filter((p) => s.reviewed[p.id]), (p) => row(p, '', 'done'));
        const m = Object.keys(s.mastered);
        const mEl = $('[data-mastered-all]'); mEl.hidden = !m.length;
        $('[data-mastered-list]').innerHTML = m.map((id) => {
          const [sub] = id.split('/'); const ref = pages.find((p) => p.subject === sub && id === `${sub}/${slug(p.chapter || 'Fiches')}`);
          return `<a class="row done" href="${base}subjects/${esc(sub)}/"><span class="thumb thumb-dark">${icon('check')}</span><span class="row-b"><span class="meta">${esc(ref ? ref.subjectTitle : sub)}</span><strong>${esc(ref ? (ref.chapter || 'Fiches') : id)}</strong></span><i class="circle dark sm">${icon('arrow-r')}</i></a>`;
        }).join('');
        $('[data-progress-empty]').hidden = !!(toDo.length || quizzes.length || m.length || Object.keys(s.reviewed).length);
      }

      // Favoris
      if ($('[data-fav-pages]')) {
        renderFavs = () => {
          const f = store.get().fav;
          const fs = subjects.filter((x) => f['s:' + x.slug]);
          const fp = pages.filter((p) => f[p.id]);
          const a = $('[data-fav-subjects]'), b = $('[data-fav-pages]');
          a.hidden = !fs.length; b.hidden = !fp.length; $('[data-fav-empty]').hidden = !!(fs.length || fp.length);
          $('[data-fav-subjects-list]', a).innerHTML = fs.map((x) => bigCard({ id: 's:' + x.slug, hue: x.hue, cover: x.cover, coverAlt: x.coverAlt, eyebrow: 'Matière', title: x.title, meta: `${x.count} fiche${x.count > 1 ? 's' : ''}`, href: `${base}subjects/${x.slug}/`, cta: 'Voir la matière' })).join('');
          $('[data-fav-pages-list]', b).innerHTML = fp.map((p) => row(p)).join('');
          syncHearts();
        };
        renderFavs();
      }
    });
    $('[data-reset]')?.addEventListener('click', () => { if (confirm('Effacer tout ton suivi (fiches révisées, QCM, chapitres maîtrisés, favoris) sur cet appareil ?')) { store.clear(); location.reload(); } });
  }

  // ---------- Page matière ----------
  $$('[data-master]').forEach((b) => {
    const id = b.dataset.master;
    const sync = () => { const on = !!store.get().mastered[id]; b.setAttribute('aria-pressed', on); $('span', b).textContent = on ? 'Maîtrisé ✓' : 'Maîtrisé'; };
    sync();
    b.addEventListener('click', () => { store.set((s) => { s.mastered[id] ? delete s.mastered[id] : (s.mastered[id] = Date.now()); }); sync(); });
  });
  $$('[data-subject-progress]').forEach((el) => {
    const ids = el.dataset.ids.split(',').filter(Boolean); if (!ids.length) return;
    const s = store.get(); const n = ids.filter((i) => s.reviewed[i]).length;
    el.hidden = false; $('i', el).style.width = `${(n / ids.length) * 100}%`; $('span', el).textContent = `${n}/${ids.length} révisées`;
  });
  const cta = $('[data-cta-subject]');
  if (cta) {
    const urls = cta.dataset.urls.split(','), ids = cta.dataset.ids.split(','); const s = store.get();
    const i = ids.findIndex((id) => !s.reviewed[id]); const done = ids.filter((id) => s.reviewed[id]).length;
    cta.href = base + urls[i === -1 ? 0 : i];
    $('span', cta).textContent = i === -1 ? 'Tout revoir' : done ? 'Continuer la révision' : 'Commencer la révision';
  }

  // ---------- Fiche : révisée ----------
  const rv = $('[data-reviewed]');
  if (rv) {
    const sync = () => { const on = !!store.get().reviewed[pageId]; rv.setAttribute('aria-pressed', on); $('span', rv).textContent = on ? 'Fiche révisée' : 'Marquer comme révisée'; };
    sync();
    rv.addEventListener('click', () => { store.set((s) => { s.reviewed[pageId] ? delete s.reviewed[pageId] : (s.reviewed[pageId] = Date.now()); }); sync(); });
  }

  // ---------- Fiche : onglets ----------
  const tabBtns = $$('[data-tab-btn]');
  if (tabBtns.length) {
    const panel = (k) => document.getElementById('tab-' + k);
    const activate = (k, focus) => {
      tabBtns.forEach((b) => { const on = b.dataset.tabBtn === k; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; if (on) { if (focus) b.focus(); b.scrollIntoView({ inline: 'center', block: 'nearest' }); } });
      tabBtns.forEach((b) => { const p = panel(b.dataset.tabBtn); if (p) p.hidden = b.dataset.tabBtn !== k; });
      const dh = $('[data-doc-head]'); if (dh) dh.hidden = k !== tabBtns[0].dataset.tabBtn;
    };
    const fromHash = () => {
      const h = decodeURIComponent(location.hash.slice(1)); if (!h) return false;
      const el = document.getElementById(h); if (!el) return false;
      const p = el.closest('.panel'); if (!p) return false;
      activate(p.dataset.tab); el.closest('details')?.setAttribute('open', ''); setTimeout(() => el.scrollIntoView({ block: 'start' }), 30); return true;
    };
    tabBtns.forEach((b, i) => {
      b.addEventListener('click', () => { activate(b.dataset.tabBtn); });
      b.addEventListener('keydown', (e) => { const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (d) { e.preventDefault(); activate(tabBtns[(i + d + tabBtns.length) % tabBtns.length].dataset.tabBtn, true); } });
    });
    if (!fromHash()) activate(tabBtns[0].dataset.tabBtn);
    window.addEventListener('hashchange', fromHash);
  }
  $$('.toc a').forEach((a) => a.addEventListener('click', () => { $('.toc').open = false; }));

  // ---------- QCM ----------
  // <div class="quiz" data-quiz-id="id"><script type="application/json">{"questions":[{"q":"…","options":["…"],"answer":0,"explain":"…"}]}</script></div>
  $$('.quiz[data-quiz-id]').forEach((el) => {
    let data; try { data = JSON.parse($('script', el).textContent); } catch { return; }
    const key = `${pageId}#${el.dataset.quizId}`;
    const L = 'ABCDEFGH';
    let answered, right;
    const render = () => {
      answered = 0; right = 0;
      const last = store.get().quiz[key];
      el.innerHTML = (last ? `<p class="quiz-last">Dernier résultat : ${last.score}/${last.total}</p>` : '') + data.questions.map((q, i) => `
        <fieldset class="q" data-i="${i}"><legend><span class="q-n">Question ${i + 1}/${data.questions.length}</span><br>${q.q}</legend>
        <div class="opts">${q.options.map((o, j) => `<button type="button" class="opt" data-j="${j}"><span class="opt-l">${L[j]}</span><span>${o}</span></button>`).join('')}</div>
        <div class="explain" hidden>${q.explain || ''}</div></fieldset>`).join('') + '<div class="quiz-res" hidden role="status"></div>';
      if (window.renderMathInElement) mathify(el);
    };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('.opt'); if (b) {
        const fs = b.closest('.q'); const q = data.questions[+fs.dataset.i]; const j = +b.dataset.j;
        $$('.opt', fs).forEach((o, k) => { o.disabled = true; if (k === q.answer) o.classList.add('is-right'); });
        if (j !== q.answer) b.classList.add('is-wrong'); else right++;
        if (q.explain) $('.explain', fs).hidden = false;
        answered++;
        if (answered === data.questions.length) {
          store.set((s) => { s.quiz[key] = { score: right, total: data.questions.length, ts: Date.now() }; });
          const res = $('.quiz-res', el); res.hidden = false;
          res.innerHTML = `<strong>${right}/${data.questions.length}</strong>${right === data.questions.length ? 'Sans faute.' : right / data.questions.length >= 0.7 ? 'Bon résultat — relis les points manqués.' : 'À retravailler : relis la fiche puis recommence.'}<br><button type="button" class="btn" data-restart>${icon('refresh')}<span>Recommencer</span></button>`;
          res.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
        return;
      }
      if (e.target.closest('[data-restart]')) { render(); el.scrollIntoView({ block: 'start' }); }
    });
    render();
  });

  // ---------- Flashcards ----------
  // <div class="flashcards"><div class="fc"><div class="fc-q">Question</div><div class="fc-a">Réponse</div></div>…</div>
  $$('.flashcards').forEach((el) => {
    const cards = $$('.fc', el).map((c) => ({ q: $('.fc-q', c).innerHTML, a: $('.fc-a', c).innerHTML }));
    if (!cards.length) return;
    let i = 0;
    el.classList.add('deck'); el.innerHTML = `<button type="button" class="fcard" aria-pressed="false" aria-live="polite"><span class="fcard-in"><span class="fcard-f"><small>Question</small><span data-q></span></span><span class="fcard-b"><small>Réponse</small><span data-a></span></span></span></button>
      <div class="deck-nav"><button type="button" class="circle" data-prev aria-label="Carte précédente">${icon('back')}</button><span data-n></span><button type="button" class="circle dark" data-next aria-label="Carte suivante">${icon('arrow-r')}</button></div>`;
    const fc = $('.fcard', el);
    const show = () => { fc.setAttribute('aria-pressed', 'false'); $('[data-q]', el).innerHTML = cards[i].q; $('[data-a]', el).innerHTML = cards[i].a; $('[data-n]', el).textContent = `${i + 1} / ${cards.length}`; if (window.renderMathInElement) mathify(el); };
    fc.addEventListener('click', () => fc.setAttribute('aria-pressed', fc.getAttribute('aria-pressed') !== 'true'));
    $('[data-prev]', el).addEventListener('click', () => { i = (i - 1 + cards.length) % cards.length; show(); });
    $('[data-next]', el).addEventListener('click', () => { i = (i + 1) % cards.length; show(); });
    show();
  });

  // ---------- Formules (KaTeX chargé uniquement si la page en contient) ----------
  const DELIMS = [{ left: '\\[', right: '\\]', display: true }, { left: '\\(', right: '\\)', display: false }];
  function mathify(root) { try { window.renderMathInElement(root, { delimiters: DELIMS, throwOnError: false }); } catch { /* noop */ } }
  if (body.dataset.math) {
    const go = () => mathify($('[data-article]') || body);
    window.addEventListener('load', () => (window.renderMathInElement ? go() : setTimeout(go, 200)));
  }
})();
