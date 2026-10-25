# 10 · Booking shortcut button and booking links

The booking portal already exists in the app, so this is an adaptation, not a new build:

- **`/book-a-survey`**: the public survey booking flow (`BookingFlow`). It has live slots from the surveyors' diaries with travel time (`src/lib/booking/*`), slot holds, confirm/move/cancel (`/api/book/*`), bank-holiday skipping, Turnstile and rate limits, Outlook diary sync, and the `?type=` and `?postcode=` pre-fills.
- **Callback requests**: `/api/book/callback` ("we'll call you") with name, phone, email, postcode and type.
- **Channel tracking**: `src/lib/attribution.ts` reads `utm_*` parameters into the attribution cookie, and the booking and callback records keep the source label.
- **Office phone**: `OFFICE_PHONE` = 01633 965205.

## 1. Header button (every admin screen)

- **"Book survey or call"** in the admin header (`AdminShell`), next to the bell. Icon only on phones.
- One tap opens a small sheet:

```
┌ Send a booking link ─────────────────────────────┐
│ ( ) Survey   ( ) Phone call   ( ) Quote consult. │
│ Where it's going: [Manual ▾] (Facebook reply, …) │
│ [ Copy link ]  [ Share… ]  [ Open ]              │
└──────────────────────────────────────────────────┘
```

- Two taps to a copied link: open the sheet → **Copy link** (Survey is pre-selected).
- **Share** uses the phone's share sheet (`navigator.share`). On a computer it shows text message, WhatsApp and email links instead.
- Links carry UTM tags, so the existing attribution picks them up with no new tracking code:
  `https://heliaxis.co.uk/book-a-survey?utm_source=facebook&utm_medium=social-reply&utm_campaign=social-monitoring`
  (`utm_source`: facebook | instagram | trustpilot | google | manual).
- The three destination URLs live in Social Monitoring settings (`cms_kv` key `social-monitoring`). An admin can change them without a code release.

## 2. How people choose to speak to us (built, 25 Oct)

The website form `/book-a-survey` now opens with **"How would you like to speak to us?"** and three choices:

| Choice | What happens |
|---|---|
| **In-person consultation** (default) | The existing flow, unchanged: what it's for, postcode, pick a time, details, confirmation. A free survey at the customer's home |
| **Phone call** | A short request form (what it's for, name, phone, email optional, postcode, best time: any / morning / afternoon / evening). It becomes a lead in the CRM with the next step "Call them", and staff get a notification |
| **Video call** | The same form with email required. Next step "Arrange video call and email them the link"; staff get a notification |

Phone and video go through `/api/book/callback` (same spam protection, rate limit and honeypot as before) with `mode`, `when` and `reason`. No time slots are offered for them: the team arranges the time. If Cal later wants bookable phone or video slots, that is a separate piece of work.

Short links: **`/book-a-call`** opens the form on Phone call and keeps `utm_` tags (`?reason=quote` marks a quote consultation). `/book-a-survey?mode=video` opens on Video call. A customer's own booking link (`/book/{token}`) is unchanged and does not show the choice.

## 3. Booking links inside reply drafts

`{{booking}}` renders a full sentence per platform (04 §4):

| Platform | Sentence |
|---|---|
| Facebook | "You can {action} here: https://heliaxis.co.uk/book-a-survey?utm_source=facebook&utm_medium=social-reply" |
| Instagram | "You can {action} through the link in our bio, or send us a DM and we'll get back to you." (Instagram comment links aren't clickable) |
| Trustpilot / Google | "You can {action} at heliaxis.co.uk/book or call us on 01633 965205." |

For Trustpilot and Google, add a short redirect **`/book`** → `/book-a-survey?utm_source=review&utm_medium=review-reply`, so review replies show a clean address that is still tracked. (A per-platform pair, `/book/tp` and `/book/g`, would separate Trustpilot from Google. Cal to decide; the default is the single `/book`.)

## 4. Bookings by channel (Insights)

Insights counts bookings and callbacks where the source came from `utm_medium=social-reply` or `review-reply`, read from the existing booking and lead records. No new booking table is needed.
