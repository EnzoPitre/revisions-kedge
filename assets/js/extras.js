// KEDGE Revisions — fonctions complémentaires (réglages, révision espacée, contrôles, mode examen,
// surlignage/notes, impression, export). Tout est local (localStorage), aucun backend.
(() => {
  'use strict';
  const body = document.body;
  const root = document.documentElement;
  const base = body.dataset.base || './';
  const pageId = body.dataset.pageId || '';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } };
  const icon = (n) => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const DAY = 864e5;
  const dkey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const state = () => Object.assign({ reviewed: {}, fcs: {}, quiz: {}, viewed: {} }, read('kr:v1', {}));
  let libP;
  const lib = () => (libP ||= fetch(base + 'assets/data/library.json').then((r) => r.json()).catch(() => ({ subjects: [], pages: [] })));
  const thumb = (p) => `<span class="thumb">${p.cover ? `<img src="${base}${esc(p.cover)}" alt="" loading="lazy" decoding="async">` : `<span class="ph" style="--h:${p.hue}"></span>`}</span>`;
  const rowx = (p, href, meta) => `<a class="row" href="${href}">${thumb(p)}<span class="row-b"><span class="meta">${esc(p.subjectTitle)}${p.chapter ? ' · ' + esc(p.chapter) : ''}</span><strong>${esc(p.title)}</strong>${meta ? `<span class="meta">${meta}</span>` : ''}</span><i class="circle dark sm">${icon('arrow-r')}</i></a>`;

  // ---------- Série de jours d'activité ----------
  const streak = () => {
    const days = read('kr:days', {});
    let t = Date.now(); if (!days[dkey(t)]) t -= DAY;
    let n = 0; while (days[dkey(t)]) { n++; t -= DAY; }
    return n;
  };

  // ---------- Réglages : thème, taille du texte, export / import ----------
  const prefs = () => read('kr:prefs', {});
  const applyPrefs = () => {
    const p = prefs(); let t = p.theme || 'auto';
    if (t === 'auto') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    root.dataset.theme = t; if (p.fs) root.dataset.fs = p.fs; else delete root.dataset.fs;
    const meta = $('meta[name="theme-color"]'); if (meta) meta.content = t === 'dark' ? '#0f1213' : '#ffffff';
  };
  const syncSeg = () => {
    const p = prefs();
    $$('[data-set-theme]').forEach((b) => b.setAttribute('aria-pressed', (p.theme || 'auto') === b.dataset.setTheme));
    $$('[data-set-fs]').forEach((b) => b.setAttribute('aria-pressed', (p.fs || 'm') === b.dataset.setFs));
  };
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-set-theme]'), f = e.target.closest('[data-set-fs]');
    if (t) { save('kr:prefs', { ...prefs(), theme: t.dataset.setTheme }); applyPrefs(); syncSeg(); }
    if (f) { save('kr:prefs', { ...prefs(), fs: f.dataset.setFs === 'm' ? '' : f.dataset.setFs }); applyPrefs(); syncSeg(); }
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (!prefs().theme || prefs().theme === 'auto') applyPrefs(); });
  syncSeg();
  $('[data-export]')?.addEventListener('click', () => {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('kr:')) out[k] = localStorage.getItem(k); }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'kedge-revisions', version: 1, data: out }, null, 1)], { type: 'application/json' }));
    a.download = `kedge-revisions-suivi-${dkey()}.json`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $('[data-import]')?.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const msg = $('[data-import-msg]');
    try {
      const j = JSON.parse(await file.text());
      const d = j && j.app === 'kedge-revisions' ? j.data : null;
      if (!d) throw new Error('format');
      if (!confirm('Remplacer le suivi de cet appareil par celui du fichier ?')) { e.target.value = ''; return; }
      Object.entries(d).forEach(([k, v]) => { if (k.startsWith('kr:') && typeof v === 'string') localStorage.setItem(k, v); });
      if (msg) msg.textContent = 'Suivi importé.'; setTimeout(() => location.reload(), 600);
    } catch { if (msg) msg.textContent = 'Fichier invalide.'; }
    e.target.value = '';
  });

  // ---------- Accueil : à revoir aujourd'hui (révision espacée) ----------
  const due = $('[data-due]');
  if (due) {
    lib().then(({ pages }) => {
      const s = state(), now = Date.now();
      const by = Object.fromEntries(pages.map((p) => [p.id, p]));
      const cards = {};
      Object.entries(s.fcs || {}).forEach(([k, v]) => { const id = k.slice(0, k.lastIndexOf('#')); if (by[id] && v.due <= now) cards[id] = (cards[id] || 0) + 1; });
      const stale = pages.filter((p) => p.kind === 'fiche' && s.reviewed[p.id] && now - s.reviewed[p.id] > 7 * DAY);
      const items = [
        ...Object.entries(cards).map(([id, n]) => rowx(by[id], `${base}${by[id].url}#tab-flashcards`, `${n} carte${n > 1 ? 's' : ''} à revoir`)),
        ...stale.filter((p) => !cards[p.id]).map((p) => rowx(p, base + p.url, `Révisée il y a ${Math.floor((now - s.reviewed[p.id]) / DAY)} jours — à relire`)),
      ];
      const n = streak();
      const st = $('[data-streak]', due); if (n) { st.textContent = `${n} jour${n > 1 ? 's' : ''} d’affilée`; st.hidden = false; }
      due.hidden = !items.length && !n;
      $('[data-due-list]', due).innerHTML = items.slice(0, 6).join('') || '<p class="res-empty">Rien à revoir aujourd’hui. Bien joué.</p>';
    });
  }

  // ---------- Accueil : mes contrôles (compte à rebours) ----------
  const ex = $('[data-exams]');
  if (ex) {
    const form = $('[data-exam-form]', ex), listEl = $('[data-exam-list]', ex);
    const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
    const render = () => lib().then(({ pages, subjects }) => {
      const s = state();
      let list = read('kr:exams', []);
      const kept = list.filter((x) => new Date(x.date + 'T00:00').getTime() >= today0() - DAY);
      if (kept.length !== list.length) save('kr:exams', (list = kept));
      list.sort((a, b) => a.date.localeCompare(b.date));
      listEl.innerHTML = list.map((x) => {
        const sub = subjects.find((y) => y.slug === x.subject); if (!sub) return '';
        const days = Math.round((new Date(x.date + 'T00:00').getTime() - today0()) / DAY);
        const fs = pages.filter((p) => p.subject === x.subject && p.kind === 'fiche');
        const done = fs.filter((p) => s.reviewed[p.id]).length;
        const when = days < 0 ? 'Passé' : days === 0 ? 'Aujourd’hui' : days === 1 ? 'Demain' : `J-${days}`;
        const dt = new Date(x.date + 'T00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
        return `<div class="exam-card"><a class="exam-days${days <= 3 ? ' is-near' : ''}" href="${base}subjects/${esc(x.subject)}/">${when}</a>
          <div class="exam-b"><strong>${esc(x.label || sub.title)}</strong><span class="meta">${esc(sub.title)} · ${dt}</span>
          <span class="exam-prog"><i style="width:${fs.length ? (done / fs.length) * 100 : 0}%"></i></span><span class="meta">${done}/${fs.length} fiches révisées</span></div>
          <button type="button" class="round sm" data-exam-del="${esc(x.id)}" aria-label="Supprimer ce contrôle">✕</button></div>`;
      }).join('') || '<p class="res-empty">Ajoute la date d’un contrôle pour suivre le compte à rebours.</p>';
    });
    render();
    $('[data-exam-add]', ex).addEventListener('click', () => { form.hidden = !form.hidden; if (!form.hidden) { const d = $('input[type=date]', form); d.min = dkey(); d.focus(); } });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const sub = $('select', form).value, date = $('input[type=date]', form).value, label = $('input[type=text]', form).value.trim();
      if (!sub || !date) return;
      save('kr:exams', [...read('kr:exams', []), { id: String(Date.now()), subject: sub, date, label }]);
      form.reset(); form.hidden = true; render();
    });
    listEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-exam-del]'); if (!b) return;
      save('kr:exams', read('kr:exams', []).filter((x) => x.id !== b.dataset.examDel)); render();
    });
  }

  // ---------- Mode examen (QCM chronométré d'une matière) ----------
  let overlay, timer;
  const closeOverlay = () => { clearInterval(timer); overlay?.remove(); overlay = null; body.classList.remove('has-overlay'); };
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const openOverlay = (html) => {
    if (!overlay) {
      overlay = document.createElement('div'); overlay.className = 'overlay'; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true');
      body.appendChild(overlay); body.classList.add('has-overlay');
    }
    overlay.innerHTML = `<div class="overlay-card"><button type="button" class="round overlay-x" data-x aria-label="Fermer">✕</button>${html}</div>`;
    overlay.scrollTop = 0; return $('.overlay-card', overlay);
  };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay) closeOverlay(); });
  document.addEventListener('click', (e) => {
    if (overlay && (e.target.closest('[data-x]') || e.target === overlay)) closeOverlay();
    const b = e.target.closest('[data-exam-start]'); if (b) startExam(b.dataset.examStart);
  });
  async function startExam(slug) {
    const [quiz, l] = await Promise.all([fetch(base + 'assets/data/quiz.json').then((r) => r.json()).catch(() => ({})), lib()]);
    const sub = l.subjects.find((x) => x.slug === slug);
    const pool = [];
    Object.entries(quiz).forEach(([id, v]) => { if (v.s === slug) v.q.forEach((q) => pool.push({ ...q, id, t: v.t, u: v.u })); });
    if (!pool.length) return;
    const hist = read('kr:examhist', {})[slug];
    const sizes = [...new Set([Math.min(10, pool.length), Math.min(20, pool.length), pool.length])];
    const card = openOverlay(`<p class="eyebrow">Mode examen</p><h2>${esc(sub ? sub.title : slug)}</h2>
      <p>QCM mélangés tirés de toutes les fiches de la matière, avec un chronomètre (45 s par question). Les réponses et explications s’affichent après chaque question.</p>
      ${hist ? `<p class="meta">Dernier score : ${hist.score}/${hist.total} (${new Date(hist.ts).toLocaleDateString('fr-FR')})</p>` : ''}
      <div class="exam-sizes">${sizes.map((n) => `<button type="button" class="cta" data-n="${n}"><span>${n === pool.length && sizes.length > 1 ? 'Toutes les questions' : n + ' questions'} · ${Math.ceil((n * 45) / 60)} min</span></button>`).join('')}</div>`);
    card.addEventListener('click', (e) => { const b = e.target.closest('[data-n]'); if (b) runExam(slug, shuffle(pool.slice()).slice(0, +b.dataset.n)); });
  }
  function runExam(slug, qs) {
    let i = 0, score = 0, left = qs.length * 45; const wrong = {};
    const L = 'ABCDEFGH';
    const mm = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const finish = () => {
      clearInterval(timer);
      const h = read('kr:examhist', {}); h[slug] = { score, total: qs.length, ts: Date.now() }; save('kr:examhist', h);
      const days = read('kr:days', {}); days[dkey()] = 1; save('kr:days', days);
      const weak = Object.values(wrong).sort((a, b) => b.n - a.n);
      const pct = Math.round((score / qs.length) * 100);
      openOverlay(`<p class="eyebrow">Résultat</p><h2>${score}/${qs.length} <small>(${pct} %)</small></h2>
        <p>${pct >= 85 ? 'Très solide.' : pct >= 70 ? 'Bon résultat — consolide les points manqués.' : 'À retravailler : relis les fiches ci-dessous puis recommence.'}</p>
        ${weak.length ? `<h3>Chapitres à retravailler</h3><div class="list">${weak.map((w) => `<a class="row" href="${base}${esc(w.u)}"><span class="row-b"><strong>${esc(w.t)}</strong><span class="meta">${w.n} erreur${w.n > 1 ? 's' : ''}</span></span><i class="circle dark sm">${icon('arrow-r')}</i></a>`).join('')}</div>` : ''}
        <div class="exam-sizes"><button type="button" class="cta" data-again><span>Recommencer</span></button></div>`).addEventListener('click', (e) => { if (e.target.closest('[data-again]')) startExam(slug); });
    };
    const show = () => {
      const q = qs[i];
      const card = openOverlay(`<div class="exam-top"><span class="q-n">Question ${i + 1}/${qs.length}</span><span class="exam-time" data-time>${mm(left)}</span></div>
        <div class="exam-bar"><i style="width:${(i / qs.length) * 100}%"></i></div>
        <fieldset class="q"><legend>${q.q}</legend><div class="opts">${q.options.map((o, j) => `<button type="button" class="opt" data-j="${j}"><span class="opt-l">${L[j]}</span><span>${o}</span></button>`).join('')}</div>
        <div class="explain" hidden>${q.explain || ''}</div></fieldset><div class="exam-next" hidden><button type="button" class="cta" data-next><span>${i + 1 === qs.length ? 'Voir le résultat' : 'Question suivante'}</span></button></div>`);
      if (window.renderMathInElement) try { window.renderMathInElement(card, { delimiters: [{ left: '\\[', right: '\\]', display: true }, { left: '\\(', right: '\\)', display: false }], throwOnError: false }); } catch { /* noop */ }
      card.addEventListener('click', (e) => {
        const o = e.target.closest('.opt');
        if (o && !o.disabled) {
          $$('.opt', card).forEach((x, k) => { x.disabled = true; if (k === q.answer) x.classList.add('is-right'); });
          if (+o.dataset.j === q.answer) score++; else { o.classList.add('is-wrong'); (wrong[q.id] ||= { t: q.t, u: q.u, n: 0 }).n++; }
          if (q.explain) $('.explain', card).hidden = false;
          $('.exam-next', card).hidden = false; $('.exam-next', card).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
        if (e.target.closest('[data-next]')) { i++; i < qs.length ? show() : finish(); }
      });
    };
    clearInterval(timer);
    timer = setInterval(() => { left--; const t = $('[data-time]'); if (t) { t.textContent = mm(Math.max(0, left)); t.classList.toggle('is-low', left <= 30); } if (left <= 0) finish(); }, 1000);
    show();
  }

  // ---------- Fiches : surlignage, notes, impression, recherche ----------
  const art = $('[data-article]');
  if (art) {
    const skip = (n) => n.parentElement && n.parentElement.closest('script,style,.katex,.quiz,.flashcards,summary,textarea,.my-notes,.hl-pop');
    const textNodes = () => { const w = document.createTreeWalker(art, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.data.trim() && !skip(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) }); const a = []; while (w.nextNode()) a.push(w.currentNode); return a; };
    const occ = (s, t, limit = Infinity) => { const r = []; let i = s.indexOf(t); while (i >= 0 && i < limit) { r.push(i); i = s.indexOf(t, i + t.length); } return r; };
    const HK = 'kr:hl';
    const all = () => read(HK, {});
    const mine = () => all()[pageId] || [];
    const setMine = (v) => { const a = all(); if (v.length) a[pageId] = v; else delete a[pageId]; save(HK, a); };
    const wrap = (node, from, to, id) => {
      const r = document.createRange(); r.setStart(node, from); r.setEnd(node, to);
      const m = document.createElement('mark'); m.className = 'user-hl'; m.dataset.id = id; r.surroundContents(m);
    };
    const apply = (h) => {
      let k = 0;
      for (const n of textNodes()) {
        const os = occ(n.data, h.t);
        if (k + os.length > h.n) { const at = os[h.n - k]; wrap(n, at, at + h.t.length, h.id); return true; }
        k += os.length;
      }
      return false;
    };
    mine().forEach(apply);

    const pop = document.createElement('div'); pop.className = 'hl-pop'; pop.hidden = true; body.appendChild(pop);
    let pending = null;
    const place = (rect) => { pop.hidden = false; const w = pop.offsetWidth; pop.style.left = `${Math.min(Math.max(8, rect.left + rect.width / 2 - w / 2 + scrollX), scrollX + innerWidth - w - 8)}px`; pop.style.top = `${rect.top + scrollY - pop.offsetHeight - 10}px`; };
    const check = () => {
      const sel = getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) { if (!pop.dataset.id) pop.hidden = true; return; }
      const r = sel.getRangeAt(0), n = r.startContainer;
      if (n !== r.endContainer || n.nodeType !== 3 || !art.contains(n) || skip(n) || n.parentElement.closest('mark.user-hl')) { if (!pop.dataset.id) pop.hidden = true; return; }
      const t = n.data.slice(r.startOffset, r.endOffset);
      if (t.trim().length < 3) { pop.hidden = true; return; }
      let before = 0;
      for (const x of textNodes()) { if (x === n) { before += occ(x.data, t, r.startOffset + 1).filter((i) => i < r.startOffset).length; break; } before += occ(x.data, t).length; }
      pending = { t, n: before }; pop.dataset.id = ''; pop.innerHTML = `<button type="button" data-hl>Surligner</button>`; place(r.getBoundingClientRect());
    };
    document.addEventListener('selectionchange', () => { clearTimeout(check.tm); check.tm = setTimeout(check, 250); });
    pop.addEventListener('mousedown', (e) => e.preventDefault());
    pop.addEventListener('click', (e) => {
      if (e.target.closest('[data-hl]') && pending) {
        const h = { id: String(Date.now()), ...pending };
        getSelection().removeAllRanges();
        if (apply(h)) setMine([...mine(), h]);
        pending = null; pop.hidden = true;
      } else if (e.target.closest('[data-unhl]')) {
        const id = pop.dataset.id;
        $$(`mark.user-hl[data-id="${id}"]`).forEach((m) => { const p = m.parentNode; while (m.firstChild) p.insertBefore(m.firstChild, m); m.remove(); p.normalize(); });
        setMine(mine().filter((x) => x.id !== id)); pop.dataset.id = ''; pop.hidden = true;
      }
    });
    art.addEventListener('click', (e) => {
      const m = e.target.closest('mark.user-hl'); if (!m) return;
      pop.dataset.id = m.dataset.id; pop.innerHTML = `<button type="button" data-unhl>Retirer le surlignage</button>`; place(m.getBoundingClientRect());
    });
    document.addEventListener('mousedown', (e) => { if (!e.target.closest('.hl-pop, mark.user-hl')) { pop.dataset.id = ''; if (!getSelection() || getSelection().isCollapsed) pop.hidden = true; } });

    // Notes personnelles
    if ($('[data-reviewed]')) {
      const NK = 'kr:notes';
      const sec = document.createElement('section'); sec.className = 'my-notes';
      sec.innerHTML = `<h3>Mes notes</h3><textarea rows="4" placeholder="Une astuce, une question pour le prof, un point à revoir…" aria-label="Mes notes sur cette fiche"></textarea><p class="meta">Enregistrées automatiquement sur cet appareil.</p>`;
      const ta = $('textarea', sec); ta.value = read(NK, {})[pageId] || '';
      let tm; ta.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { const n = read(NK, {}); ta.value.trim() ? (n[pageId] = ta.value) : delete n[pageId]; save(NK, n); }, 400); });
      const foot = $('.provenance', art); foot ? foot.before(sec) : art.appendChild(sec);
    }

    // Impression / PDF
    const meta = $('.doc-meta', art);
    if (meta) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip chip-print'; b.innerHTML = 'Imprimer / PDF'; b.addEventListener('click', () => window.print());
      meta.insertBefore(b, meta.querySelector('.doc-sum'));
    }
    let reopened = [];
    window.addEventListener('beforeprint', () => { reopened = $$('details:not([open])', art); reopened.forEach((d) => d.setAttribute('open', '')); });
    window.addEventListener('afterprint', () => { reopened.forEach((d) => d.removeAttribute('open')); reopened = []; });

    // Arrivée depuis la recherche : surligne les mots cherchés
    const h = new URLSearchParams(location.search).get('h');
    if (h && window.__krMark) {
      const toks = h.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1).map((t) => t.normalize('NFD').replace(/[̀-ͯ]/g, ''));
      const go = () => {
        const n = window.__krMark(art, toks, textNodes);
        const first = $('mark.hit', art);
        if (first) { first.closest('details')?.setAttribute('open', ''); const p = first.closest('.panel'); if (p && p.hidden) $(`[data-tab-btn="${p.dataset.tab}"]`)?.click(); setTimeout(() => first.scrollIntoView({ block: 'center', behavior: 'smooth' }), 200); }
        if (n) {
          const c = document.createElement('button'); c.type = 'button'; c.className = 'hit-chip'; c.textContent = `Effacer le surlignage « ${h} » ✕`;
          c.addEventListener('click', () => { $$('mark.hit', art).forEach((m) => { const p = m.parentNode; while (m.firstChild) p.insertBefore(m.firstChild, m); m.remove(); p.normalize(); }); c.remove(); });
          body.appendChild(c);
        }
      };
      setTimeout(go, 80);
    }
  }

  applyPrefs();
})();
