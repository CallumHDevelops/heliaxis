'use client';

import { useState } from 'react';
import type { Supplier } from '@/lib/purchase-orders/shared';
import { api } from './OrdersUi';

type Fields = { name: string; contact_name: string; email: string; phone: string; account_number: string; address: string; notes: string };
const fieldsOf = (s?: Partial<Supplier> | null): Fields => ({
  name: s?.name ?? '',
  contact_name: s?.contact_name ?? '',
  email: s?.email ?? '',
  phone: s?.phone ?? '',
  account_number: s?.account_number ?? '',
  address: s?.address ?? '',
  notes: s?.notes ?? '',
});

/**
 * Add or edit a supplier: name, contact, email (where orders are emailed), phone, our account
 * number, address and notes. `compact`: the quick version inside the order sheet (no address or
 * notes; they can be added from Suppliers later).
 */
export function SupplierForm({
  supplier,
  compact = false,
  onSaved,
  onCancel,
}: {
  supplier?: Supplier | null;
  compact?: boolean;
  onSaved: (s: Supplier) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState<Fields>(fieldsOf(supplier));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const id = supplier?.id ?? 'new';

  async function save() {
    setBusy(true);
    setErr('');
    try {
      const body = compact ? { name: f.name, contact_name: f.contact_name, email: f.email, phone: f.phone, account_number: f.account_number } : f;
      const d = supplier
        ? await api<{ supplier: Supplier }>(`/api/crm/suppliers/${supplier.id}`, { method: 'PATCH', body }, 'Not saved. Try again.')
        : await api<{ supplier: Supplier }>('/api/crm/suppliers', { method: 'POST', body }, 'Not saved. Try again.');
      onSaved(d.supplier);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Not saved. Try again.');
      setBusy(false);
    }
  }

  return (
    <div
      className={`po-supform${compact ? ' po-supform--compact' : ''}`}
      role="group"
      aria-label={supplier ? `Edit ${supplier.name}` : 'Add a supplier'}
      onKeyDown={(e) => {
        // Enter saves (the order sheet around it is a form of its own).
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
          e.preventDefault();
          if (f.name.trim() && !busy) void save();
        }
      }}
    >
      <div className="crm-grid2">
        <div>
          <label className="crm-label" htmlFor={`sup-${id}-name`}>
            Supplier name
          </label>
          <input id={`sup-${id}-name`} className="crm-input" value={f.name} onChange={set('name')} autoFocus={!supplier} placeholder="e.g. CEF Newport" />
        </div>
        <div>
          <label className="crm-label" htmlFor={`sup-${id}-email`}>
            Email for orders
          </label>
          <input id={`sup-${id}-email`} className="crm-input" type="email" inputMode="email" value={f.email} onChange={set('email')} placeholder="orders@…" />
        </div>
        <div>
          <label className="crm-label" htmlFor={`sup-${id}-contact`}>
            Contact name
          </label>
          <input id={`sup-${id}-contact`} className="crm-input" value={f.contact_name} onChange={set('contact_name')} />
        </div>
        <div>
          <label className="crm-label" htmlFor={`sup-${id}-phone`}>
            Phone
          </label>
          <input id={`sup-${id}-phone`} className="crm-input" type="tel" value={f.phone} onChange={set('phone')} />
        </div>
        <div>
          <label className="crm-label" htmlFor={`sup-${id}-acct`}>
            Our account number with them
          </label>
          <input id={`sup-${id}-acct`} className="crm-input" value={f.account_number} onChange={set('account_number')} />
        </div>
      </div>
      {!compact && (
        <>
          <label className="crm-label" htmlFor={`sup-${id}-addr`}>
            Address
          </label>
          <textarea id={`sup-${id}-addr`} className="crm-input" rows={3} value={f.address} onChange={set('address')} />
          <label className="crm-label" htmlFor={`sup-${id}-notes`}>
            Notes
          </label>
          <textarea id={`sup-${id}-notes`} className="crm-input" rows={2} value={f.notes} onChange={set('notes')} placeholder="Opening hours, trade counter, delivery days…" />
        </>
      )}
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      <div className="crm-actions">
        <button type="button" className="crm-btn crm-btn--solar" disabled={busy || !f.name.trim()} onClick={() => void save()}>
          {busy ? 'Saving…' : supplier ? 'Save supplier' : 'Add supplier'}
        </button>
        <button type="button" className="crm-btn crm-btn--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
