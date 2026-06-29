# LibriQ v2 — Design System & Implementation Handoff

> Final senior design review. This is a **refinement + audit + handoff**, not a redesign.
> Every token below reflects what is already implemented in the React preview, expressed so it ports
> cleanly to the existing **Vanilla HTML/CSS/JS** app. No framework rewrite, no backend features.

---

## 1. Design System

### 1.1 Color tokens

Define once as CSS custom properties on `:root`. The app is dark-only; there is no light theme.

```css
:root {
  /* Surfaces (warm black → ink) */
  --bg:            #0D0C0A;   /* app background */
  --surface-1:     #0E0D0B;   /* sidebar, nav, top bars */
  --surface-2:     #111009;   /* cards */
  --surface-3:     #141210;   /* nested cards, inputs, stat tiles */
  --surface-4:     #1A1814;   /* tooltip / popover / image placeholder */

  /* Gold accent ramp */
  --gold:          #C9A84C;   /* primary accent, CTAs */
  --gold-hover:    #D8B65A;   /* hover (≈ brightness 110%) */
  --gold-strong:   #8B6E2E;   /* gold text on tinted chips */
  --gold-04:       rgba(201,168,76,0.04);  /* faint fill */
  --gold-06:       rgba(201,168,76,0.06);
  --gold-08:       rgba(201,168,76,0.08);  /* hairline borders */
  --gold-10:       rgba(201,168,76,0.10);
  --gold-12:       rgba(201,168,76,0.12);  /* active nav fill */
  --gold-18:       rgba(201,168,76,0.18);  /* hover border */
  --gold-22:       rgba(201,168,76,0.22);  /* phone card border */

  /* Text ramp (audited — see §3) */
  --text-strong:   #F5F0E8;   /* headings, stat numbers */
  --text-primary:  #D5CCBE;   /* card titles, body emphasis */
  --text-body:     #9B9083;   /* paragraphs, subtitles (AA on --bg) */
  --text-muted:    #8A7E70;   /* section subtitles */
  --text-dim:      #7A6E60;   /* secondary metadata (audited up from #5A5044) */
  --text-faint:    #4A4438;   /* timestamps, captions, disabled-ish */

  /* Status / semantic */
  --green:         #6BAA75;   /* finished, success, ≥80% progress */
  --green-deep:    #4E9E62;
  --blue:          #7B9DC9;   /* "reading now" */
  --orange:        #E87B4B;   /* streak / flame */
  --purple:        #7B6ABA;   /* "exploring" roadmap */
  --red:           #9B5E5E;   /* DNF */
  --danger:        #D4574E;   /* destructive (delete) */

  /* Chart genre palette */
  --chart-1: #C9A84C;
  --chart-2: #7B6ABA;
  --chart-3: #4A8FA8;
  --chart-4: #6BAA75;
  --chart-5: #8BAD5A;

  /* Borders */
  --border-hairline: rgba(201,168,76,0.07);
  --border-soft:     rgba(255,255,255,0.06);
  --border-divider:  rgba(255,255,255,0.03);
}
```

**Rule:** never hard-code hex in components — reference the token. The React build scattered raw hex
for speed; in the Vanilla port, centralise everything here (this *is* Phase 1).

### 1.2 Typography scale

Two families only. Headings = **Playfair Display** (serif), everything else = **DM Sans**.

```css
:root {
  --font-serif: 'Playfair Display', Georgia, serif;
  --font-sans:  'DM Sans', system-ui, sans-serif;
}
```

