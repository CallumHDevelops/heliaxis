---
title: Save and reopen designs
summary: How the studio saves as you work, what the save status means, where your designs are, and what happens when two computers change the same design.
order: 30
keywords: save, autosave, saved, unsaved changes, saving, save failed, kept locally, changed elsewhere, save a copy, my copy, conflict, designs, your designs, open, duplicate, copy, delete, rename, draft, this computer, offline, sign out, lost work
where: Apps › Design studio › Designs
path: /admin/design
access: design
---
The studio saves by itself a moment after each change. **Save** in the top bar (or Ctrl+S) saves straight away.

## The save status

The status sits next to the design’s name:

| Status | What it means |
| --- | --- |
| **Not saved yet** | A new design with nothing on it. It’s saved once you add something or click **Save**. |
| **Unsaved changes** | You’ve changed something, and it saves in a moment. |
| **Saving…** | Saving now. |
| **Saved** | Saved to the cloud. |
| **Save failed — kept locally** | The cloud save didn’t work. Your changes are kept on this computer and the studio tries again after your next change. If you close or reload the page, the browser asks first. |
| **Changed elsewhere — save a copy** | Someone saved this design on another computer after you opened it. See below. |
| **On this computer** or **Saved on this computer** | Saving to the cloud isn’t switched on yet (see the note at the end). |

## Your designs

Click **Designs** in the top bar to open **Your designs**, newest first. Everyone with Design studio access shares this list.

- Click a design’s picture to open it.
- The copy button makes a copy called "… copy".
- The bin deletes it, after you confirm.

To rename a design, click its name in the top bar and type. The browser’s address includes the design you have open, so a bookmark or a reload opens it again.

## Two computers, one design

The studio never saves an older copy over newer work:

- If someone saves the design on another computer while you have it open, your next save doesn’t go through, and the status says **Changed elsewhere — save a copy**. Click it, or **Save mine as a copy** in the message, to keep your version as a new design called "… (my copy)". Their version stays in **Designs** as it is.
- If this computer has changes to a design that never reached the cloud, opening the design brings them back and saves them. If someone else has saved it since, their version opens instead, and your changes are kept as a separate design called "… (unsaved changes from this computer)".
- If someone deletes the design from **Designs** while you have it open, your work is saved as a new design the next time it saves.

## Kept on this computer

The studio also keeps the design you’re working on in this browser, separately for each person who signs in here. That’s how it picks up where you left off after a reload or a lost connection. Signing out clears it, so the next person never sees your design.

> **Good to know:** A design can have up to 12 pages. If a photo can’t be uploaded, the studio keeps it inside the design instead, which is fine for small pictures; with big ones the design can be too large to save.

> **Once switched on:** Saving to the cloud and the **Designs** list need design-studio.sql run on Setup. Until then your design is kept only in this browser: starting a new one replaces it (the studio asks first), and signing out clears it, so export anything you want to keep. See [Switch a feature on (run a database file)](/admin/help/admin/run-a-database-file).
