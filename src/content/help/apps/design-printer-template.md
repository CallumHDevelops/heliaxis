---
title: Design over a printer’s template
summary: Import the template PDF from your printer, such as instantprint’s 3×3 pop-up stand drawn at 25%, design over it, then hide or remove it and export a full-size print PDF.
order: 15
keywords: printer template, PDF template, instantprint, pop-up stand, popup banner, exhibition stand, fabric display, artwork template, 25% scale, scale, real size, full size, bleed, safe zone, die-line, guide, hide template, remove template, template library, use on this design
where: Apps › Design studio › Design › Printer template
path: /admin/design
access: design
---
Printers such as instantprint give you a template PDF for each product, with its finished size, bleed and safe zone. The design studio reads the PDF, sets your design up at the real printed size and shows the template as a guide while you work. The template is left out of your export.

## Worked example: an instantprint 3×3 pop-up stand

instantprint’s template for the straight fabric 3×3 pop-up stand is drawn at 25% scale. Its notes give three sizes:

| On the template | Size |
| --- | --- |
| Safe Zone | 2900 × 2200 mm |
| Finished Size | 2960 × 2260 mm |
| With Bleed | 3020 × 2320 mm |

The studio reads those notes, so your design comes out at the real size, not a quarter of it.

### 1. Import the template

Any of these works:

- In the **New design** box, click **Start from a printer template…** and pick the PDF.
- On the **Design** tab, under **Printer template**, click **Import printer template (PDF)**.
- Drag the PDF onto the page.

### 2. Check the Printer template box

![The Printer template box](/help/apps/design-template-dialog.jpg "What the studio read from the 25% pop-up template: the real size is 3020 × 2320 mm")

1. **Name** starts as the file’s name. Change it to something you’ll recognise, such as "Pop-up 3x3 (instantprint)": it names the design and the template.
2. The green box should say **Detected from the template**. Its lines say the template is drawn at 25% scale, give the printer’s sizes (2960 × 2260 mm finished, 3020 × 2320 mm with bleed, so 30 mm bleed) and the 30 mm safe zone, and say it’s the same size as the studio’s **Pop-up 3×3 straight fabric**, so the strips that wrap round the frame are marked for you.
3. **Bleed** and **Safe** both show 30 mm.
4. The line under them reads **Real size** (the printer’s template is drawn at 25%): Sheet 3020 × 2320 mm → finished 2960 × 2260 mm. Your PDF will be exactly this size.
5. Under **Show the template**, leave **Behind (bottom layer)** picked.
6. Leave **Save to the template library** ticked, to use it again next time.
7. Click **New design on this template**.

If the box says **Partly detected — check the numbers** or **Couldn’t detect the trim — please check**, compare **Bleed** and **Safe** with the printer’s instructions first. A PDF with several pages has a **Page** list; the studio starts on the first page that has the sizes.

### 3. Design over it

![A design over the template](/help/apps/design-studio-template.jpg "The logo, headline, button and contact line over the template, which is the bottom row in Layers")

The design opens at full size, on one page called **Graphic**. The bar along the bottom says 2960×2260 mm, 30 mm bleed and **Printer template drawn at 25% — set up at full size.**, and a label on the page shows the template’s name and **guide only**.

- Add what you need from **Brand**, **Text**, **Photos**, **Icons** and **Shapes**. Each piece is a layer of its own, over the template.
- Or, on the **Design** tab under **Starting layouts**, click **Pop-up stand**: a dark background over the whole sheet, with the logo, a headline, four icons and the phone number on the front face. (If the page already has something on it, the studio asks before replacing it.)
- Keep text out of the hatched strips at each side. They wrap round the frame and can’t be seen from the front; the check warns you about text in them.
- Photos only need 75 dpi at this size (that’s 300 dpi on the 25% template).

> **Good to know:** **Behind** puts the template under everything, so a background that covers the sheet hides it. To see the template’s lines over your artwork, choose **On top** on the **Design** tab under **Printer template**. It then moves to the top of **Layers**.

### 4. Hide or remove the template

- To see the design without it, open **Layers** and click the eye on the bottom row, **Printer template** (or choose **Hidden** on the **Design** tab). The label on the page then says **hidden**. Click the eye again to bring it back.
- To take it off the design, click the bin on that row (or **Remove template** on the **Design** tab). The message "Printer template removed — your artwork is unchanged." has an **Undo** button if you change your mind. The design keeps its size.

See [Work with layers](/admin/help/apps/design-layers).

### 5. Export the print PDF

1. Click **Check** and fix anything under **Fix before printing**. Its notes remind you that the printer template won’t be in your PDF.
2. Click **Export**, keep **Print PDF** picked and leave **Include the printer template** unticked.
3. Click **Download print PDF**.

The PDF is 3020 × 2320 mm: the full size with 30 mm bleed all round, and the cut line marked inside it. Send that file to the printer. See [Check and export a design](/admin/help/apps/design-export) for the options.

## Already started on another size?

Open that design, import the template, and click **Use on this design** instead. The page changes to the template’s size and your artwork moves across, centred, and shrunk if the new page is smaller (never enlarged). A background that covered the old sheet is stretched over the new one.

## Other templates

For a template that isn’t one of the studio’s own sizes, the **Design** tab shows **Getting started**, with two brand backgrounds to lay across the sheet. While a template is on the design its bleed can’t be changed on the right; the safe area can.

## The template library

Saved templates are listed on the **Design** tab under **Template library**, with their sizes. Click one to open it in the **Printer template** box again. The bin removes it from the library; designs that use it keep working.

> **Watch out:** A password-protected PDF can’t be used: ask the printer for an unlocked template. A template over 40 MB still shows on your page, but it can’t be uploaded, so it isn’t saved with the design.

> **Once switched on:** The template library needs design-studio.sql run on Setup. Until then, **Save to the template library** can’t be ticked.
