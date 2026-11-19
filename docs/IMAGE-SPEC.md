# Image spec

Every image on heliaxis.co.uk follows this spec, whether a person or the builder makes it. Companion to PAGE-BUILDER-SPEC.md.

## House style

One look across the whole site: real-feeling photographs of UK homes and businesses, cool shadows, warm amber light. The style comes straight from the site's own colours, so images sit naturally on the page.

| Brand colour (from the site CSS) | Hex | Role in images |
| --- | --- | --- |
| Ink | #211F18 | Deepest shadows |
| Explorer stage navy | #26324C → #171D2B | Night and dusk shadows; matches the explorer block's background |
| Amber | #E39A0C | Warm practical light: lamps, glowing appliances, windows |
| Solar | #F8BC1E | Sun highlights, brightest glow |
| Paper | #F7F2E7 | Daylight whites, overcast sky |

### Two lighting modes

- **Power mode** (battery, backup, storage, off-grid, night-time savings): dusk or night. The thing that's powered glows amber; everything else falls into navy shadow. This is the "dark room, fridge lit" look.
- **Daylight mode** (solar, heat pumps, EV, commercial, farms, care homes): bright British daylight, soft cloud, one warm break of sun on the subject. Never Californian blue skies or palm trees.

### Same rules in both modes

- Photographic and believable, like a good documentary photo. No glossy CGI, no illustration, no cartoon.
- Eye-level or slightly low 35mm view; shallow depth of field; one clear subject.
- Calm, uncluttered rooms with lived-in detail (a mug, a coat on a hook). Not show homes.
- People only as hands, backs or at a distance. No faces.
- Real Heliaxis photos get a matching colour grade (a saved preset: warm highlights, slightly cooled shadows), so real and generated images sit together.

## Engines

One engine makes every finished image, so the style stays consistent. Other engines only draft, act as backup or check the work.

| Job | Engine | Why |
| --- | --- | --- |
| Final images and matching sets | Google Nano Banana 2.1 | Strong at editing, and takes several reference images, which is how the style is locked |
| Cheap composition drafts | OpenAI GPT Image 2, low quality (~0.4p) | Try layouts before paying for a final |
| Fallback | GPT Image 2, medium/high | Used only if Nano Banana fails or refuses a brief; the output is flagged so a person compares style |
| Writing briefs and checking results | Claude (vision) | Turns page copy into briefs; checks each image against the brief and the rules in this spec before it reaches you |

All engines sit behind one internal function, `generateImage(brief)`. Swapping or adding an engine later is a config change, not a rebuild. Store which engine and prompt made each image.

### Locking the style

1. Generate 8–10 candidate style images: four Power mode, four Daylight mode.
2. You approve the best three of each in HAP. They're flagged `styleRef` in the library.
3. Every later generation sends the three matching `styleRef` images as references, with the instruction "match the lighting, colour grade and camera style of the reference images".
4. Sets (like the six explorer cards) also send their base scene, so each card is the same room.

## Slot sizes

Every CMS image frame crops its image to fill (`object-fit: cover`), so the subject must sit inside a safe zone that survives both the desktop and the phone crop. Sizes below come from the live site CSS.

