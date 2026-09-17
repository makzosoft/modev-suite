# Modev Suite

**Build, preview, and ship code entirely from your phone — no laptop, no hosting, no build step.**

Modev Suite is a small collection of standalone HTML files that work together as one app. Drop them into any folder, open `hub.html`, and you get a responsive-design previewer, a full code editor with GitHub integration, a GitHub/Vercel publishing workflow, and a settings panel — all running as local files with zero setup.

---

## Quick start

1. Open **`hub.html`** — everything lives behind this one entry point.
2. On Android, tap the browser's **⋮ menu → Add to Home screen** to get an app-like icon (see [Add to Home Screen](#add-to-home-screen) below for what that does and doesn't include).
3. To use the GitHub-connected features (Code, GitHub, and GitHub-browsing inside Device Lab), generate a **Personal Access Token** at `github.com/settings/tokens` and paste it in when prompted. It's stored only in your browser's local storage — never sent anywhere but `api.github.com`.
4. To deploy to Vercel, generate a token at `vercel.com` → **Settings → Tokens** and paste it in from the GitHub tab's **⋯ More** menu, or manage it directly in **Settings**.

---

## The five tabs

Tab order: **Code · Lab · 🐞 Bug · GitHub · Settings**

### 💻 Code — the editor
- CodeMirror 6 under the hood: real syntax highlighting, bracket matching, autocomplete (suggestions surface in a tap-friendly bar near the top of the screen, not buried under your thumb at the cursor).
- **Two sources, side by side**: open files from a connected **GitHub repo** or a **local folder** — switch between them with the tabs at the top of the file drawer. You can even have a GitHub file and a local file open in tabs at the same time.
- **Multiple open files** at once, each its own tab, each with independent undo history.
- **Create, rename, and delete** files and folders (GitHub side).
- **Local folder saving**: on desktop, Save writes straight back to disk via the File System Access API. On Android, there's no write-back API for folder-picker files by platform design — Save downloads the edited file instead, clearly labeled, and you replace it manually.
- **Autosave drafts** to local storage as you type — a lost connection or a killed tab never loses work; reopening the file offers your draft back.
- **Conflict check**: if a GitHub file changed remotely since you opened it, Save warns before overwriting.
- **Emmet** abbreviation expansion, **Prettier** formatting, **Find & Replace**.
- **Live preview** with real device framing (the same size presets as the Lab tab) for HTML, and direct rendering for **Markdown, images, video, and PDF**. The preview's console/REPL lives behind a floating button so it's out of the way until you need it.
- Not a real terminal — that needs a server this suite deliberately doesn't have. The "console" is a JS REPL scoped to whatever's in the live preview, which is the honest equivalent.

### 📱 Lab — Device Lab
- Preview any page at real device sizes: a long list of phone/tablet/laptop/desktop presets (including iPhone 17 and iPhone Air), or type a custom width/height.
- **Two sources**: a local project folder (File System Access on desktop, folder picker on Android, or drag-and-drop) or a **connected GitHub repo** — pick a file from either and it renders framed at your chosen size.
- **Grid mode**: compare up to 4 sizes side by side.
- **Screenshot** (PNG) and **video recording** (auto-scrolling `.webm` clip) of the current frame — both work by rendering a same-origin copy of the page for capture, which is what makes them reliable regardless of where the file came from.
- Changing device size or rotating **reloads the page**, on purpose — many sites measure `window.innerWidth` once at load, and a plain resize would leave stale values from whatever size loaded first.
- Mobile layout is a proper accordion (one section open at a time) instead of one long scrolling list.

### 🐞 Bug — debug console
- A single console that aggregates `console.log`/`warn`/`error` and uncaught errors from **every tab**, tagged by which tool logged it.
- Errors and warnings include the file and line they came from.
- Common failure patterns (bad token, rate limit, 404, a CDN library failing to load) get a plain-language hint underneath, not just a raw error.

### GitHub — repo management
- Browse any repo/branch/folder you have access to.
- **Nothing reaches GitHub until you tap Push.** Dragging a file or tapping delete stages the change into a **Pending changes** queue first — review it, undo/redo your staging decisions, then push. (Undo/redo here affects the queue, not commits already on GitHub — that's what `git revert` is for.)
- **Zip upload with extraction**: drop a `.zip`, check "Extract contents," and it unzips and stages every file inside, overwriting matching paths.
- **Diff preview** before pushing — see exactly what a file will change to, or what a zip will add.
- **Download** the whole repo as a `.zip`, or any single file.
- **Branches**: create a new one from the current branch; **open a pull request** once you're on a feature branch.
- **Publish to GitHub Pages** in one tap, with a persistent 🌐 link in the topbar once it's live — and turn it back off the same way.
- **Deploy to Vercel** — paste a token once, then one tap builds and deploys the repo's current files directly (no separate GitHub↔Vercel account linking needed).
- **Collaborators**: see who has access, change their permission level, remove them, or invite someone new.
- **Commit history** with a pass/fail indicator on the latest commit if the repo has CI configured.
- Reconnecting is instant — a saved token shows the app immediately rather than re-checking over the network on every tab switch, so switching tabs feels like one connected app, not five separate logins.

### ⚙️ Settings
- Manage the **GitHub** and **Vercel** tokens in one place — connect, replace, or disconnect either, independent of whichever tool you're in.
- See how much local storage each tool is using; clear unsaved code drafts or remembered paths.
- Add to Home Screen guidance.

---

## How it's built

- **No build step, no bundler, no npm install.** Every `<script>` tag loads its library straight from a CDN (esm.sh, unpkg) at runtime.
- **No backend.** Every "connected" feature (GitHub, Vercel) is a Personal Access Token stored in `localStorage` and used to call that service's public API directly from your browser.
- **Memory-conscious by design**: the hub loads each tool into an iframe and fully unloads it (`about:blank`) before loading the next, so switching tabs actually frees the previous tool's memory — this is why a cached token is used optimistically rather than kept "alive" across tab switches.
- **Branding**: navy (`#0a0e27`) background, violet-to-magenta gradient accent (`#6826fc` → `#d727f1`), matching the Modev mark. Icons are a shared inline-SVG set (`icons.js`) rather than emoji, rendered consistently regardless of device/font.

## Known limitations (on purpose, not bugs)

- **Add to Home Screen**: works to get an icon on Android, but a plain local file can't meet the criteria browsers require for a full offline-installable PWA (that needs HTTPS). If you push this suite to a GitHub Pages–enabled repo — which the GitHub tab can now do for you — reopening it over HTTPS unlocks that.
- **Local folder saving on Android** is read + download, not read + write-in-place — there's no browser API for the latter when a folder was picked via the standard file input.
- **Live preview asset inlining** (for local and GitHub-sourced HTML) handles `<link>`, `<script src>`, and `<img>` one level deep. It won't chase CSS `@import`, `@font-face`, or JS-loaded assets — for full-fidelity previews of a real local project, Device Lab's `.src`-based rendering (not the live-preview path) is the more complete option.
- **GIF export** was considered and intentionally left out.

---

*Last updated to reflect the suite as of the icon/branding pass, GitHub Pages + Vercel publishing, collaborator management, and the local-folder editing support in Code Editor and Device Lab.*