| Token | size | weight | family | usage |
|---|---|---|---|---|
| `--t-display` | `clamp(2.5rem, 8vw, 6rem)` | 800 | serif | hero H1 |
| `--t-h2`      | `clamp(1.6rem, 4vw, 2.8rem)` | 700 | serif | section headings |
| `--t-h1-app`  | `clamp(1.25rem, 5vw, 1.75rem)` | 700 | serif | in-app page titles |
| `--t-stat`    | `clamp(1.4rem, 4vw, 1.875rem)` | 700 | serif | stat-card numbers |
| `--t-card`    | `0.9375rem` | 600 | serif | card section titles |
| `--t-body-lg` | `clamp(0.9rem, 2.5vw, 1.125rem)` | 400 | sans | hero subtitle |
| `--t-body`    | `0.875rem` | 400 | sans | paragraphs |
| `--t-sm`      | `0.8rem` | 400 | sans | secondary text |
| `--t-xs`      | `0.72rem` | 400/500 | sans | labels, metadata |
| `--t-eyebrow` | `0.72rem` | 500 | sans | UPPERCASE, `letter-spacing: 0.08em` |

Line-heights: display/headings `1.0–1.25`; body `1.6–1.75`.
**Do not** apply Tailwind-style font-size/weight overrides on `h1–h4` in the Vanilla app — set them once here.

### 1.3 Spacing scale

4px base. Use only these steps.

```css
--space-1: 4px;   --space-2: 8px;   --space-3: 12px;  --space-4: 16px;
--space-5: 20px;  --space-6: 24px;  --space-7: 28px;  --space-8: 32px;
--space-10: 40px; --space-12: 48px; --space-16: 64px; --space-20: 80px;
```

Section vertical rhythm: mobile `64px` (`py-16`), desktop `128px` (`py-32`).
Card padding: mobile `16px`, desktop `20px`. Content gutters: mobile `16–20px`, desktop `28px`.

### 1.4 Border radius

```css
--r-sm: 8px;    /* chips, small controls, progress bars use 9999 */
--r-md: 12px;   /* inputs, list rows, stat tiles (mobile cards) */
--r-lg: 16px;   /* cards (desktop) */
--r-xl: 20px;   /* large containers, modals */
--r-2xl: 24px;  /* browser-frame mock */
--r-phone: 36px;/* mobile app preview card */
--r-pill: 9999px;
```

### 1.5 Shadows & glows

```css
--shadow-card:    0 8px 24px rgba(0,0,0,0.4);
--shadow-cover:   0 4px 12px rgba(0,0,0,0.4);          /* book covers */
--shadow-modal:   0 40px 80px rgba(0,0,0,0.6);
--shadow-frame:   0 32px 64px rgba(0,0,0,0.55), 0 0 80px rgba(201,168,76,0.03);
--shadow-phone:   0 48px 96px rgba(0,0,0,0.6), 0 0 120px rgba(201,168,76,0.06);
--glow-gold:      0 0 12px rgba(201,168,76,0.40);      /* active progress bar */
--glow-green:     0 0 12px rgba(107,170,117,0.40);     /* completed progress */
```

Glows are reserved for progress fills and the hero/phone preview only — not for general cards.

### 1.6 Layout grid

- Centered single column, `max-width` per context:
  - Marketing sections: `1024px` (`max-w-5xl`)
  - In-app content: `1024px`, gutters `28px`
  - Book detail: `768px` (`max-w-3xl`)
  - Phone preview card: `390px`
- Card grids use CSS Grid with `gap: 12–16px`.

### 1.7 Breakpoints

```css
/* mobile-first; values match the React useBreakpoint hook */
--bp-tablet: 768px;   /* ≥768 = tablet */
--bp-desktop: 1024px; /* ≥1024 = desktop */
```

| Range | Name | Nav pattern |
|---|---|---|
| `< 768px` | mobile | top bar + bottom tab nav, no sidebar |
| `768–1023px` | tablet | 60px icon-only sidebar |
| `≥ 1024px` | desktop | 220px full sidebar (collapsible → 60px) |

---

## 2. Component Specs

