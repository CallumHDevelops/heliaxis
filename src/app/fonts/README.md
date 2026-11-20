# Self-hosted web fonts

These are served from the repo instead of `next/font/google`, because downloading them from Google at build time failed
often enough to break Vercel deploys (November 2026).

| File | Family | Weights | Source | Licence |
| --- | --- | --- | --- | --- |
| `outfit-latin.woff2` | Outfit (variable) | 300 to 800 | Google Fonts, latin subset | SIL Open Font License 1.1 |
| `hanken-grotesk-latin.woff2` | Hanken Grotesk (variable) | 400 to 700 | Google Fonts, latin subset | SIL Open Font License 1.1 |
| `jetbrains-mono-latin.woff2` | JetBrains Mono (variable) | 400 to 600 | Google Fonts, latin subset | SIL Open Font License 1.1 |

To update one, download the latin `woff2` from `https://fonts.googleapis.com/css2?family=<Family>:wght@<min>..<max>`
(with a modern browser user agent) and replace the file. Used in `src/app/layout.tsx` and `src/app/admin/studio/layout.tsx`.
