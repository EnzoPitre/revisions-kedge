# KEDGE Revisions — guide du projet permanent

Plateforme de révision personnelle d'Enzo (KEDGE Business School), statique, hébergée sur GitHub Pages :
https://enzopitre.github.io/revisions-kedge/ — repo : https://github.com/EnzoPitre/revisions-kedge.git (branche `main`).

## Règles absolues
1. **Ne jamais inventer le cours** : uniquement les documents fournis (définitions, formules, chiffres, méthodes, interprétations du prof). Information absente/ambiguë → l'indiquer (bloc `callout gap`). Documents contradictoires → signaler, ne pas trancher.
2. Reformuler pour simplifier, sans changer le sens. Formules : vérifier qu'elles restent mathématiquement identiques.
3. Exercices créés par moi : badge `<span class="generated">Exercice d'entraînement généré</span>`, uniquement avec notions/méthodes/formules/niveau du cours, correction détaillée (étapes de calcul).
4. Ne jamais reconstruire le site ni supprimer/modifier d'anciennes fiches sans demande, remplacement clair, ou erreur vérifiable.
5. Chaque fiche porte ses `sources` (documents d'origine). Pas de fausses matières.

## Procédure pour chaque nouveau cours
Analyse (lire tout) → Vérification (certain vs ambigu) → Fiche → Entraînement (flashcards, QCM, exercices+corrections) → Intégration → Illustration → QA → Git (commit clair + push sur `main`).
Terminer chaque chapitre par « Ce que je dois absolument savoir » (5–10 points) puis « Teste-toi ».

## Architecture
- `content/<matière>/subject.json` : `{title, description, cover, coverAlt, order, hue}` (cover = chemin relatif au site, ex. `assets/images/subjects/finance.jpg`).
- `content/<matière>/<slug>.html` : front matter (`title, chapter, order, kind: fiche|exercices, for: <slug fiche>, summary, keywords, sources, created, updated, cover, coverAlt`) + corps HTML.
- `node tools/build.mjs` génère `index.html`, `subjects/`, `exercises/`, `search/`, `progress/`, `404.html`, `assets/data/*.json`. **Les fichiers générés sont commités** (GitHub Pages sert la branche telle quelle). Toujours rebuild avant commit.
- `assets/css/style.css`, `assets/js/app.js` : UI. Incrémenter `assetVersion` dans `site.config.json` après modif CSS/JS. `assets/vendor/katex` : KaTeX local (chargé seulement si la page contient `\( \)`, `\[ \]` ou `.formula`).
- `tools/make_icons.py` : régénère les icônes PWA. Chemins toujours relatifs (site sous `/revisions-kedge/`).

## Design system (refonte « app iOS premium »)
Référence visuelle : application mobile de voyage fournie par Enzo (cartes très arrondies, photos immersives, quasi monochrome, barre flottante anthracite, pills, CTA noir pleine largeur). Tous les tokens sont en tête de `assets/css/style.css` (`--background, --surface*, --text-*, --accent-dark, --radius-*, --shadow-soft`). Ne jamais coder de valeurs en dur : réutiliser les tokens. Couleur = apportée par les photos (`cover`), pas par l'UI. Pas de rouge/orange/bleu décoratifs.
Pages : accueil (greeting, recherche, « Continuer », pills de matières, cartes), Cours, matière (hero + panneau blanc), fiche (header + onglets + accordéons + CTA), Révisions (suivi + lien Exercices), Favoris. Sur mobile, la barre flottante est masquée sur matière/fiche (CTA à la place), comme dans la référence.

## Structure d'une fiche (onglets)
Le corps est découpé en sections : `<section data-tab="fiche|retenir|flashcards|quiz|exercices">…</section>`. Les onglets sont générés à partir des sections présentes (≥ 2). Si une page `kind: exercices` a `for: <slug>`, la fiche reçoit un onglet-lien « Exercices ». Dans l'onglet fiche, découper les notions en accordéons :
`<details class="acc" open><summary><span class="acc-n">01</span><span class="acc-t"><small>Notion</small>Titre</span></summary><div class="acc-in">…</div></details>` (les notions essentielles ouvertes par défaut).

## Blocs de contenu disponibles
`<div class="callout retenir|definition|formula|method|example|warning|exercise|correction|gap"><p class="callout-t">Titre</p>…</div>` ·
correction repliable `<details class="correction"><summary>Voir la correction</summary><div class="corr">…</div></details>` ·
flashcards `<div class="flashcards"><div class="fc"><div class="fc-q">…</div><div class="fc-a">…</div></div></div>` ·
QCM `<div class="quiz" data-quiz-id="q1"><script type="application/json">{"questions":[{"q":"…","options":["…"],"answer":0,"explain":"…"}]}</script></div>` ·
liste clé `<ol class="must">` · formules `\( … \)` / `\[ … \]` · tableaux `<table>` (wrappés auto).

## Images
Locales et optimisées (JPEG ≤ ~1600 px, < 250 Ko) dans `assets/images/`, thématiquement pertinentes (Unsplash), `alt` pertinent.

## QA avant push
Build sans warning ; tester via un serveur sous le préfixe `/revisions-kedge/` (liens, CSS/JS/images/manifest, pages profondes) ; viewports 375, 390, tablette, 1440 ; aucun débordement horizontal ; formules lisibles.
