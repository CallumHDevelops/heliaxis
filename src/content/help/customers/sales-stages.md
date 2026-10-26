---
title: Sales stages and moving a customer along
summary: The five sales stages, the main button at each one, how to move a customer by hand, and which moves the app makes by itself.
order: 130
keywords: stages, pipeline stages, lead, contacted, survey booked, surveyed, quote sent, won, move stage, mark contacted, mark won, stage path, automatic moves
where: CRM › Opportunities › a customer
access: crm
---
A customer’s job goes through five sales stages, then **Won**. From Won it’s a project (see [How a job flows from Won to handed over](/admin/help/projects/how-a-job-flows)).

| Stage | Means | Main button on their page |
| --- | --- | --- |
| **Lead** | A new enquiry nobody has contacted yet | **Mark contacted** |
| **Contacted** | We’ve been in touch | **Send booking link** |
| **Survey booked** | There’s a survey date | **Find a time** (on the day: **Start survey**, once the survey tool is switched on) |
| **Surveyed** | The survey is done; it needs a quote | **Send quote for signing** |
| **Quote sent** | The quote is with them to sign | **Chase quote** (**Mark Won** is in **⋯**) |

Until online survey booking is switched on, **Send booking link** and **Find a time** become **Add survey date** or **Change survey date**, which take you to the survey date on the **Overview** tab. A job with no solar, battery or heat pump (an EV charger or LEDs only, say) needs no survey, so it gets **Add home visit date** instead. For the booking side, see [Send a customer their booking link](/admin/help/surveys/send-a-booking-link) and [Book a survey with Find a time](/admin/help/surveys/find-a-time).

**Chase quote** opens a WhatsApp to them, already written: “Hi Jane, just checking you got our quote and whether you have any questions. Happy to talk it through.” Check it and send it.

## Move a customer by hand

- Press the main button.
- Or press the stage button (such as **Contacted ▾**). **Move stage** lists every stage under **Sales**, **Delivery** and **Done**. Tap one.
- Or tap a step on the stage path under the header. It asks “Move Jane Smith to Surveyed?” first.
- Or, on the Board, drag the card, or press **Move** on any card.

**Mark Won** (in **⋯**) asks “Mark Jane Smith’s job as Won?” first. On a phone there’s no **⋯**: pick **Won** with the stage button instead (it doesn’t ask). Moving to **Lost** asks why: see [Lost, on hold and reopening](/admin/help/customers/lost-and-on-hold).

## Moves the app makes by itself

| When this happens | The job moves to | From |
| --- | --- | --- |
| Someone calls (logged), visits, WhatsApps or emails them | **Contacted** | Lead |
| A survey date is set, or they book a survey online | **Survey booked** | Lead or Contacted |
| A survey is finished in the app | **Surveyed** | Lead, Contacted or Survey booked |
| You send the quote for signing | **Quote sent** | any earlier sales stage |
| They sign the quote online | **Won** | any sales stage |

The app only ever moves a job forward like this, never back. Each move goes on the timeline, such as “Lead → Contacted (we got in touch)”.

When the stage moves, by hand or by itself, the customer’s status on the Enquiries page follows their most advanced job that isn’t Lost (see [Enquiry statuses](/admin/help/enquiries/statuses)). Once Meta conversions are connected, Meta also hears (once per job) about a survey booked, a quote sent and a sale, so the ads learn who buys (see [Meta conversions: sending sales back to Meta](/admin/help/reports/meta-conversions)).

> **Good to know:** A plain note doesn’t count as getting in touch. Log it as a call or site visit if you spoke to them.

See also [Send a quote for signing](/admin/help/customers/send-quote-for-signing).
