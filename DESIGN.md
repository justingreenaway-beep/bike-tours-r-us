# Ride Together design system

Editorial minimalism × Swiss grid precision. Influences: Linear, Vercel's Geist, and the International Typographic Style (Müller-Brockmann grids, flush-left/ragged-right type, hairline rules, strong hierarchy, generous white space, almost no decoration).

This file is the single source of truth. `design/tokens.css` implements it as CSS custom properties only. Nothing here is applied to the app yet: see section 10.

Status: draft for review (branch `design-system`).

---

## 1. Principles

1. **One accent, used once per screen.** Signal yellow marks the single most important thing: where you are now, or the one action to take. Everything else is neutral. Route colours are wayfinding, not decoration.
2. **Rules, not boxes.** Content is separated by 1 px hairline rules and space. No cards with shadows; a raised surface is a flat tint with a hairline border. Shadows exist only for things that float over the page (dialog, sheet, toast).
3. **Type and space make the hierarchy.** Size, weight and position say what matters. Never colour, boxes, icons or uppercase alone.
4. **Data is typography.** Times, distances and counts are set in Geist Mono with tabular numerals, large and unadorned. A number is not put in a tile when it can stand on the grid.
5. **Flush left, ragged right.** Text aligns to the column's left edge. No centred paragraphs or justified text. The only centred things are icons inside their tap target and the empty state.
6. **The grid is the decoration.** Every element starts on a column line and every vertical measure is a multiple of 4 px. Asymmetry is fine; misalignment is not.
7. **Built for the road.** 44 × 44 px minimum targets, AA contrast in both themes, readable in sun and at night, and nothing that moves unless it explains a change.

## 2. Colour

All values are exact. Light is the default; dark follows `prefers-color-scheme: dark`, and the app's own theme setting (`html[data-theme]`) overrides it.

### 2.1 Neutral scale (12 steps)

| Step | Light | Dark | Typical role |
|---|---|---|---|
| `n0` | `#FFFFFF` | `#0A0A0B` | background |
| `n1` | `#FAFAFA` | `#111113` | surface |
| `n2` | `#F4F4F5` | `#18181B` | surface-muted (light), surface-raised (dark) |
| `n3` | `#EDEDEF` | `#1F1F23` | surface-selected (light), surface-muted (dark) |
| `n4` | `#E4E4E7` | `#27272B` | border; surface-selected (dark) |
| `n5` | `#D4D4D8` | `#34343A` | border on tinted surfaces, skeleton |
| `n6` | `#A1A1AA` | `#4A4A52` | disabled text and icons |
| `n7` | `#83838B` | `#6B6B74` | border-strong (control outlines) |
| `n8` | `#66666E` | `#91919A` | text-subtle |
| `n9` | `#52525A` | `#A8A8B0` | text-muted |
| `n10` | `#2E2E33` | `#D4D4D8` | hover on inverted fills |
| `n11` | `#111113` | `#F4F4F5` | text |

### 2.2 Named roles

| Role | Light | Dark | Use |
|---|---|---|---|
| `background` | `#FFFFFF` | `#0A0A0B` | Page |
| `surface` | `#FAFAFA` | `#111113` | Bars, grouped areas |
| `surface-raised` | `#FFFFFF` | `#18181B` | Dialog, sheet, menus (always with a border) |
| `surface-muted` | `#F4F4F5` | `#1F1F23` | Tag fills, skeletons, quiet wells |
| `surface-selected` | `#EDEDEF` | `#27272B` | Selected row, pressed ghost button |
| `border` | `#E4E4E7` | `#27272B` | Hairline rules between content (decorative, not a control boundary) |
| `border-strong` | `#83838B` | `#6B6B74` | Input and control outlines (meets 3:1) |
| `text` | `#111113` | `#F4F4F5` | Primary text, primary button fill |
| `text-muted` | `#52525A` | `#A8A8B0` | Secondary text, metadata |
| `text-subtle` | `#66666E` | `#91919A` | Captions, hints, "last edited by" |
| `text-disabled` | `#A1A1AA` | `#4A4A52` | Disabled only (exempt from contrast) |
| `focus` | `#111113` | `#F4F4F5` | Focus ring (same as text, 2 px, 2 px offset) |

### 2.3 Accent and semantic colours

| Token | Light | Dark | Notes |
|---|---|---|---|
| `accent` | `#F2C200` | `#F2C200` | Signal yellow (the logo). Fills only: current stop node, the one primary on-road action, toast |
| `accent-ink` | `#111113` | `#0A0A0B` | Text and icons on an accent fill |
| `accent-fg` | `#7A5F00` | `#F2C200` | Accent as text, a dot or a rule on the page (light needs the darker tone) |
| `accent-hover` | `#E0B400` | `#FFD23A` | Hover/pressed fill |
| `success` / `success-bg` | `#15803D` / `#ECFDF3` | `#4ADE80` / `#0F2A1A` | Booked, saved, done |
| `warning` / `warning-bg` | `#B45309` / `#FFF7ED` | `#FBBF24` / `#2A1F05` | Fuel gaps, time clashes, unverified email |
| `danger` / `danger-bg` | `#C62828` / `#FEF2F2` | `#F87171` / `#2A0F0F` | Delete, errors |
| `info` / `info-bg` | `#1D64C8` / `#EFF6FF` | `#60A5FA` / `#0B1E36` | Notices, links in prose |

Rule: semantic colours appear as text, a 2 px left rule or a 16 px icon. Tinted backgrounds are used only for notices and pills, never for whole sections.

### 2.4 Route colours (day wayfinding)