### Buttons
| Variant | Fill | Text | Border | Height | Radius |
|---|---|---|---|---|---|
| Primary | `--gold` | `#0D0C0A` 600 | none | 44px (mobile) / 40px | `--r-md` |
| Secondary | `--gold-04` | `--text-body` 500 | `--gold-12` | same | `--r-md` |
| Success | `--green` | `#0D0C0A` 600 | none | 40px | `--r-md` |
| Ghost/icon | transparent | `--text-faint` | none | 36–40px square | `--r-md` |

States: **hover** `filter: brightness(1.1)`; **active** `transform: scale(0.95)`; **focus** see §3;
**disabled** `opacity: 0.5; cursor: not-allowed; pointer-events: none`.
Always pair label + icon (`ArrowRight` for forward CTAs). Min touch target **44×44** on mobile.

### Search bars
- Trigger (sidebar/top): `--surface-3` fill, `--border-soft`, search icon `--text-faint`, `⌘K` hint right.
- Modal input: 54px row, `--gold` icon, `--text-strong` value, autofocus (50ms delay on mobile).
- Mobile: full-screen sheet (`100dvh`, safe-area insets); desktop: centered modal `max-w-xl`, top offset `80px`.

### Navigation (in-app)
- **Mobile top bar** — 52px: logo/back-left, centered page title, search button right.
- **Mobile bottom nav** — 4 tabs (Dashboard/Library/Favorites/Statistics), icon + label, ≥56px tall, `env(safe-area-inset-bottom)` padding, active = `--gold`, inactive = `--text-faint`.
- **Marketing nav** — fixed, transparent → `rgba(13,12,10,0.88)` + blur on scroll > 20px.

### Sidebar (tablet/desktop)
- Desktop 220px: logo (back to landing), search trigger, "LIBRARY" eyebrow, 4 nav items, "currently reading" count widget, collapse toggle → 60px.
- Tablet 60px: logo, search icon, 4 icon buttons (40×40), tooltips on hover.
- Active item: `--gold-12` fill, `--gold` text, trailing 4px dot (desktop).

### Stat cards
- `--surface-3` (mobile) / `--surface-2` (desktop), `--border-hairline`, radius `--r-md`/`--r-lg`.
- Layout: tinted icon chip (color@18%) → serif number (`--t-stat`) → label (`--t-xs`, `--text-dim`).
- Optional trend pill top-right (`--green`). Grid: **2-col mobile, 4-col ≥768px**.

### Book cards
- Grid card: `2/3` aspect cover, favorite heart (appears on hover, always tappable on mobile), finished badge (✓ chip — **icon, not color alone**), title (ellipsis), author, then status-specific footer (progress % / stars / page count).
- List row: 36×48 cover, title+author, genre (≥md), progress/status, hover-reveal heart.
- Grid columns: `2 → sm:3 → md:4 → lg:5 → xl:6`.

### Progress bars
- Track `rgba(255,255,255,0.06)`, height `2–3px`, radius pill.
- Fill: gradient `--gold` (`<80%`) or `--green` (`≥80%`/complete) + matching glow.
- **Always** pair with a numeric `%` label (never color-only).

### Reading goal ring
- SVG, two `<circle>` (track + arc), `stroke-linecap: round`, `-90deg` rotation, `stroke-dashoffset` = `2πr·(1 − pct/100)`, 1s ease transition.
- Sizes: phone strip `50px r20`, dashboard `90px r38`. Center: serif count + "of N".

### Modals
- Backdrop `rgba(0,0,0,0.7)` + `blur(10px)`. Panel `--surface-3`, `--gold-12` border, `--shadow-modal`, radius `--r-xl`.
- Desktop centered; **mobile → full-screen** with safe-area insets. Close on backdrop click + ESC.

### Bottom sheets (mobile pattern for detail/search)
- Slide up from bottom, radius top `--r-xl`, grab handle optional, `max-height: 92dvh`, internal scroll, footer pinned with safe-area padding. Book Detail on mobile may use full-screen page instead.