| Slot | How the site shows it | Generate and export | Keep the subject |
| --- | --- | --- | --- |
| `hero` `bgImg` | Full-width background under a dark overlay (`bgOverlay` 62%); headline on the left; cropped from the centre on phones | 16:9, export 2400×1350 | Between 50% and 75% across, vertically centred. Left half quiet and low-detail for the headline |
| `media` `img` | Frame 340px tall on desktop, 280px on phones, full column width; crop point from `focusX`/`focusY` | 3:2, export 1800×1200 | In the middle 60% both ways; set `focusX`/`focusY` on the subject |
| `explorer` item `img` | Sticky stage at least 420px tall (280px on tablets, 240px on phones), up to 72% of screen height, on a navy background with an amber edge glow | 4:3, export 1600×1200 | Centred. Edges fade to navy (#171D2B) so the picture melts into the stage |
| `gallery` item `img` | Cards 150px tall, featured card 312px | 4:3, export 1600×1200 | Real photos only, never AI |
| `casestudy` | Real project photos | 3:2 or 4:3 | Real photos only, never AI |
| Social share image (new) | Link previews on Facebook, WhatsApp, LinkedIn | 1200×630 | Centred; page headline added by the renderer, not the image model |

File weight: WebP at about quality 80; hero under 350 KB, everything else under 250 KB. The renderer should serve 800, 1600 and full-width versions (`srcset`) so phones download the small one.

## Prompt build

Every prompt is four fixed parts plus one scene part. Only the scene part changes between images, which is what keeps the look consistent.

### 1. Style block (fixed, pick by mode)

```
POWER MODE: Documentary-style photograph at dusk or night. Deep navy-blue
shadows (#171D2B to #26324C). The subject is the only strong light source,
glowing warm amber (#E39A0C to #F8BC1E). Natural, believable light, no lens
flare, no neon. Match the lighting, colour grade and camera style of the
reference images.

DAYLIGHT MODE: Documentary-style photograph in bright British daylight with
soft cloud and one warm break of sunlight (#F8BC1E) falling on the subject.
Neutral, slightly warm colour grade, creamy whites (#F7F2E7). Match the
lighting, colour grade and camera style of the reference images.
```

### 2. Scene block (written per image by the builder)

```
Scene: {where, in one sentence}.
Subject: {the one thing the image is about}, clearly lit and in sharp focus.
Supporting detail: {one or two lived-in details}.
```

### 3. Composition block (fixed per slot, from the slot table)

```
HERO: 16:9. Subject between 50% and 75% across the frame, vertically centred.
Left half calm and low in detail.
MEDIA: 3:2. Subject in the central 60% of the frame.
EXPLORER: 4:3. Subject centred. Frame edges fall away into dark navy.
Camera: 35mm lens, eye level, shallow depth of field.
```

### 4. UK authenticity block (fixed)

```
Set in the UK: three-pin UK sockets and switches, UK consumer unit, wall-hung
combi boiler, panel radiators, UK brick or rendered houses with slate or
concrete-tile roofs, UK-style cars with blank number plates. No US-style
sockets, appliances, houses or vegetation.
```

### 5. Exclusions block (fixed)

```
No text, words, numbers, logos or brand names anywhere. No visible faces.
No Heliaxis branding, vans or uniforms. Nobody working on a roof or at height.
No exposed live wiring or open electrical panels. No children near equipment.
```

Why the exclusions: text and logos come out garbled and can't be checked. Branding or staff would suggest a real Heliaxis job, which UK ad rules forbid. Unsafe working at height would contradict the safety standards Heliaxis sells on.

## Shot list per page

Where there is a real photo for a slot, it wins and the AI brief is skipped. "Real" below means the slot must be a Heliaxis photo; usable ones already exist from the Congress Theatre, a care home and several drone shots. Briefs are the scene part of the prompt; the fixed parts are added automatically.

| Page | Mode | Hero | Intro (`media`) | Cards / other |
| --- | --- | --- | --- | --- |
| Battery Backup | Power | UK street at dusk in a power cut; one house glows amber | Dark kitchen, fridge-freezer glowing | Explorer set of 6, one kitchen/hallway: fridge, lights & sockets, router, thermostat, bedside device, whole house lit |
| Home Battery Storage | Power | Evening living room, lamps on, wall battery glowing softly in a utility room doorway | Washing machine running at night (cheap-rate charging idea) | Battery unit on a garage wall, neat cabling (generic, unbranded) |
| Add a Battery to Existing Solar | Daylight → Power | Real: an existing roof array | Loft or garage with an inverter on the wall, evening light | Before/after pair: daytime roof, then the same home lit at night |
| Solar Panels | Daylight | Real: drone shot of a residential array | Family kitchen in morning sun, kettle on | Explorer: roof types (slate, tile, flat, ground mount) |
| Solar and Battery | Daylight → Power | Real: roof array | Same home at dusk, windows glowing | — |
| Residential | Daylight | Real: residential install | Calm family hallway, radiator and thermostat | — |
| Whole Home Energy | Daylight | Home at golden hour: panels on roof, heat pump at the side, EV on the drive | Utility room: hot-water cylinder and controls | Explorer: solar, battery, heat pump, EV charger |
| Off-Grid Solar | Power | Remote Welsh hillside cottage or container at dusk, lit, no grid lines | Real: Brecon off-grid container | Ground-mount array in a field |
| Home EV Charging | Daylight | UK driveway, EV plugged into a wall charger (unbranded) | Night: car charging on cheap-rate electricity, porch light on | — |
| Commercial | Daylight | Real: Congress Theatre rooftop | Office or workshop lit by daylight, staff out of focus | Explorer: offices, warehouses, farms, care homes, manufacturing |
| Commercial Solar | Daylight | Real: Congress Theatre array | Real: inverters on a plant-room wall | — |
| Commercial Battery / BESS | Power | Industrial unit at dusk, one cabinet-style battery glowing | Real: Congress Theatre battery storage | — |
| Commercial EV Charging | Daylight | Workplace car park with a row of chargers | Fleet vans charging at a depot, evening | — |
| Solar O&M | Daylight | Real: drone inspection shot of an array | Tablet showing a generation graph (no readable text), on a desk | — |
| Solar PPA | Daylight | Large commercial roof with array, wide shot | Business owner at a desk by a window, seen from behind, roof array visible outside | — |
| Manufacturing | Daylight | Factory roof array, wide aerial | Production floor, machines running | — |
| Agriculture | Daylight | Farm buildings with roof array, Welsh hills behind | Milking parlour or grain store with lights on | Ground-mount array in a field with sheep |
| Care Homes | Daylight | Real: care-home installation | Bright, warm care-home lounge, residents seen from behind | — |

Two pages cover care homes (`/care-homes` and `/solar-panels-care-homes-south-wales`). They will compete in search; merge them into `/care-homes` and redirect the other.

## QA and approval through HAP

Images reach the approver in the HAP app as one notification per page, already checked by machine, and are approved from a phone. HAP already gets push notifications for CRM, tasks and WhatsApp through the `notifications` and `native_push_tokens` tables, so this reuses that route.

### 1. Automatic check before a person sees anything

Claude (vision) checks each image against its brief and this spec:

- The subject in the brief is there, lit and in focus.
- No text, logos, faces or Heliaxis branding.
- UK details right (sockets, houses, cars).
- Subject inside the slot's safe zone.
- No AI faults: warped objects, extra handles, melted cables.
- Lighting and grade close to the `styleRef` images.

A failed image is regenerated automatically, up to three times, with the failure reason added to the prompt. If it still fails, it reaches the approver marked "needs a look".

### 2. One notification per page

When every slot on a page has passed, insert one `notifications` row:

- `kind`: `cms_image_review`
- `title`: "8 images ready for Battery Backup"
- `href`: `/admin/cms/images/review?page=/battery-backup`
- `ref`: the batch ID

The existing push sends it to every user with the image-approver role (set in the facts sheet). If nobody has reviewed it within 48 hours, send one reminder.

### 3. The review screen in HAP

Each image is shown inside its real slot, cropped as a phone and a desktop visitor would see it, with its alt text underneath. Per image:

- **Approve**
- **Try again**, with an optional note ("darker", "more like a Welsh terrace") added to the brief
- **Use a real photo**: opens the library filtered by the slot's tags
- **Reject**: the slot stays empty and the page can't publish

Plus **Approve all** for the page.

Approving sets `approved: true`, `approvedBy` and `approvedAt` on the library entry; the validator then lets the page publish. The same screen approves the first `styleRef` images, and could later approve whole page drafts the same way.

## Files and metadata

Every image is stored once, named so anyone can tell what it is, with enough detail to regenerate it or prove where it came from.

- **Name:** `{page-slug}--{slot}--v{n}.webp`, for example `battery-backup--explorer-fridge--v2.webp`. Real photos: `{job-ref}--{what}--{town}.webp`.
- **Formats:** keep the original PNG from the engine in a private `cms-originals` folder; publish WebP sizes 800, 1600 and full width to `cms-media`.
- **Fields on each `site.images` entry:**

| Field | Example |
| --- | --- |
| `alt` | Dark kitchen at night with only the fridge-freezer lit |
| `desc` | Explorer card, battery backup: fridge stays on in a power cut |
| `kind` | concept / install / product / stock / logo |
| `mode` | power / daylight |
| `service`, `location`, `systemSize` | battery, —, — |
| `source` | ai / own / pexels / unsplash |
| `engine`, `prompt`, `refs` | nano-banana-2.1, full prompt text, styleRef IDs used |
| `costPence` | 3.8 |
| `qa` | passed, attempts 2 |
| `approved`, `approvedBy`, `approvedAt` | true, Callum Hiscott, 2026-11-20 |
| `styleRef` | false |
| `credit` | Photographer name (stock only) |

The CMS library shows monthly image spend from `costPence`, and filters by `kind`, `mode`, `service` and approval state.
