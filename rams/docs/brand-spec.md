# Heliaxis — Brand & Build Spec

A reference for building the Heliaxis site. UK English, GBP. Aesthetic: **"engineered warmth"** — warm sunlight on charcoal, sharp corners, hairline borders over shadows, technical mono labels, spec-grid layouts. Light-dominant content with a few dark "moments" (hero, stats, finance, final CTA). **Not** eco-green, not rounded, not clip-art.

---

## 1. Colour palette

| Token | Hex / value | Use |
|---|---|---|
| `--ink` | `#211F18` | Primary dark (hero/stats/CTA backgrounds, headings on light) |
| `--ink-2` | `#2c2820` | Secondary dark (cards on dark) |
| `--solar` | `#F8BC1E` | Primary gold — CTAs, spark, accents |
| `--amber` | `#E39A0C` | Gold hover |
| `--amber-2` | `#C77F04` | Deep amber — eyebrows/labels on light |
| `--paper` | `#F7F2E7` | Primary light background |
| `--paper-2` | `#EFE8D8` | Secondary light (tiles, bands) |
| `--card` | `#FFFDF8` | Card surface on light |
| `--muted` | `#6E6A5E` | Body-muted text on light |
| `--muted-d` | `#A69F8E` | Muted text on dark |
| `--ok` | `#3F7D4E` | Success / positive |
| `--line` | `rgba(33,31,24,.14)` | Hairline border on light |
| `--line-d` | `rgba(247,242,231,.16)` | Hairline border on dark |

Contrast rule: gold is an **accent**, never body text. Never green as a brand colour.

---

## 2. Typography

Three families:

- **Ezra** — display/headings. Weights used: 900 (hero), 800 (section titles), 700 (card titles), 500. **Custom font — self-host** (you have the `.otf` family). In Next.js use `next/font/local` pointing at `/src/fonts/Ezra-*.woff2|otf`. Fallback: `system-ui, sans-serif`.
- **Hanken Grotesk** — body. Google Fonts. Weights 400/500/600/700.
- **JetBrains Mono** — utility: eyebrows, indices (`S/01`, `Q/01`), data, coordinates, technical labels. Google Fonts. Weights 400/500/600.

```html
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```

Type feel: display is tight (`letter-spacing:-.015em`, `line-height:1.02`). Eyebrows are mono, uppercase, letter-spaced (`.14em`), in `--amber-2` (on light) or `--solar` (on dark), usually prefixed with the spark icon.

---

## 3. The spark (monopitch)

The mark is **four separate tapered rays radiating from an open centre** — N/S/E/W — each ray ending in a **single-slope (monopitch) tip**, echoing a roof pitch. Rays rotate clockwise. **Not** a solid star; the centre is open.

One ray, rotated 0/90/180/270 about (12,12):

```html
<svg viewBox="0 0 24 24" fill="#F8BC1E" width="16" height="16" aria-hidden="true">
  <g transform="rotate(0 12 12)"><path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z"/></g>
  <g transform="rotate(90 12 12)"><path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z"/></g>
  <g transform="rotate(180 12 12)"><path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z"/></g>
  <g transform="rotate(270 12 12)"><path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z"/></g>
</svg>
```

React component:

```jsx
export function Spark({ size = 16, fill = "#F8BC1E", ...props }) {
  const ray = "M11 9.6 L13 9.6 L13 0.8 L11 3 Z";
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill={fill} aria-hidden="true" {...props}>
      {[0, 90, 180, 270].map((a) => (
        <g key={a} transform={`rotate(${a} 12 12)`}><path d={ray} /></g>
      ))}
    </svg>
  );
}
```

Use it inside eyebrows and as a large watermark/brand element. For favicon / very small sizes, a solid 4-point version is acceptable, but default to the open monopitch spark.

---

## 4. Logo

Wordmark "HELIAXIS" with the spark replacing the middle. Two versions: dark charcoal wordmark (on light) and reversed white wordmark + gold spark (on dark). Give it clear space; don't recolour the spark to anything but the gold.

---

## 5. Iconography — duotone

Custom line icons with a **duotone** treatment: a **gold fill at 30% opacity behind a charcoal outline** on light backgrounds; on dark backgrounds the outline is cream (`--paper`) with the same gold fill. Icons sit in a hairline tile (`--paper-2` background, `--line` border, 2px radius).

At rest: static. **On hover** (or card hover): gold fill deepens `.30 → .55` and the icon lifts `translateY(-2px)`.

```css
.ico { fill:none; stroke:var(--ink); stroke-width:1.6; stroke-linecap:round; stroke-linejoin:round; }
.ico .fill { fill:var(--solar); fill-opacity:.30; stroke:none; transition:fill-opacity .35s; }
.card:hover .ico .fill { fill-opacity:.55; }
.card:hover .ico-tile { transform:translateY(-2px); border-color:var(--solar); }
```

---

## 6. Buttons

Three styles: **solar** (gold bg, ink text — primary), **dark** (ink bg, paper text), **ghost** (1.5px current-colour border). Sharp corners (2px radius), Ezra 700.

**All buttons get a white shine sweep on hover** (plus optional pulse for a hero/CTA):