### Chart cards
- Container = standard card. Recharts → in Vanilla use lightweight SVG/canvas.
- Bars: `--gold` @ 0.8 opacity, radius `[4,4,0,0]`. Line: `--gold` 2px, 3px dots. Donut: genre palette, `innerRadius` ~0.7×outer.
- Custom tooltip: `--surface-4`, `--gold-12` border, dim label + bold colored value.
- **Each chart needs a unique DOM `id`** (clip-path collision bug — see notes).

### Badges / chips
- Genre chip: `--gold-06` fill, `--gold-strong` text, `--gold-10` border, pill.
- Status pill (roadmap): `color@18%` fill, `color` text, `color@30%` border, capitalized.
- Filter chip: active `--gold-12` + `--gold` border + count badge; inactive `rgba(255,255,255,0.02)`.

### Toast notifications
- Bottom-center (mobile) / bottom-right (desktop), `--surface-4`, `--gold-12` border, `--shadow-modal`.
- Icon + message; auto-dismiss 3–4s; success uses ✓ + `--green`. Use `sonner`-equivalent or a tiny Vanilla queue.

### Loading skeletons
- Shimmer block: base `--surface-3`, animated gradient sweep `rgba(255,255,255,0.04)`.
- Provide skeletons for: stat tiles, book cards (cover + 2 lines), list rows, chart card (pulsing block).
- `@media (prefers-reduced-motion)` → static `--surface-3`, no sweep.

### Empty states
- Dashed border `--gold-12`, centered icon (`--surface` tone), primary line `--text-dim`, helper line `--text-faint`, optional CTA. (Favorites already implements this — use as canonical example.)

---

## 3. Accessibility Audit

**Contrast fixes (apply in Phase 1):**
- Body/paragraph text raised to `#9B9083` (≈4.6:1 on `--bg`) — was `#7A7060`.
- Secondary metadata raised to `#7A6E60` from `#5A5044`.
- Section subtitles `#8A7E70`. Keep `--text-faint #4A4438` only for non-essential captions/timestamps (decorative, not informational).

**Focus states (define globally):**
```css
:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
  border-radius: inherit;
}
```
Every interactive element (button, link, nav item, chip, card, input, star, page stepper) must show it. Never `outline: none` without a replacement.

**Hover / active / disabled:**
- Hover: `brightness(1.1)` (fills) or border → `--gold-18` (cards).
- Active: `scale(0.95–0.99)`.
- Disabled: `opacity 0.5`, no pointer events, `aria-disabled="true"`.

**Touch targets:** min **44×44px** on mobile — bottom nav (56px), top-bar search (36→ pad to 44 hit area), page steppers, stars, heart buttons.

**Don't rely on color alone:**
- Finished = ✓ icon **and** green. Reading status = icon + text label. Progress = bar + `%`. Roadmap status = text label + color.

**Semantics:** real `<button>`/`<a>`; `aria-label` on icon-only controls (search, favorite, close, steppers); `aria-current="page"` on active nav; `role="dialog"` + `aria-modal` + focus trap on modals; `alt` text on every cover; `prefers-reduced-motion` respected for the scroll bounce, skeleton shimmer, and ring animation.

---

## 4. Responsive Rules

**Phone (`<768px`)**
- Top bar + bottom tab nav; no sidebar.
- One column. Stats 2×2. Books `2-col` grid or list.
- Search = full-screen sheet. Book detail = full-screen page. Modals fill viewport.
- Marketing showcase = **native MobileAppCard** (no browser chrome). Charts stack; heatmap scrolls horizontally.
- No horizontal page scroll anywhere (`overflow-x: hidden` on root + content).

**Tablet (`768–1023px`)**
- 60px icon sidebar.
- Dashboard 2-col; library 4-col; stats 2-col charts. Comfortable padding (compact card variant).
- Showcase = browser frame + icon sidebar + content.

**Desktop (`≥1024px`)**
- 220px collapsible sidebar.
- Dashboard 3-col regions (reading 2/3 + goal 1/3; activity 2/3 + finished 1/3).
- Library up to 6-col; stats full 2-col charts + heatmap. Showcase = full browser frame.

