# Luvli ♡

**Make every day feel luvli.**

Luvli is a gentle personal day-management companion. It answers one question all day long:

> **“What am I supposed to be doing right now?”**

It plans your day, tells you what is happening now and next, holds the time while you focus,
reminds you softly, never makes you feel bad when you fall behind — and helps you reset at night.

Built with **plain HTML, CSS and vanilla JavaScript**. No frameworks, no build step, no backend.

There is an **account screen** first — create one, or sign in — and because Luvli has no server, an
account is a real record kept on your own device (see **Accounts** below).

---

## Running it

1. Open `index.html` in a browser (double-click it, or use *Live Server* in VS Code).
2. That's it. Everything is saved in your browser.

For the full experience (offline, installable, notifications with buttons) serve the folder,
because service workers need `http`/`https`:

```bash
npx --yes http-server . -p 8080 -c-1     # or: python -m http.server 8080
# then open http://localhost:8080
```

The first time you open Luvli it fills in a **sample day** so nothing feels empty. You can clear it
or reload it any time from **Settings → Your data**.

---

## File structure

```
index.html            the app shell (7 views + modals, toasts, FX containers)
sw.js                 service worker: offline app shell + notification buttons
manifest.json         PWA manifest (installable)
package.json          helper scripts only (check / test) — the app needs no build
css/style.css         all styling, with the design tokens at the very top
js/storage.js         localStorage state, undo history, migrations, IndexedDB mirror
js/auth.js            accounts: create, sign in, session, salted password hashing
js/scheduler.js       the brain: Right Now, Live Day, clashes, feasibility, NL parser,
                      routines, energy insights, grid renderer, timeline renderer
js/pomodoro.js        Focus mode (the Pomodoro timer is one feature, not the app)
js/notifications.js   gentle reminders (with Snooze / Start now buttons)
js/affirmations.js    affirmation library + its UI builders
js/progress.js        focus time, tasks, streaks, insight numbers
js/sync.js            optional sync hook (off by default, adapter-shaped)
js/app.js             navigation, every screen, modals, settings, interactions
js/auth-config.js     your Google OAuth client ID (real Google sign-in; empty = local)
js/coach-config.js    'local' or your AI endpoint (real LLM coach; default = on-device)
netlify/functions/    the optional real-AI coach function (Netlify)
api/                  the same coach function for Vercel
netlify.toml          deploy config: static app + the /api/luvli-coach route
tools/                plain-Node checkers and tests (no dependencies)
assets/               app icons (SVG + generated PNGs)
```

Scripts load in dependency order and share a few small globals:

| Global | Lives in | What it is |
| --- | --- | --- |
| `Utils` | storage.js | ids, dates, escaping, formatting |
| `Storage` | storage.js | the saved state, undo, migrations |
| `Auth` | auth.js | the account, the session, password hashing |
| `Scheduler` | scheduler.js | every piece of day logic and its HTML builders |
| `Affirmations`, `Progress`, `Pomodoro`, `Notifier`, `Sync` | their own files | the features |
| `UI`, `App` | app.js | toasts/modals/hearts, and the app itself |

`app.js` loads **last** so it can use everything else. Nothing else touches the DOM at load time,
which keeps the modules easy to reason about and easy to test.

---

## The look

Everything visual is driven by the tokens at the top of `css/style.css`, so a palette swap or a
tweak propagates everywhere at once:

* **Brand palette** (`--baby-pink`, `--soft-rose`, `--deep-rose`, `--text`, …) is exactly the
  original brief — the identity does not move.
* **A modern layer** sits on top of it: deeper `--ink` for headings and numbers, translucent
  `--surface-*` panels, 1px `--hairline` borders, `--sheen` inner highlights, layered `--shadow-*`
  elevation, and `--accent-peach` / `--accent-lilac` for dimension.
* **Type** uses a system UI stack for everything functional (`--font-display`) and one elegant
  serif (`--font-serif`) only for editorial moments — taglines, quotes, affirmations, the app's
  footer. Headings are tightly tracked; clocks, timers and stat numbers use tabular figures.
* **Colour-coded categories.** Every activity category has a hue (`--cat-study`, `--cat-food`, …).
  The timeline row, the day-grid block and the live list all read it through a single `data-cat`
  attribute, which is tinted with `color-mix()` where supported.
* **Motion** is short and springy (`--ease-out`, `--spring`) and every animation is disabled by
  `reduce-motion` *and* by `prefers-reduced-motion`.
* The background is an aurora mesh (`--grad-aurora`, radial washes) with a whisper of SVG film
  grain, and the browser's own chrome follows the theme via `<meta name="theme-color">`.

---

## What Luvli does

**Home** · Greeting, date, today's progress ring, a check-in (“How are you feeling today? ♡”), the
**RIGHT NOW** card (the live activity, or free time and the next one), the Live Day list
(Right now / Next / Later / Done), Luvli's helpers and a rotating affirmation.

