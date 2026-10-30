# Heliaxis: house rules for anyone (or any assistant) changing this code

## Buttons and controls

- **Every button uses the house style.** In the CRM and admin that means the `crm-btn` classes (`crm-btn crm-btn--solar` for the main action, `crm-btn crm-btn--ghost` for the others, add `crm-btn--small` in tight spaces; `crm-link` for an inline text action). On the public site use the site's own button classes. Never leave a browser-default button, input or link-as-button unstyled.
- **Never show the browser's own file control** ("Choose File / No file chosen"). Use `FileButton` from `src/app/admin/crm/CrmUi.tsx`: a house-style button that opens a hidden file input.
- Buttons are real `<button type="button">` elements, are disabled while they work, and say what they are doing ("Writing…", "Saving…").
- Icons come only from the brand kit (`brand-kit/heliaxis-icons.svg`, duotone) via `BrandIcon` in `CrmUi.tsx`. No emoji in the interface.
- Anything that waits on the writing assistant shows the spark animation (`WritingSpark`), as the solar estimator does.

## Customer-facing documents

- Quotes and other PDFs are made in the document kit (`src/lib/documents/pdf-kit.ts`): the Heliaxis header, the cover page first, then the content, then the terms and acceptance on their own page.
- Nothing is claimed that is not in the quote or the design proposal: no invented warranties, certifications, prices or timescales.

## Next.js

This is not the Next.js you know: read the relevant guide in `node_modules/next/dist/docs/` before changing routing, caching or rendering code.
