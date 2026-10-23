---
title: Order kit for a job
summary: Make a supplier purchase order from a job, with lines filled in from its system details, and email it or mark it sent.
order: 10
keywords: new purchase order, PO, order kit, supplier order, materials, panels, inverter, delivery, required by, part number, save draft, save and email, Microsoft 365, shared mailbox, mark as sent, download PDF
where: Operations › Projects › a job › Orders
access: crm
---
Kit is ordered from the job’s **Orders** tab. The order then shows there and on the Purchase orders page ([The Purchase orders page](/admin/help/purchase-orders/purchase-orders-page)).

1. Open the job, go to **Orders** and press **+ New purchase order** (or **+ Add** on the Purchase orders tile).
2. Choose the **Supplier** (or **+ Add a supplier**) and the **Required by** date.
3. **Delivery**: **To the site**, **To the office** or **We’ll collect**. The address fills in from the job.
4. Check **What you’re ordering**. The lines fill in from the job’s system details or the survey (“Filled in from the job’s system details. Add the prices from the supplier’s quote.”). Each line has a description, **Part no.**, **Qty**, **Unit £ ex VAT**, **VAT** (20%, 5% or 0%) and the net. Press **+ Add a line** for more, and use the arrows to reorder. The totals update as you type.
5. Add **Notes to the supplier (on the PO)** and, if you like, **Our note**, which is never on the PO.
6. Press **Save draft**, or **Save and email**. Without Microsoft 365 connected the button says **Save and send**.
7. Send it:
   - With Microsoft 365: check the email (**To**, **Message**; “Goes from the shared mailbox with PO-0123.pdf attached. Their reply comes to you.”), then press **Send email**. If you sent it another way, from Outlook say, press **I sent it another way: mark as sent** instead.
   - Without Microsoft 365: press **Download PDF**, email it yourself, then press **Mark as sent**.

![The New purchase order sheet with lines filled from the system details, prices, totals and notes.](/help/purchase-orders/s20-new-purchase-order.jpg "New purchase order: lines filled in from the system details, prices typed in, totals and notes.")

> **Good to know:** The lines come from the job’s system details, so fill those in first. See [System details and design details](/admin/help/projects/system-details).

> **Once switched on:** The Orders tab and the Purchase orders tile need purchase-orders.sql. See [What needs switching on](/admin/help/projects/what-needs-switching-on).

Once it’s gone, see [Confirm, receive and pay a supplier order](/admin/help/purchase-orders/move-an-order-on).