**What should I do now?** · Ranks everything sensibly: what is happening → what starts soon →
what you missed (kindly) → a free-window task from your list → a wellness pause → “your day is a
blank page”. Every answer explains itself and can be started, ticked off or placed.

**My Day** · Day navigation, the **Smart Scheduler** list, quick routines, a **draggable Day grid**
(drag to move, drag the bottom edge to stretch — 5-minute snapping and clash-aware) and the full
activity list with complete / edit / reschedule / delete.

**Smart planning**
* **Natural language** — type “python 45m high tomorrow 10:00” and Luvli fills the form in.
* **Clash detection** — overlapping something? *Fit it in for me*, *keep both anyway* or *change the time*.
* **Optimize My Day** — fits missed work and your list into the time that is actually free, keeping
  buffers, preferring your strongest focus hours and never planning past your sleep time.
* **Feasibility forecast** — “Today needs 4h but only 2h are free” with *Move the extra to tomorrow*.
* **Lighten My Day / Rescue me** — “I'm behind / I'm tired / less time than I thought”.
* **Repeating activities** and **routines** (Morning, Study block, Wind down).
* **Energy insights** — learns which hours you actually finish things, and how long work takes you.
* **Smart breaks** — notices when you have gone 90+ minutes without a pause.

**Study** · Subjects with goals and automatically advancing progress, session logging, history and
streaks. **Focus** · A real Pomodoro with 25/5, 40/10, 50/10 or custom, rotating affirmations,
full-screen do-not-disturb mode, wake lock, haptics, an optional chime and a soft break offer.

**Progress** · Today/week focus, tasks, sessions, streaks, a weekly chart, mood history and a
“What Luvli has learned” card. **Affirmations** · Categories, favourites and your own words.

**Settings** · Your **account** (name, email, sign out), profile, wake/sleep, 12/24-hour clock,
focus lengths, full-screen focus, chime, reminders (lead time, evening wind-down, celebrations),
planning, themes (Rose, Lavender, Peach, Sage, Cozy dusk), reduce motion, study apps, distractions,
optional sync and your data.

---

## Real integrations (both optional, both off by default)

Luvli ships local-first and works completely with nothing configured. Two things can be made
**real** by pointing Luvli at services *you* control — and until you do, Luvli is honest about
running its on-device version instead.

### 1 · Real Google sign-in
Out of the box the "Continue with Google" button is a clearly-labelled local stand-in (it tells
you it is local). Give it a Google OAuth client ID and the very same button becomes the genuine
Google Identity Services flow — Google shows its own account chooser and returns a signed ID
token, which Luvli decodes for your name and email.

1. Google Cloud Console → **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**.
2. Add your site under **Authorised JavaScript origins** (`http://localhost:8080`, your domain…).
3. Paste the client ID into [`js/auth-config.js`](js/auth-config.js) → `google.clientId`.

That is the whole change: `js/auth-ui.js` loads Google's library on demand, and falls back to the
local stand-in if Google cannot be shown, so nobody is ever stranded. A client ID is public — it is
safe to ship. There is no secret to leak, and Luvli never stores a Google password.

### 2 · Real AI coach (an actual LLM)

[`ai-coach.html`](ai-coach.html) has a coach that answers every message. By default that is
Luvli's own on-device understanding engine — real, private and offline, but not a language model.
Point it at the small serverless function shipped in this repo and every message is answered by a
real model instead, with your live day as context.

**Why a function?** A model API key pasted into browser JavaScript is a key given away. So the key
lives in an environment variable on your function; the browser only ever calls your own endpoint.

* Netlify: [`netlify/functions/luvli-coach.js`](netlify/functions/luvli-coach.js) (served at
  `/api/luvli-coach` by [`netlify.toml`](netlify.toml)).
* Vercel: [`api/luvli-coach.js`](api/luvli-coach.js).

Works with **OpenAI** or **Anthropic** (set `COACH_PROVIDER`). Then in
[`js/coach-config.js`](js/coach-config.js):

```js
mode: 'model',
endpoint: '/api/luvli-coach'
```

Environment variables on your host:

| Variable | Required | What it is |
| --- | --- | --- |
| `COACH_API_KEY` | yes | your model provider key |
| `COACH_PROVIDER` | no | `openai` (default) or `anthropic` |
| `COACH_MODEL` | no | e.g. `gpt-4o-mini`, `claude-3-5-haiku-latest` |
| `LUVLI_ALLOWED_ORIGIN` | no | lock CORS to your site |

It is **fail-soft by design**: if the key is missing, the model errors, or the network drops, the
function returns `{ degraded: true }` and the page quietly falls back to the on-device brain. The
coach can never go dead because a call failed — and a line under the composer always says plainly
whether the on-device coach or a real model is answering.

---

## Accounts ♡

Luvli opens on a welcome screen: **create an account** or **sign in**. There is no server, so an
account is an honest, local thing — a record in this browser with:

* your **name** and **email** (the email is matched case-insensitively, so it always finds you),
* a **salted SHA-256 hash** of your password (via Web Crypto) — never the password itself,
* the **avatar colour** you picked, and
* a **session** remembering that you are signed in.