Each works as a 2–4 px rule, a 8–12 px dot and a label on both themes (all ≥ 4.5:1 against background, surface and surface-raised), and has an on-colour for text inside a filled node.

| Route | Light | Dark | On-colour light | On-colour dark | Used for |
|---|---|---|---|---|---|
| `route-blue` | `#1F6FD1` | `#5AA2F5` | `#FFFFFF` | `#0A0A0B` | Day colour |
| `route-orange` | `#C2410C` | `#F59A3A` | `#FFFFFF` | `#0A0A0B` | Day colour |
| `route-green` | `#1E7F4F` | `#3CC57F` | `#FFFFFF` | `#0A0A0B` | Day colour |
| `route-purple` | `#7C3AED` | `#B48CF5` | `#FFFFFF` | `#0A0A0B` | Day colour |
| `route-red` | `#C62828` | `#F26B5E` | `#FFFFFF` | `#0A0A0B` | Solo legs |

Groups that meet up reuse the same five colours. Never put two route colours side by side as the only difference between two things: pair with a label.

### 2.5 Tour status

| Status | Text | Fill | Light | Dark |
|---|---|---|---|---|
| Draft | `draft-fg` on `draft-bg` | tint | `#7A5F00` on `#FFF6CC` | `#F2C200` on `#2A2200` |
| Published | `published-fg` on `published-bg` | tint | `#15803D` on `#ECFDF3` | `#4ADE80` on `#0F2A1A` |
| Locked | `locked-fg` on `locked-bg` | solid | `#FFFFFF` on `#111113` | `#0A0A0B` on `#F4F4F5` |

### 2.6 Contrast table

Every text or UI pair the system allows. Generated from the hex values above (WCAG 2.x relative luminance). Body text and data need 4.5:1; UI boundaries, focus rings and large text need 3:1. All pass in both themes.

| Pair (foreground on background) | Use | Light | Dark | Needs |
|---|---|---|---|---|
| `text` on `background` | Text | 18.86:1 | 18.00:1 | 4.5:1 |
| `text` on `surface` | Text | 18.07:1 | 17.16:1 | 4.5:1 |
| `text` on `surface-raised` | Text | 18.86:1 | 16.12:1 | 4.5:1 |
| `text` on `surface-muted` | Text | 17.16:1 | 14.94:1 | 4.5:1 |
| `text` on `surface-selected` | Text | 16.13:1 | 13.54:1 | 4.5:1 |
| `text-muted` on `background` | Text | 7.74:1 | 8.38:1 | 4.5:1 |
| `text-muted` on `surface` | Text | 7.42:1 | 7.99:1 | 4.5:1 |
| `text-muted` on `surface-raised` | Text | 7.74:1 | 7.50:1 | 4.5:1 |
| `text-muted` on `surface-muted` | Text | 7.04:1 | 6.96:1 | 4.5:1 |
| `text-muted` on `surface-selected` | Text | 6.62:1 | 6.30:1 | 4.5:1 |
| `text-subtle` on `background` | Text | 5.69:1 | 6.33:1 | 4.5:1 |
| `text-subtle` on `surface` | Text | 5.45:1 | 6.04:1 | 4.5:1 |
| `text-subtle` on `surface-raised` | Text | 5.69:1 | 5.67:1 | 4.5:1 |
| `text-subtle` on `surface-muted` | Text | 5.18:1 | 5.26:1 | 4.5:1 |
| `text-subtle` on `surface-selected` | Text | 4.87:1 | 4.76:1 | 4.5:1 |
| `border-strong` on `background` | Input borders, control outlines | 3.76:1 | 3.75:1 | 3.0:1 |
| `border-strong` on `surface` | Input borders, control outlines | 3.60:1 | 3.57:1 | 3.0:1 |
| `border-strong` on `surface-raised` | Input borders, control outlines | 3.76:1 | 3.36:1 | 3.0:1 |
| `accent-ink` on `accent` | Text on accent fill (primary current marker, toast) | 11.22:1 | 11.77:1 | 4.5:1 |
| `accent-fg` on `background` | Accent as text, dots and rules | 6.06:1 | 11.77:1 | 4.5:1 |
| `accent-fg` on `surface` | Accent as text, dots and rules | 5.81:1 | 11.22:1 | 4.5:1 |
| `accent-fg` on `surface-raised` | Accent as text, dots and rules | 6.06:1 | 10.54:1 | 4.5:1 |
| `success` on `background` | Success text and icon | 5.02:1 | 11.36:1 | 4.5:1 |
| `success` on `success-bg` | Success text on its tint | 4.76:1 | 8.82:1 | 4.5:1 |
| `text` on `success-bg` | Body text on success tint | 17.88:1 | 13.98:1 | 4.5:1 |
| `warning` on `background` | Warning text and icon | 5.02:1 | 11.85:1 | 4.5:1 |
| `warning` on `warning-bg` | Warning text on its tint | 4.73:1 | 9.70:1 | 4.5:1 |
| `text` on `warning-bg` | Body text on warning tint | 17.76:1 | 14.73:1 | 4.5:1 |
| `danger` on `background` | Danger text and icon | 5.62:1 | 7.15:1 | 4.5:1 |
| `danger` on `danger-bg` | Danger text on its tint | 5.14:1 | 6.47:1 | 4.5:1 |
| `text` on `danger-bg` | Body text on danger tint | 17.24:1 | 16.28:1 | 4.5:1 |
| `info` on `background` | Info text and icon | 5.66:1 | 7.78:1 | 4.5:1 |
| `info` on `info-bg` | Info text on its tint | 5.20:1 | 6.59:1 | 4.5:1 |
| `text` on `info-bg` | Body text on info tint | 17.33:1 | 15.25:1 | 4.5:1 |
| `route-blue` on `background` | Route label, rule and dot | 4.94:1 | 7.46:1 | 4.5:1 |
| `route-blue` on `surface` | Route label, rule and dot | 4.73:1 | 7.11:1 | 4.5:1 |
| `route-blue` on `surface-raised` | Route label, rule and dot | 4.94:1 | 6.68:1 | 4.5:1 |
| `on-route` on `route-blue` | Number in a filled stop node | 4.94:1 | 7.46:1 | 4.5:1 |
| `route-orange` on `background` | Route label, rule and dot | 5.18:1 | 9.01:1 | 4.5:1 |
| `route-orange` on `surface` | Route label, rule and dot | 4.96:1 | 8.59:1 | 4.5:1 |
| `route-orange` on `surface-raised` | Route label, rule and dot | 5.18:1 | 8.07:1 | 4.5:1 |
| `on-route` on `route-orange` | Number in a filled stop node | 5.18:1 | 9.01:1 | 4.5:1 |
| `route-green` on `background` | Route label, rule and dot | 5.00:1 | 8.94:1 | 4.5:1 |
| `route-green` on `surface` | Route label, rule and dot | 4.79:1 | 8.52:1 | 4.5:1 |
| `route-green` on `surface-raised` | Route label, rule and dot | 5.00:1 | 8.00:1 | 4.5:1 |
| `on-route` on `route-green` | Number in a filled stop node | 5.00:1 | 8.94:1 | 4.5:1 |
| `route-purple` on `background` | Route label, rule and dot | 5.70:1 | 7.55:1 | 4.5:1 |
| `route-purple` on `surface` | Route label, rule and dot | 5.46:1 | 7.19:1 | 4.5:1 |
| `route-purple` on `surface-raised` | Route label, rule and dot | 5.70:1 | 6.76:1 | 4.5:1 |
| `on-route` on `route-purple` | Number in a filled stop node | 5.70:1 | 7.55:1 | 4.5:1 |
| `route-red` on `background` | Route label, rule and dot | 5.62:1 | 6.63:1 | 4.5:1 |
| `route-red` on `surface` | Route label, rule and dot | 5.39:1 | 6.32:1 | 4.5:1 |
| `route-red` on `surface-raised` | Route label, rule and dot | 5.62:1 | 5.94:1 | 4.5:1 |
| `on-route` on `route-red` | Number in a filled stop node | 5.62:1 | 6.63:1 | 4.5:1 |
| `draft-fg` on `draft-bg` | Draft pill | 5.57:1 | 9.41:1 | 4.5:1 |
| `published-fg` on `published-bg` | Published pill | 4.76:1 | 8.82:1 | 4.5:1 |
| `locked-fg` on `locked-bg` | Locked pill | 18.86:1 | 18.00:1 | 4.5:1 |
| `background` on `text` | Primary button label (inverted) | 18.86:1 | 18.00:1 | 4.5:1 |
| `text` on `background` | Focus ring (2 px, text colour) | 18.86:1 | 18.00:1 | 3.0:1 |