**Fluid type:** all headline/title sizes use `clamp()` so nothing is cut off between breakpoints.

---

## 5. Implementation Roadmap (Vanilla HTML/CSS/JS)

Ship in order. Each phase is independently mergeable.

### Phase 1 — Global design tokens
- **Files:** `styles/tokens.css` (new), `styles/base.css`, `index.html` (font `<link>`).
- **Difficulty:** Low · **Risk:** Low–Med (touches everything visually).
- **Test:** fonts load; no broken colors; contrast spot-check (paragraphs ≥4.5:1); reduced-motion honored.

### Phase 2 — Buttons / cards / forms
- **Files:** `styles/components.css`, shared button/card/input partials or render helpers.
- **Difficulty:** Low · **Risk:** Low.
- **Test:** all button variants + states; focus-visible visible everywhere; inputs/search styled; 44px targets.

### Phase 3 — Dashboard redesign
- **Files:** `dashboard.html`/template, `js/dashboard.js`, dashboard CSS.
- **Difficulty:** Med · **Risk:** Med (stat math, goal ring SVG).
- **Test:** stats 2/4-col; currently-reading progress correct; goal ring offset math; recently-finished stars; greeting by time of day.

### Phase 4 — Library redesign
- **Files:** `library.html`, `js/library.js`, library CSS.
- **Difficulty:** Med · **Risk:** Med (filter/sort/view-toggle state).
- **Test:** grid columns per breakpoint; filter chips + counts; sort (recent/title/author/progress); grid↔list toggle; favorite toggle; empty state.

### Phase 5 — Search & Book Details
- **Files:** `js/search.js`, search modal/sheet partial, `book-detail.html`, `js/book-detail.js`.
- **Difficulty:** Med · **Risk:** Med (focus trap, ⌘K, page-progress writes to local storage).
- **Test:** ⌘K + ESC; mobile full-screen vs desktop modal; live filtering; recents; page stepper clamps 0..pages; "mark finished" flips status; star rating; favorite sync.

### Phase 6 — Statistics
- **Files:** `statistics.html`, `js/stats.js`, chart helpers, stats CSS.
- **Difficulty:** Med–High · **Risk:** Med (charting without React/Recharts).
- **Test:** bar/line/donut render from local data; unique chart `id`s (no duplicate-key/clip-path issues); tooltips; heatmap scrolls on mobile; avg-rating handles zero rated books.

### Phase 7 — Mobile polish
- **Files:** global responsive CSS, nav partials, `js/breakpoint.js` (resize listener).
- **Difficulty:** Med · **Risk:** Low–Med.
- **Test:** bottom nav + safe areas; no horizontal scroll 360–440px; MobileAppCard preview; sheets/full-screen detail; tap target sizes; `100dvh` correctness with mobile browser chrome.

### Phase 8 — Accessibility & final QA
- **Files:** cross-cutting (aria, focus, alt, reduced-motion), QA checklist.
- **Difficulty:** Low–Med · **Risk:** Low.
- **Test:** keyboard-only full traversal; screen-reader labels on icon buttons; `aria-current`/dialog roles; color-blind check (status legible without color); Lighthouse a11y ≥95; final contrast pass.

---

## Notes for the engineer
- **Charts:** the React build hit a recharts duplicate-key/clip-path warning — fixed by giving each chart a unique `id`. In Vanilla, namespace any SVG `clipPath`/`gradient` IDs per chart instance.
- **No backend:** library + progress persist via `localStorage`; "search millions of books" stays a mocked/local dataset in this scope (real Open Library/Google Books wiring is out of scope here).
- **Single source of truth:** port all scattered inline hex into `tokens.css` first (Phase 1) — it makes every later phase faster and keeps the gold/contrast consistent.
- **Keep it calm:** glows only on progress + hero/phone preview; everything else stays flat and editorial.