The screen is a modern, two-tab layout (Create account / Sign in) with inline field checks, a
show/hide password eye, colour swatches and a “Keep me signed in” toggle. **Settings → Your
account** shows who is signed in, lets you rename yourself, and signs you out — nothing is ever
deleted, so you can sign straight back in. Signing out returns you to the gate; a fresh person sees
the create-account tab, and a returning one sees sign-in.

It is deliberately small and framework-free: `js/auth.js` exposes
`Auth.signUp() / signIn() / signOut() / current()`, and the state lives under `state.auth`.

**Google sign-in** goes through the same front door: `Auth.signInWithGoogle(identity)`. When a
client ID is set in `js/auth-config.js` the identity comes from real Google; otherwise it is the
labelled local stand-in. Either way the account record lands in the same `state.auth` slice, so
nothing downstream changes.

**Swapping in a hosted backend** (Supabase, Firebase, your own API): `js/auth.js` keeps every
persistence call behind `Auth.setProvider({...})`. Set a provider once from an auth page and the
whole account UI keeps working — the four-call contract is documented at the top of that file.

---

## Privacy, data and offline

* Everything is **local-first**: one JSON object in `localStorage` (`luvli.state.v1`) — the
  account, the session and the whole day together.
* **Your password is never stored.** Luvli keeps only a salted hash (SHA-256 via Web Crypto), and
  the form checks never send anything anywhere.
* A quiet **IndexedDB mirror** keeps a device backup for recovery (`Storage.restoreFromDevice()`).
* Focus sessions older than 90 days are folded into a monthly summary, so a year of Luvli stays small.
* The **service worker** caches the app shell, so Luvli opens and works with no connection.
* **Sync is optional and off by default.** `js/sync.js` only talks to an endpoint *you* provide
  (your own server, a serverless function, Supabase, a Pi in a drawer). Nothing leaves the device
  until then.
* Distraction support is **preference storage only** — Luvli never closes or blocks other apps.

---

## Accessibility and keyboard

Focus is trapped inside dialogs and returned when they close, the Right Now activity is announced
through a polite live region, there is a skip link, `aria-pressed` on everything toggle-like, and
both `prefers-reduced-motion` and `prefers-contrast` are respected.

`1…7` jump between pages · `N` new activity · `F` focus · `W` what should I do now · `O` optimize ·
`L` lighten · `R` rescue · `U` undo · `Space` pause/resume · `?` show the list · `Esc` close.

---

## Working on it

```bash
npm run check      # static wiring + stylesheet sanity
npm test           # logic checks + interaction checks
npm run verify     # everything
```

The tools are plain Node scripts with no dependencies:

* `tools/check-static.js` — ids used from JS that exist nowhere, selectors that match nothing,
  buttons with no handler, handlers with no button.
* `tools/check-css.js` — brace/paren balance, classes used in markup without a rule, every activity
  category having a colour hook, and every `var(--…)` being defined.
* `tools/smoke-test.js` — runs the logic modules in Node with a small shim and checks the day
  intelligence: Right Now, Live Day, clashes, feasibility, the parser, undo, routines, insights,
  migrations, compaction and persistence.
* `tools/auth-test.js` — checks the account system (31 checks): validation, creating an account,
  that the raw password never reaches storage, duplicate emails, wrong passwords, signing out and
  back in, renaming, and that the session survives a reload.
* `tools/boot-test.js` — loads **every** module with a light DOM shim and fires real clicks at the
  real handlers (77 checks), catching the typos and broken wiring a syntax check cannot see.

A short list of classes (`hero`, `card-progress`, …) exists purely as semantic hooks beside `.card`;
they intentionally carry no rules of their own.

---

## How the day logic works

* **Right Now** — `Scheduler.liveStatus(date, state, nowMinutes)` compares the clock with your
  schedule and returns the current activity, what's next, what's later and what slipped past.
* **Free time** — `Scheduler.freeSlots()` finds the honest gaps (respecting your buffer) between
  activities; everything else builds on it.
* **Optimize** — `optimizeDay()` places missed work and your list into those gaps, preferring your
  strongest focus hours for heavy work, respecting `maxPlannedHours`, and never touching protected
  categories (meals, rest, appointments, sleep, breaks).
* **Lighten / Trim** — `lightenDay()` and `trimDay()` move the gentlest things to tomorrow.
* **Learning** — `focusInsights()` reads your own history (sessions plus finished activities) to work
  out your best hours and typical task lengths.

Change state through `Storage.update(mutator, reason)`: it saves, pushes an undo snapshot and tells
the UI which screens to repaint (batched once per animation frame).

---

## Ideas for later

* Real AI for the *scheduler*: swap `Scheduler.suggestions()` for a model call — the coach
  endpoint is a working template to copy.
* Native apps that can act on the study/distraction preferences.
* Shared plans (a partner or study group seeing the same day).

---

Made with ♡ — keep the tokens in `css/style.css` and the voice in the copy, and Luvli will
always feel like Luvli.
