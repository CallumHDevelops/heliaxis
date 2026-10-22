---
title: Check and export a design
summary: Run the brand and print check, then download a print-ready PDF for the printer, or a PNG or JPG for screens.
order: 25
keywords: export, download, print PDF, print ready, CMYK, rich black, bleed, crop marks, trim, PNG, JPG, picture, resolution, dpi, brand check, print check, preflight, low resolution, include the printer template, print colours, send to printer
where: Apps › Design studio › Export
path: /admin/design
access: design
---
## Run the check

Click **Check** in the top bar. The **Brand & print check** (**Brand check** for social sizes) looks at the page you’re on and sorts what it finds into three lists:

| List | For example |
| --- | --- |
| **Fix before printing** | Text, a logo or an icon crossing the cut line; something right off the page; a photo far too low-resolution for its size; an empty photo frame; a stretched logo |
| **Worth checking** | Text, a logo or an icon outside the safe area; text in a wrap-round strip; a background that stops at the cut line instead of the bleed edge; a photo a little low-resolution; text under 6 pt, or hard to read on its background; colours outside the brand palette; the wrong logo for the background; a logo under 25 mm wide; a font that isn’t a brand font; gold used for body text |
| **Notes** | That the printer template won’t be in your PDF; an empty text box |

Click a line to pick the thing it’s about, fix it, then check again (**Re-check** runs it again while the box is open). **Done** closes it. With nothing to fix, it says **Looks ready to print.** (**Looks good to go.** for social sizes).

> **Good to know:** The check covers the page you’re on. Click each page along the bottom and check it too.

## Export

Click **Export** (or press Ctrl+E). The top of the box repeats the check for this page: **Checks passed on this page.**, or how many problems or things to check it found, with **Review** to see them.

![The Export box](/help/apps/design-export.jpg "Print PDF, with the printer template left out")

### Print PDF (for the printer)

**Print PDF** is picked for print sizes. The options:

- **CMYK colours**: brand colours as print inks. Leave it ticked for anything printed.
- **Rich black for large dark areas**: big Ink backgrounds print deep black, not grey.
- **Small dark text in 100% black**: dark text under 12 pt prints in black ink alone, so it stays crisp.
- **Crop marks**: most online printers want bleed only. Tick it only if yours asks for marks.
- **Include the printer template**: only there when the design has a template. Leave it unticked: the template is a guide.

The two black options need **CMYK colours** ticked.

Click **Download print PDF**. Every page goes into one PDF, named after the design, at the exact size with the bleed, and with the cut line marked in the file. Text is turned into outlines, shapes stay sharp at any size, and photos keep their full resolution. When it’s done the box says **Downloaded.**, or lists what you should know under **Exported, with notes:**.

A pop-up stand set up from instantprint’s 25% template comes out at its real size, 3020 × 2320 mm. See [Design over a printer’s template](/admin/help/apps/design-printer-template).

### PNG or JPG (for screens)

Pick **PNG** or **JPG**. Social sizes come out at exactly their pixel size, such as 1080 × 1080 px. For other sizes, choose a **Resolution**: **72 dpi (screen)**, **150 dpi (proof)** or **300 dpi (print)**. With more than one page, **Every page** downloads one file per page; untick it for just the page you’re on. Then click **Download PNG** or **Download JPG**.

> **Good to know:** A very big page, such as a pop-up stand, can be too big for the browser to make at a high dpi. It then comes out at a lower dpi and the box says so. For print, use the Print PDF.

## Print colours

**Print colours (CMYK) →**, under the Print PDF options, shows the ink mix used for each brand colour and for rich black. They start as a calculated conversion (marked **calculated**). Ask the printer or the brand designer for the official values.

> **Admins only:** Only an admin can change the print colours and click **Save for everyone**. Everyone’s print PDFs then use them.
