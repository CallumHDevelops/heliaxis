---
title: Survey booking settings
summary: Switch online booking on or off, choose request or instant booking, and set surveyors, hours, survey lengths and closed days.
order: 80
keywords: booking settings, online booking on, instant booking, ask me to confirm, surveyors, working hours, closed days, holidays, cut-off, survey length, buffer, preview, gear
where: CRM › Surveys and diary › ⚙
path: /admin/surveys/settings
access: admin
---
Admins open the settings with **⚙** at the end of the tabs on the Surveys and diary page. Only admins see **⚙**. Anyone else on the CRM who opens the page can look but can’t change anything.

Change what you need, then tap **Save** (below **Advanced (leave as is)**). "Unsaved changes" shows until you do.

## Connections

Whether Outlook is connected, where drive times come from (Google or the app’s own estimate), and whether the "I’m not a robot" check is on for the website form. **Test calendar** checks the app can read each surveyor’s calendar and the install calendar.

## Online booking

- The first tick box switches online booking on and off. It reads **Online booking is on** or **Online booking is off**. When it’s on, customers can book on the website (heliaxis.co.uk/book-a-survey) and with booking links. While it’s off, staff can still find times and book them in the Diary.
- **When a customer picks a time**:
  - **Ask me to confirm**: it comes to the Diary under **Waiting for you**. Each request shows whether instant booking would have accepted it.
  - **Book instantly**: it’s booked straight away and goes in Outlook. If Outlook isn’t connected or can’t be read, it asks you instead.

## Who does surveys

For each surveyor: **First name (customers see this)**, **Outlook email**, **Home postcode** and what it’s **Called** (for example "Home"). Each day starts and ends there.

Under **Hours**, tick the days they survey and set the first start and last finish on site. You can limit a day to customers within a set number of minutes of home, for example "Friday: only for customers within 30 min of home".

**+ Add another surveyor** adds one. With more than one, each has a **Remove …** button. A new surveyor’s mailbox must also be added to the app’s Microsoft 365 access; **Test calendar** tells you if it isn’t.

## Rules

- **Cut-off**: no bookings for the next working day after this time.
- How long each survey takes: **Solar survey**, **Heat pump survey** and **Both**.
- **Surveys a day (at most)**.
- **Buffer after each appointment** and **Coffee between appointments**, added to the drive between customers.
- **Solar surveys finish before sunset**.

## Closed days

Days with no surveys at all, such as holidays or training. Pick a date and tap **Add**; tap **×** to remove one. Bank holidays are already off.

## Advanced (leave as is)

Leave-home and home-by times, how long before the survey customers can change it online, how far ahead they can book, how long a picked time is held, when requests lapse, drive time settings, rush hours, whether bank holidays are off, whether tentative Outlook appointments count as busy, whether Outlook subjects show in the Diary, whether installs block the surveyor’s diary, the install calendar, and a message for the top of the booking form.

## Preview and What your diary says

- **Preview**: type a postcode and pick a survey type to see what a customer would be offered, using the saved settings (save first to see a change). It works while online booking is off.
- **What your diary says**: **Read my diary** reads the last 10 weeks of Outlook (nothing is changed) and suggests settings that match how you actually work. Tapping a suggestion changes the form; tap **Save** to keep it.

> **Admins only:** Only admins can change these settings.

> **Once switched on:** Until survey-booking.sql has been run, customers can’t book and the Diary stays hidden, but you can still check these settings.