Not allowed (fail): `accent` as text or a thin rule on the light background (1.68:1); `border` as a control boundary (1.27:1 / 1.33:1). Use `accent-fg` and `border-strong` instead.

## 3. Typography

### 3.1 Typefaces

- **Geist** (sans) for everything, and **Geist Mono** for numbers, times, distances and codes. Both by Vercel, released under the SIL Open Font Licence 1.1, which allows bundling with the app. Geist is a neo-grotesk in the Swiss tradition (Helvetica, Akzidenz, Inter) with a large x-height that stays clear at 13 px on a phone in sunlight, and its mono shares the sans's metrics, so data and words sit on the same baseline.
- Weights used: Geist 400, 500, 600; Geist Mono 400, 500. No italics, no 700+.
- Files: `design/fonts/` (woff2), added in Step 2 from the official `vercel/geist-font` release, with `OFL.txt` alongside.
- Fallback stacks: `"Geist", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif` and `"Geist Mono", ui-monospace, "SF Mono", Menlo, monospace`.
- Barlow / Barlow Condensed (current) are retired from UI text. The logo stays an image.

**Licence record:** Geist and Geist Mono, © 2023 Vercel, in collaboration with basement.studio. SIL Open Font License, Version 1.1 (https://openfontlicense.org). The licence text ships as `design/fonts/OFL.txt`.

### 3.2 Scale

Mobile values; the two largest step up at ≥ 1024 px. Line heights are multiples of 4.

| Style | Font | Size / line | Weight | Tracking | Usage |
|---|---|---|---|---|---|
| `display` | Geist | 40/44 (desktop 56/60) | 600 | −0.035em | Tour name on the roadbook, next stop on Home |
| `h1` | Geist | 30/36 (desktop 36/40) | 600 | −0.03em | Screen titles, auth heading |
| `h2` | Geist | 22/28 | 600 | −0.02em | Day titles, section headings |
| `h3` | Geist | 17/24 | 600 | −0.01em | Stop town, card titles, dialog titles |
| `body` | Geist | 16/24 | 400 | 0 | Paragraphs, notes, inputs (16 px stops iOS zoom) |
| `body-small` | Geist | 14/20 | 400 | 0 | Secondary lines, list metadata |
| `label` | Geist | 13/16 | 500 | 0 | Field labels, buttons (small), tags |
| `label-caps` | Geist | 11/16 | 500 | +0.08em, uppercase | Eyebrows only (see rules) |
| `caption` | Geist | 12/16 | 400 | 0 | Hints, "last edited by", credits |
| `mono-data` | Geist Mono | 15/20 | 500 | 0 | Times, km, counts in lists |
| `mono-data-lg` | Geist Mono | 24/28 | 500 | −0.02em | Day stats (412 km, 5:50) |
| `mono-data-xl` | Geist Mono | 48/48 | 400 | −0.04em | One hero number per screen (ETA) |

Buttons use 15/20 weight 500 (16/24 for large). All numerals in data use `font-variant-numeric: tabular-nums` (Geist Mono is tabular by default; set it on Geist too wherever numbers line up in columns).

### 3.3 Rules

- Sentence case everywhere: headings, buttons, tabs, labels. No exclamation marks. Australian English.
- **Uppercase is allowed only as `label-caps`:** an eyebrow above a heading or a group of rows ("NEXT STOP", "TONIGHT"), at most three words, never a sentence, a button, a name, a town or a heading. Never below 11 px, always +0.08em tracking.
- Measure: body text max 65ch (`--measure`). Headings max 20ch where they wrap.
- Flush left, ragged right. No hyphenation except long town names in `display`.
- Times are 12-hour with lowercase am/pm in prose ("10:30 am"); in data columns the am/pm drops to `caption` size after the mono digits.
- Units follow a thin space and sit in `text-muted` at the same size or one step smaller ("412 km").

## 4. Grid and spacing

### 4.1 Base unit and scale

Base unit 4 px. Named scale:

| Token | px | Typical use |
|---|---|---|
| `space-0` | 0 | |
| `space-1` | 4 | Icon to label, tag padding |
| `space-2` | 8 | Inside compact rows, between tags |
| `space-3` | 12 | Label to input, heading to body |
| `space-4` | 16 | Gutter (mobile), row padding |
| `space-5` | 20 | Page margin (mobile) |
| `space-6` | 24 | Between related blocks |
| `space-8` | 32 | Page margin (tablet), block gaps |
| `space-10` | 40 | |
| `space-12` | 48 | Between sections (mobile) |
| `space-16` | 64 | Between sections (desktop), top of screen titles |
| `space-20` | 80 | Bottom clearance above the tab bar |

### 4.2 Layout grid

| Breakpoint | Columns | Gutter | Margin | Notes |
|---|---|---|---|---|
| Mobile (< 640) | 4 | 16 | 20 + safe-area left/right | Designed at 390 × 844: 4 columns of 75.5 px |
| Tablet (640–1023) | 8 | 20 | 32 | Plan lists can run two columns |
| Desktop (≥ 1024) | 12 | 24 | auto | Content max-width 1120 px; reading measure 680 px |

Content sits on columns: labels and times take column 1 on mobile (stop timeline: node and time in column 1, content in 2–4).

### 4.3 Vertical rhythm

- Every line height, padding and gap is a multiple of 4.
- Section heading: 2 px `text` rule above, `space-3` to the heading, `space-4` to content.
- Sections are separated by `space-12` (mobile) / `space-16` (desktop). Rows inside a section by 1 px `border` hairlines with `space-3` vertical padding.
- Minimum row height 56 px (44 px target + padding).
- The page clears the fixed tab bar: `padding-bottom: calc(var(--tabbar-h) + var(--safe-b) + var(--space-6))`.

### 4.4 Safe areas and fixed bars

- `--safe-t`, `--safe-r`, `--safe-b`, `--safe-l` map to `env(safe-area-inset-*)`. The status bar is translucent (`black-translucent`), so the app bar's top padding is `--safe-t` and its background must extend under the status bar.
- App bar: sticky at top, height `--appbar-h` (52 px) + `--safe-t`.
- Tab bar: `position: fixed; bottom: 0`, height `--tabbar-h` (56 px) + `--safe-b`. Its background fills the home-indicator area. Do not resize fixed bars with JS.
- Toasts and sticky action bars sit above the tab bar: `bottom: calc(var(--tabbar-h) + var(--safe-b) + var(--space-3))`.

## 5. Shape and depth

- **Radius:** `radius-0` 0 (rules, rows, tables), `radius-xs` 2 (tags, focus ring), `radius-sm` 4 (buttons, inputs, pills, segmented controls), `radius-md` 8 (dialog, sheet top corners, map), `radius-full` 9999 (avatars, stop nodes, dots only). No pill-shaped buttons.
- **Borders:** `border-hairline` 1 px (`border`), `border-control` 1 px (`border-strong`), `border-emphasis` 2 px (`text`; section rules, selected segment underline), `border-route` 3 px (day rule, timeline line), focus ring 2 px.
- **Elevation:** prefer borders to shadows. Two shadows only:
  - `shadow-overlay` for dialog, sheet and menus: light `0 0 0 1px #E4E4E7, 0 12px 32px rgba(17,17,19,.12)`; dark `0 0 0 1px #27272B, 0 12px 32px rgba(0,0,0,.6)`.
  - `shadow-toast`: light `0 4px 16px rgba(17,17,19,.16)`; dark `0 4px 16px rgba(0,0,0,.6)`.
  - Fixed bars use a translucent fill (`surface` at 88%) with `backdrop-filter: blur(16px)` and a hairline, never a shadow. A dragged list row gets `shadow-overlay`.
- Scrims: `scrim` light `rgba(17,17,19,.48)`, dark `rgba(0,0,0,.64)`.

## 6. Motion

| Token | Value | Use |
|---|---|---|
| `duration-instant` | 0 ms | State changes that must feel immediate (selection) |
| `duration-fast` | 120 ms | Hover, press, colour changes |
| `duration-base` | 200 ms | Disclosure, toggles, toast in |
| `duration-slow` | 320 ms | Dialog and sheet enter |
| `ease-standard` | `cubic-bezier(.2,0,0,1)` | Most transitions |
| `ease-enter` | `cubic-bezier(0,0,0,1)` | Things arriving |
| `ease-exit` | `cubic-bezier(.3,0,1,1)` | Things leaving (exit runs at 75% of enter) |

- **Animates:** opacity, transform (translateY ≤ 16 px, scale 0.98–1), colour and border-colour, the progress of a loading bar, the skeleton shimmer.
- **Never animates:** layout (width, height, top/left), text size, numbers counting up, map lines, route colour changes, page-to-page transitions, anything that loops except the skeleton and spinner, anything on a timer while riding.
- **Reduced motion** (`prefers-reduced-motion: reduce`): all durations become 0 except opacity fades (120 ms); no translate or scale; the skeleton is a static tint; the spinner becomes a static "Loading…" label.

## 7. Iconography

- Inline SVG only, no icon fonts. `fill="none"`, `stroke="currentColor"`, round caps and joins.
- Grid: 24 × 24 with a 2 px keyline; sizes 16, 20 and 24. Stroke 1.5 px at 24, 1.5 px at 20, 1.25 px at 16 (never scale strokes with the icon).
- Style: geometric, open shapes, no fills except a state dot, no duotone, no emoji in UI chrome.
- Icons always sit beside a visible label, except the icon-only button (which needs `aria-label`) and the tab bar (which shows labels too). Decorative icons get `aria-hidden="true"`.
- Colour: `currentColor`, inherits `text` or `text-muted`. Only state icons take a semantic colour.

## 8. Layers and breakpoints

| Z token | Value | Used by |
|---|---|---|
| `z-base` | 0 | Page |
| `z-raised` | 5 | Dragged row, sticky selection bar |
| `z-sticky` | 10 | Sticky sub-headers |
| `z-appbar` | 20 | App bar |
| `z-tabbar` | 25 | Tab bar |
| `z-overlay` | 30 | Menus, popovers |
| `z-dialog` | 40 | Dialog, sheet, scrim (native `<dialog>` also uses the top layer) |
| `z-toast` | 50 | Toast |
| `z-viewer` | 60 | Full-screen photo viewer |
| `z-boot` | 70 | Boot and auth screens |

Breakpoints (min-width, mobile first): `sm` 640 px, `md` 1024 px, `lg` 1280 px. CSS variables can't be used in media queries, so the values are written literally; `tokens.css` records them for reference.

## 9. Components

Common states, used below: **default**, **hover** (pointer only, `@media (hover:hover)`), **pressed**, **focus-visible** (2 px `focus` outline, 2 px offset, `radius-xs`), **disabled** (`text-disabled`, `border` outline, no hover), **selected/current**, **loading**, **empty**, **error**. Every interactive element is at least 44 × 44 px (the visible shape may be smaller; the hit area may not).

### 9.1 App bar

- **Anatomy:** safe-area spacer · logo (24 px image) · tour switcher (native `<select>` styled as text + chevron, `h3`, flush left after the logo) · account button (32 px avatar in a 44 px target, initials in `label`).
- **Tokens:** `surface` at 88% + blur, bottom `border` hairline, height `appbar-h` + `safe-t`, padding `space-5`.
- **States:** tour switcher hover = `text-muted` underline; focus = ring; with one tour = plain text, no chevron. Account: hover `surface-selected`; current (profile open) = 2 px `text` underline. Draft tour shows a draft pill after the name.

### 9.2 Bottom tab bar

- **Anatomy:** 4–6 equal items: 24 px icon over `caption` label (11/16 weight 500), safe-area spacer below.
- **Tokens:** `surface` at 88% + blur, top `border` hairline, height `tabbar-h` + `safe-b`.
- **States:** default `text-subtle`; hover `text-muted`; current (`aria-current="page"`) `text` with a 2 px `text` rule across the top of the item; focus ring inside the item; badge (unread) = 8 px `accent` dot with `accent-ink` 1 px ring at the icon's top right.

### 9.3 Buttons

| Variant | Fill | Text | Border | Use |
|---|---|---|---|---|
| Primary | `text` | `background` | none | The main action in a view or dialog (one per view) |
| Accent | `accent` | `accent-ink` | none | On-road only: "We're here" |
| Secondary | `background` | `text` | 1 px `border-strong` | Other actions |
| Ghost | transparent | `text` | none | Low-emphasis actions, toolbar actions |
| Danger | `background` | `danger` | 1 px `danger` | Delete; a confirm dialog's destructive button uses a `danger` fill with white (light) / `background` (dark) text |
| Icon-only | transparent | `text-muted` | none (1 px `border-strong` when it needs a boundary) | ⋯ menus, close; 44 × 44, 20 px icon, `aria-label` required |
| Small | as variant | as variant | as variant | Height 36 visible inside a 44 target, `label` text |

- **Size:** default height 44, padding 0 `space-4`, `radius-sm`, 15/20 weight 500, icon 20 px with `space-2` gap. Large (auth, on-road) height 52, 16/24.
- **States:** hover: primary `n10` fill, secondary/ghost `surface-selected`, accent `accent-hover`, danger `danger-bg`. Pressed: same as hover plus `scale(.98)` (no scale with reduced motion). Focus ring. Disabled: `surface-muted` fill, `text-disabled`, no border. Loading: label replaced by a 16 px spinner + "Saving…" for screen readers, width kept, `aria-busy="true"`, not clickable.

### 9.4 Inputs (text, email, password, number, date, time, select, textarea)

- **Anatomy:** label (`label`, `text`) above · control · hint (`caption`, `text-subtle`) or error (`caption`, `danger`, with a 16 px icon) below.
- **Tokens:** height 44 (textarea min 96), padding `space-3`, `body` 16 px, fill `background`, 1 px `border-strong`, `radius-sm`. Label to control `space-2`; control to hint `space-1`; field to field `space-5`.
- **Types:** number, date and time use `mono-data` and `inputmode`; password has a 44 px show/hide icon button inside the right edge; select has a 16 px chevron; date/time use native pickers.
- **States:** hover border `text-muted`; focus 2 px `focus` ring (replaces, not adds to, the border); filled = default; disabled `surface-muted` fill, `text-disabled`; read-only no border, `surface-muted`; error 1 px `danger` border + error text, `aria-invalid="true"` and `aria-describedby` to the message.

### 9.5 Checkbox chips (stop tags)

- **Anatomy:** a real checkbox (visually hidden) inside a label; the label is the chip. Optional leading 16 px icon.
- **Tokens:** height 36 visible in a 44 target, padding 0 `space-3`, `label`, `radius-sm`, 1 px `border-strong`.
- **States:** default `background`/`text`; hover `surface-selected`; selected `text` fill, `background` text, no border, leading ✓ glyph so it isn't colour alone; focus ring on the chip (`:focus-visible` from the hidden input via `:has()`); disabled as inputs. "+ N more" is a ghost small button. Never wrap a chips group in a `<label>`.

### 9.6 Segmented control (option routes, groups, draft/published/locked)

- **Anatomy:** a row of equal or content-width segments joined by 1 px dividers; `role="radiogroup"` or buttons with `aria-pressed`.
- **Tokens:** height 44, 1 px `border-strong` outline, `radius-sm`, `label` 13 px weight 500.
- **States:** default `text-muted`; hover `text`; selected `text` fill with `background` text (for tour status: the selected segment takes the status pill colours); focus ring around the segment; disabled segment `text-disabled`. Overflow: scrolls horizontally with the edge faded; never wraps.

### 9.7 Status pill / badge

- **Anatomy:** 8 px dot + text, `label` 12/16 weight 500, height 24, padding 0 `space-2`, `radius-sm`.
- **Variants:** draft, published, locked (section 2.5); neutral (`surface-muted`/`text-muted`); success, warning, danger, info (their `-bg`/colour); route (route dot + `text` label on `surface-muted`).
- Not interactive. A count badge is `mono-data` 12 px in the same shape.

### 9.8 Day header

- **Anatomy:** route-colour rule (3 px, full column width) · eyebrow row: day label (`label-caps`, route colour) and date (`label`, `text-muted`), flush left and right · title (`h2`, or `display` on a single-day page) · optional group and option segmented controls · stats row (2–3 `mono-data-lg` figures with `caption` units, separated by `space-6`, no boxes) · leader/sweep line (`body-small`) · feel and roads (`body` / `body-small` muted) · fuel note.
- **Tokens:** rule `border-route` in `route-*`; `space-3` rule to eyebrow; `space-2` eyebrow to title; `space-4` title to stats.
- **States:** today (riding) = eyebrow gains "Today" and the rule is 4 px; done = rule and title `text-subtle`; no stops = stats replaced by "No stops yet" (`text-muted`).

### 9.9 Stop timeline item

- **Anatomy:** column 1: time (`mono-data`, arrive over depart) · rail: 3 px route line with a node (28 px circle, number in `mono-data` 13 px) · content (columns 2–4): town (`h3`), road (`body-small` muted), tags (status pills, neutral), note (`body`), "Did you know?" disclosure, bakery list disclosure, actions (Navigate, We're here, Photo as small secondary/accent buttons).
- **Tokens:** node `background` fill + 2 px route border; filled node (start/overnight/finish) route fill with `on-route` number; current node `accent` fill with `accent-ink` number and a 4 px `accent` 25% halo; passed stops: node `n6` fill, town `text-subtle`.
- **Disclosure ("Did you know?", "Bakery audit"):** a ghost row 44 high with chevron (rotates 90°, `duration-base`); content indented to the content column, no box.
- **States:** default; current (here); passed; estimated time ("about 10:25", `text-subtle`); no time (time column shows "—"); warning (a `warning` line with icon below the town, as in Plan); loading (skeleton lines).

### 9.10 Bakery row

- **Anatomy:** rank (`mono-data` 15, `text-subtle`) · name (`body`, weight 500, link) · must-try (`body-small`) · meta line: open/shut status pill, rating (`mono-data` 13), distance, hours (`caption`) · tick and score controls on ride days.
- **Tokens:** rows separated by `border` hairlines, `space-3` padding, rank in column 1.
- **States:** default; open (success pill), shut at arrival (danger pill, row text `text-muted`), hours unknown (neutral pill); top pick (rank in `text`, "Top pick" pill); ticked (✓ in a filled 24 px circle, `text` fill); off route (distance pill); empty town ("No bakeries yet", `text-muted`, with "Find bakeries" ghost button).

### 9.11 Best-leg callout

- **Anatomy:** 2 px route-colour left rule · eyebrow "Best leg of the day" (`label-caps`, route colour) · title (`h3`) · why (`body`) · vote buttons (small secondary).
- **States:** default; voted (selected chip style on the chosen button); no vote yet.

### 9.12 Notice and fuel note

- **Anatomy:** 2 px left rule in the semantic colour · 16 px icon · text (`body-small`, `text`) · optional ghost action.
- **Variants:** info, success, warning, danger, and the fuel note (warning with a fuel icon; distance in `mono-data`). Inline warnings in Plan lists are a single `body-small` `warning` line with icon, no rule.
- Background stays `background`; the tint (`*-bg`) is used only when the notice must stand out from adjacent rows (e.g. "Check your email to start editing").

### 9.13 Plan list row

- **Anatomy:** drag handle (44 × 44, 20 px grip icon, `text-subtle`) · optional number or route dot · main (title `body` weight 500, subtitle `body-small` muted, warnings, "Last edited by Sam, 2 h ago" in `caption` `text-subtle`) · ⋯ icon button (row menu: edit, duplicate, move to top/bottom, delete). Tap the main area to edit.
- **Tokens:** min height 56, `border` hairline between rows, no outer box; lane headers (groups) are `label-caps` with a route-colour dot.
- **States:** hover `surface`; pressed `surface-selected`; selected `surface-selected` + 2 px `text` left rule; dragging `surface-raised` + `shadow-overlay`, drop line 2 px `text`; locked tour: handle hidden, ⋯ items disabled; empty list ("No stops yet." + primary action); focus ring on the row's main button.

### 9.14 Dialog / sheet

- **Anatomy:** scrim · panel: title (`h3`), optional description (`body-small` muted), content, sticky footer actions (primary right on desktop, full-width stack on mobile, primary first).
- **Mobile:** bottom sheet, full width, `radius-md` top corners, max height 92dvh, a 36 × 4 grabber, footer padded by `safe-b`. **Tablet/desktop:** centred dialog, width 560, `radius-md`.
- **Tokens:** `surface-raised`, `shadow-overlay`, padding `space-5`, `scrim`.
- **States:** enter (slide up 16 px + fade, `duration-slow`, `ease-enter`); loading (footer primary in loading state); error (danger notice above the footer, focus moves to it); destructive confirm (danger-filled primary, typed confirmation for tour deletion). Focus is trapped (native `<dialog>`), Esc closes, focus returns to the trigger.

### 9.15 Toast

- **Anatomy:** one line of `body-small` + optional ghost action ("Undo"). Above the tab bar, flush with the page margins on mobile, 360 max width on desktop.
- **Tokens:** `text` fill, `background` text (inverted), `radius-sm`, `shadow-toast`, height 44+.
- **Variants:** neutral (default); success/danger add a 16 px icon in the semantic colour (light-on-dark variants of the colours). The accent is not used for toasts. `role="status"` (errors `role="alert"`), auto-dismiss 4 s (8 s with an action), paused on hover/focus.

### 9.16 Empty state

- **Anatomy:** 24 px icon (`text-subtle`) · title (`h3`) · one sentence (`body`, `text-muted`, max 40ch) · one primary or secondary action. Centred within its column; the only centred text block.

### 9.17 Skeleton loading

- **Anatomy:** rectangles matching the final layout's lines (text lines at 60–90% width, `radius-xs`), nodes as circles.
- **Tokens:** `surface-muted` fill; shimmer is a 1.2 s linear gradient sweep to `n5`/`surface-selected`; static under reduced motion. `aria-busy="true"` on the container and a visually hidden "Loading".

### 9.18 Auth screen

- **Anatomy:** full screen on `background` (not the old dark tile), safe-area padded. Logo (40 px) · eyebrow "Ride Together" (`label-caps`) · `h1` "Sign in" / "Create account" · segmented control (Sign in | Create account) · email, password (+ confirm) inputs · primary large button · "Forgot password" ghost link · status line (`body-small`, `danger` or `success`) · privacy and support links (`caption`).
- **States:** default; submitting (button loading, inputs read-only); error (status line + field error); reset sent (success line); offline (info notice).

### 9.19 Boot / loading screen

- **Anatomy:** `background` fill, logo (48 px) flush left at the top margin, "Ride Together" (`h1`), status line (`body-small`, `text-muted`), a 2 px indeterminate progress rule along the bottom of the app bar position.
- **States:** loading; slow (after 8 s the line reads "Still loading. Check your signal."); error ("Couldn't connect" + secondary "Try again"). Reduced motion: no progress animation, the status text carries it.

## 10. Applying this later (notes only, nothing changed)

### 10.1 Token mapping from `css/app.css`

| Current variable | Replaced by |
|---|---|
| `--bg` | `--color-background` |
| `--surface` | `--color-surface` (bars) / `--color-surface-raised` (dialogs) |
| `--soft` | `--color-surface-muted` |
| `--rule` | `--color-border` (rules) / `--color-border-strong` (inputs, buttons) |
| `--ink` | `--color-text` |
| `--muted` | `--color-text-muted` |
| `--vis`, `--visink` | `--color-accent`, `--color-accent-ink` |
| `--warn` | `--color-danger` (errors, delete) or `--color-warning` (fuel, clashes) — check each use |
| `--blue`, `--orange`, `--green`, `--purple`, `--red` | `--route-blue` … `--route-red`. **Keep the old names as aliases**: app.js writes `style="--c:var(--${day.colour})"` and `drawMap` reads `--${colour}` with `getComputedStyle` |
| `--tile`, `--tileink` | retired (boot and auth move to `--color-background`) |
| `--display`, `--body` | `--font-sans`, `--font-mono` (Barlow `@font-face` rules removed; Geist added) |
| `--safe-t`, `--safe-b` | kept, plus `--safe-l`, `--safe-r` |

The dark-mode blocks (`@media (prefers-color-scheme:dark)` with `:root:not([data-theme="light"])` and `:root[data-theme="dark"]`) keep the same selector pattern so the Profile theme switch keeps working.

### 10.2 Component mapping

| Component | Current selectors it would restyle |
|---|---|
| App bar | `.top`, `.topin`, `.brand`, `.brandbike`, `.tsel`, `#toursel`, `.me` |
| Tab bar | `.tabbar`, `.tabbar button[aria-current]`, `#app main` padding |
| Buttons | `.btn`, `.btn.primary`, `.btn.danger`, `.btn.small`, `.btn.vis`, `.go` (auth), `.mini`, `.ib`, `.linkb`, `.lnk`, `.tdgo`, `.selbar` |
| Inputs | `.fl input/select/textarea`, `.frow`, `.auth input`, `.err`, `.hint`, `.dlgerr` |
| Checkbox chips | `.chips label`, `.tagpick`, `.whopick`, `.moretags`, `.extratags` |
| Segmented control | `.seg2` (auth), `.seg2r`, `.seg3`, `.optseg`, `.grpseg`, `.statusrow`, `.opttabs`, `.ntabs`, `.psec` (Plan sections), `.qtabs`, `.wfil` |
| Status pill | `.pill`, `.pill.draft`, `.pill.locked`, `.pill.ok`, `.pill.meet`, `.pill.role`, `.tag`, `.tag.fuel`, `.tag.opt`, `.near`, `.must` |
| Day header | `.dhead`, `.dlabel`, `.ddate`, `.stats`, `.feel`, `.roads`, `.leads`, `.grpline`, `.tdhead`, `.tdday`, `.hero` |
| Stop timeline | `ol.stops`, `li.stop`, `.node`, `.town`, `.time`, `.road`, `.tags`, `.note`, `.stay`, `.ref`, `details.fact`, `details.audit`, `.stop-actions`, `.here-flag`, `.is-here`, `.passed`, `.meetbox`, `.grpnote` |
| Bakery row | `ol.bk li`, `.rk`, `.bn`, `.meta`, `.must`, `.why`, `.verdict`, `.tick`, `.rate`, `.bkhead`, `.bktown` |
| Best-leg callout | `.best`, `.best .lbl`, `.vote`, `.vrow` |
| Notice, fuel note | `.notice`, `.fuelnote`, `.warnbox`, `.okbox`, `.rwarn`, `.warn`, `.ann`, `.unread` |
| Plan list row | `.rlist`, `.rrow`, `.grip`, `.rnum`, `.rmain`, `.pact`, `.rins`, `.lanehd`, `.edited`, `.prow`, `.dragging`, `.dropbefore`, `.dropafter` |
| Dialog / sheet | `dialog`, `dialog::backdrop`, `.dlg`, `.dbtns`, `.smenu` |
| Toast | `.toast` |
| Empty state | `.empty`, `.nempty`, `.nempty2` |
| Skeleton | new (`.sk`); today the app shows "Loading…" text |
| Auth | `.auth`, `.authin`, `.authbike`, `.kick`, `.aumsg`, `.aufine`, `.aulinks` |
| Boot | `.boot`, `.bootbike`, `.bootmark`, `.bootmsg` |
| Cards (retired) | `.card`, `.tdcard`, `.you`, `.kcard`, `.rcard`, `.pcard` become rule-separated sections |

### 10.3 What app.js relies on (keep these names)

- **Queried by selector:** `#dlg`, `#dlg .dbtns`, `#dlg .err`, `#dlg .extratags`, `#dlg .moretags`, `#dlg .whopick`, `#toast`, `#view`, `#toursel`, `#mebtn`, `#tabbar`, `.tabbar [data-tab]`, `.rlist`, `.rrow`, `.drow`, `.wgrid`, `.map`, `.mapnote`, `details.daymap`, `details.bakmap`, `details.wdet`, `details[data-k]`, `ol.bk > li`, `.pvnav` (`.prev`, `.next`), `#pvfilm .on`, `#hrows .hrow`, `#rrows .room`, `#osmres .osmhit`, `#placeres .osmhit`.
- **Classes toggled by JS:** `on`, `dragging`, `dropbefore`, `dropafter`, `flash`, `picked`, `pvopen`, `bare`, `anim`, `run`, `late`.
- **Data attributes used as hooks** (`data-act`, `data-save`, `data-del`, `data-grip`, `data-rowmenu`, `data-opt`, `data-grp`, `data-here`, `data-tab`, `data-k` …) must stay on the same elements; style by class, not by data attribute.
- **Colours set in JS:** route colours via `--c` inline styles and `getComputedStyle(...).getPropertyValue('--c' / '--blue' …)` for Leaflet lines; the Wrapped canvas (`WR` in ride.js: `#1B2530`, `#F4F5F2`, `#9AA6B0`, `#F2C200`, route hexes) and `<meta name="theme-color" content="#1B2530">` in index.html need updating by hand.
- **Markup changes needed later (in templates, not just CSS):** tab bar items get the top-rule current marker (CSS only); stop times move into a left column (template change in `stopCard()`); cards become sections (template change in `rideToday()`/`todayDay()`); the auth screen gains the eyebrow and segmented control order (index.html).

### 10.4 Suggested order when applying

1. Tokens and fonts behind the old variable names (aliases), so nothing breaks.
2. Base type, buttons, inputs, chips, segmented controls, pills.
3. App bar, tab bar, dialog, toast.
4. Roadbook (day header, stop timeline, bakery rows), then Home, then Plan lists.
5. Auth and boot; then the hard-coded colours in JS (Wrapped, theme-color, Leaflet).