```css
.btn { position:relative; overflow:hidden; font-family:Ezra,sans-serif; font-weight:700;
       padding:.8rem 1.3rem; border-radius:2px; display:inline-flex; gap:.4rem; align-items:center; }
.btn.solar { background:var(--solar); color:var(--ink); }
.btn.dark  { background:var(--ink);   color:var(--paper); }
.btn.ghost { border:1.5px solid currentColor; }
.btn::after { content:""; position:absolute; top:0; left:-130%; width:55%; height:100%;
  background:linear-gradient(120deg,transparent,rgba(255,255,255,.55),transparent);
  transform:skewX(-20deg); pointer-events:none; }
.btn:hover::after { animation:shine .7s ease; }
@keyframes shine { to { left:150%; } }

/* optional attention pulse */
.btn.pulse { animation:pulse 2s infinite; }
@keyframes pulse { 0%{box-shadow:0 0 0 0 rgba(248,188,30,.5)} 70%{box-shadow:0 0 0 14px rgba(248,188,30,0)} 100%{box-shadow:0 0 0 0 rgba(248,188,30,0)} }
```

---

## 7. Texture — cross-hatch grid

A very quiet grid overlay used on dark bands (hero, stats, finance, final CTA) to tie the dark "moments" together. Masked so it fades out.

```css
.crosshatch { position:relative; overflow:hidden; }
.crosshatch::after { content:""; position:absolute; inset:0; pointer-events:none;
  background-image:linear-gradient(rgba(247,242,231,.05) 1px,transparent 1px),
                   linear-gradient(90deg,rgba(247,242,231,.05) 1px,transparent 1px);
  background-size:60px 60px;
  -webkit-mask-image:linear-gradient(150deg,#000,transparent 80%);
          mask-image:linear-gradient(150deg,#000,transparent 80%); }
.crosshatch > * { position:relative; z-index:1; }
```

---

## 8. Layout & component patterns

- **Hero (dark):** cross-hatch + warm radial glow top-right; mono eyebrow with spark; Ezra 900 headline (≤10–15 words, benefit-led, gold-highlighted key phrase); sub; two CTAs (solar primary + ghost/paper secondary); microtrust line; 4.9★ rating. Right side holds a brand element (the spark), **not** an illustration.
- **Utility top bar (dark):** mono strip above the sticky nav — accreditations left; rating / hours / phone right.
- **Stats band (dark, cross-hatch):** 3–4 big Ezra-900 gold numbers + mono labels.
- **Services spec-grid:** cards indexed `S/01`–`S/06`, duotone icons, hairline borders. Configurable columns (2/3/4). If a row is short, either fill the gap with a dark "get in touch" card or centre the last row.
- **Split (Home / Business):** two cards, one light one dark, each with a duotone icon (gentle idle float), bullet list, button.
- **Brand banner:** auto-scrolling marquee of manufacturer names/logos, masked edges, pause on hover. Equal vertical buffer above/below.
- **Testimonials:** 3-up cards; **more than 3 auto-becomes an auto-scrolling slider** (speed adjustable).
- **Finance / grants (dark, cross-hatch):** urgency where honest (e.g. 0% VAT to 2027).
- **FAQ:** indexed `Q/01`, expandable, add FAQ schema (JSON-LD) for SEO.
- **Contact form:** Name, Organisation, Email, Phone, Postcode, **Sector** (Residential / Commercial / Public Sector / Housing Association / Other), **"I'm interested in"** multi-select (Solar PV, Battery Storage, Infrared Heating, LED Lighting, Consultation & Advisory, Funding & Grants), Message. (Mirrors the live heliaxis.co.uk form.)
- **Final CTA (dark, cross-hatch):** single focused action.

Spacing: generous, grid-aligned. Radius ≤ 4px everywhere. Prefer hairline borders to drop shadows.

---

## 9. Motion

Static at rest; animate on interaction (button shine, icon hover deepen+lift, card lift). A couple of ambient exceptions are fine: the brand-banner marquee, the testimonials slider, the split-card icon idle float. Respect `prefers-reduced-motion` — disable all of the above under it.

---

## 10. Do / Don't

- **Do:** warm charcoal + gold, sharp corners, hairlines, mono eyebrows with the spark, real drone/install photography when available, benefit-led copy, financial proof up front.
- **Don't:** eco-green, rounded/bubbly UI, clip-art or illustrated scenes, drop-shadow-heavy cards, gold as body text, the old solid-star spark.

---

## 11. Ready-to-paste CSS tokens

```css
:root{
  --ink:#211F18; --ink-2:#2c2820;
  --solar:#F8BC1E; --amber:#E39A0C; --amber-2:#C77F04;
  --paper:#F7F2E7; --paper-2:#EFE8D8; --card:#FFFDF8;
  --muted:#6E6A5E; --muted-d:#A69F8E; --ok:#3F7D4E;
  --line:rgba(33,31,24,.14); --line-d:rgba(247,242,231,.16);
  --display:'Ezra',system-ui,sans-serif;
  --body:'Hanken Grotesk',system-ui,sans-serif;
  --mono:'JetBrains Mono',monospace;
}
body{ margin:0; font-family:var(--body); background:var(--paper); color:var(--ink); }
h1,h2,h3,h4{ font-family:var(--display); letter-spacing:-.015em; line-height:1.02; margin:0; }
.eyebrow{ font-family:var(--mono); font-size:.72rem; letter-spacing:.14em; text-transform:uppercase;
          color:var(--amber-2); display:inline-flex; gap:.5rem; align-items:center; }
```

*The self-contained HTML deliverables already implement all of the above — use them as the source of truth for exact markup and measurements when rebuilding as Next.js components.*
