# CLAUDE.md

Instructions for Claude (and anyone else) changing Depthworks. Read [AGENTS.md](AGENTS.md) for how the code fits
together and the rules that keep it working, and [HANDOFF.md](HANDOFF.md) for where things stand.

## Every change players will notice comes with two more things

A change is not done until both of these are done too, in the same commit as the change itself.

### 1. The wiki

The wiki (`wiki/`, opened in game with F2) must always describe the game as it is.

- **Generated pages follow the data by themselves.** Every item, building, fluid, technology and biome page, and
  every table of numbers, is built from `src/data.js`. Add or change something there and its page changes with it.
- **Articles are written by hand** in `wiki/articles/*.js` (wikitext: see the top of `wiki/wiki.js`). Whenever a
  mechanic, a rule, a control, a recipe chain or a piece of advice changes, find every article that mentions it and
  update it: search the articles for the names involved. Add a new article (or section) for a new system, link it from
  the pages that should point to it, and add redirects in `ALIASES` (`wiki/articles/index.js`) for the words players
  will search for. Retired things: remove their mentions, and say briefly what replaced them.
- **Check it renders.** Serve the game, open `/wiki/`, and run this in the console. It must print empty lists:

  ```js
  const { PAGES, wikify, resolve } = window.wiki, bad = [], ids = new Map();
  for (const p of PAGES.values()) ids.set(p.title, new Set(wikify(p.src()).heads.map(h => h.id)));
  for (const p of PAGES.values()) {
    const d = document.createElement('div'); d.innerHTML = wikify(p.src()).html; p.box?.();
    d.querySelectorAll('a.new').forEach(a => bad.push(`${p.title}: broken link ${a.textContent}`));
    if (/\{\{|\[\[|''|undefined/.test(d.textContent)) bad.push(`${p.title}: leftover markup`);
    d.querySelectorAll('a[href^="#/"]').forEach(a => { const [t, s] = decodeURIComponent(a.getAttribute('href').slice(2)).split('/');
      const r = s && resolve(t.replace(/_/g, ' ')); if (r && !ids.get(r.page.title)?.has(s)) bad.push(`${p.title}: no section ${t}#${s}`); });
  }
  bad
  ```

### 2. The change log

`src/changelog.js` is the change log. The title screen's **Change logs**, the wiki's **Changelog** page, the main
page's recent changes and the version in the title screen's corner all come from it.

- **Add an entry at the top** for every push players will notice. Several changes pushed together share one entry.
- **Version numbers:** `0.minor` for a push that adds a new system or reworks one; `0.minor.patch` for fixes,
  tweaks and small additions. The owner can always ask for a specific number: use it. `stage` stays `'alpha'` until
  the owner says otherwise.
- **The entry:** `version`, `stage`, `date` (the day it is pushed, `YYYY-MM-DD`), a short `title`, a one-sentence
  `summary`, and `changes`: one item per change, written for players, not programmers.
- **Explain, don't just list.** Each change says what is different and, when it isn't obvious, why it changed and
  what happens to existing worlds ("old lifts become angled belts where they stand"). Bold the change's name with
  `<b>` at the start of the bigger items. Plain words, short sentences, no code names.
- If an unpushed entry is already at the top (from earlier in the same session), add to it instead of starting another.

## Pushing

- **Don't commit or push until the owner says so** ("push"). Pushing to `main` deploys the live site.
- Before pushing, make sure the wiki and the change log describe everything in the push.
- Commit messages: imperative subject, a body that explains the change, and the co-author line used in history.
