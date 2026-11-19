'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addKeywords, confirmChecklist, recheckSetup, saveSetting, setRole, updateKeyword } from '../actions';
import type { SettingKey } from '@/lib/search/settings';

export type Field = { key: string; label: string; type: 'text' | 'textarea' | 'number' | 'list' | 'checks'; options?: string[]; help?: string };

/** A settings form: each field maps to one key of the setting's value. Lists are one item per line. */
export function SettingForm({ setting, value, fields, disabled }: { setting: SettingKey; value: Record<string, unknown>; fields: Field[]; disabled?: boolean }) {
  const router = useRouter();
  const [v, setV] = useState<Record<string, unknown>>(value);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: string, x: unknown) => setV((o) => ({ ...o, [k]: x }));
  return (
    <form
      className="sx-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        const r = await saveSetting(setting, v);
        setBusy(false);
        setMsg(r.ok ? { ok: true, text: r.message ?? 'Saved.' } : { ok: false, text: r.error });
        if (r.ok) router.refresh();
      }}
    >
      {fields.map((f) => (
        <label key={f.key}>
          {f.label}
          {f.type === 'textarea' ? (
            <textarea value={String(v[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)} disabled={disabled} />
          ) : f.type === 'number' ? (
            <input type="number" step="any" value={String(v[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value === '' ? '' : Number(e.target.value))} disabled={disabled} />
          ) : f.type === 'list' ? (
            <textarea value={((v[f.key] as string[]) ?? []).join('\n')} onChange={(e) => set(f.key, e.target.value.split('\n').map((x) => x.trim()).filter(Boolean))} disabled={disabled} />
          ) : f.type === 'checks' ? (
            <span className="sx-row">
              {(f.options ?? []).map((o) => {
                const list = (v[f.key] as string[]) ?? [];
                return (
                  <span key={o} className="sx-row" style={{ gap: 4, fontWeight: 400 }}>
                    <input type="checkbox" checked={list.includes(o)} disabled={disabled} onChange={(e) => set(f.key, e.target.checked ? [...list, o] : list.filter((x) => x !== o))} aria-label={o} />
                    {o}
                  </span>
                );
              })}
            </span>
          ) : (
            <input value={String(v[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)} disabled={disabled} />
          )}
          {f.help && <small className="sx-note">{f.help}</small>}
        </label>
      ))}
      <div className="sx-row">
        <button type="submit" className="crm-btn crm-btn--solar crm-btn--small" disabled={busy || disabled}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {disabled && <small className="sx-note">Only the owner can change this.</small>}
        {msg && <small className={msg.ok ? 'sx-up' : 'sx-down'}>{msg.text}</small>}
      </div>
    </form>
  );
}

export function BudgetForm({ cap, low, disabled }: { cap: number; low: number; disabled: boolean }) {
  const router = useRouter();
  const [c, setC] = useState(String(cap));
  const [l, setL] = useState(String(low));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      className="sx-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await saveSetting('budget', { caps: { dataforseo: Number(c) }, lowBalanceUsd: Number(l) });
        setBusy(false);
        setMsg(r.ok ? { ok: true, text: 'Saved.' } : { ok: false, text: r.error });
        if (r.ok) router.refresh();
      }}
    >
      <label>
        DataForSEO monthly cap ($)
        <input type="number" min="0" step="1" value={c} onChange={(e) => setC(e.target.value)} disabled={disabled} />
      </label>
      <label>
        Warn when the DataForSEO balance is under ($)
        <input type="number" min="0" step="1" value={l} onChange={(e) => setL(e.target.value)} disabled={disabled} />
      </label>
      <div className="sx-row">
        <button type="submit" className="crm-btn crm-btn--solar crm-btn--small" disabled={busy || disabled}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {disabled && <small className="sx-note">Only the owner can change the budget.</small>}
        {msg && <small className={msg.ok ? 'sx-up' : 'sx-down'}>{msg.text}</small>}
      </div>
    </form>
  );
}

export function ConfirmItem({ item, done }: { item: string; done: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={`crm-btn crm-btn--small ${done ? 'crm-btn--ghost' : 'crm-btn--solar'}`}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await confirmChecklist(item, !done);
        setBusy(false);
        router.refresh();
      }}
    >
      {busy ? 'Saving…' : done ? 'Untick' : 'Tick: done'}
    </button>
  );
}

export function Recheck() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="crm-btn crm-btn--ghost crm-btn--small"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await recheckSetup();
        setBusy(false);
        router.refresh();
      }}
    >
      {busy ? 'Checking…' : 'Check again now'}
    </button>
  );
}

export function BulkAdd() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [priority, setPriority] = useState(2);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="sx-form">
      <label>
        Add searches, one per line, as “search | town”
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={'solar panels Penarth | Penarth\nbattery storage Chepstow | Chepstow'} />
      </label>
      <div className="sx-row">
        <label className="sx-row" style={{ fontWeight: 600 }}>
          Priority
          <select value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </label>
        <button
          type="button"
          className="crm-btn crm-btn--solar crm-btn--small"
          disabled={busy || !text.trim()}
          onClick={async () => {
            setBusy(true);
            const r = await addKeywords(text, { priority });
            setBusy(false);
            setMsg(r.ok ? (r.message ?? 'Added.') : r.error);
            if (r.ok) {
              setText('');
              router.refresh();
            }
          }}
        >
          {busy ? 'Adding…' : 'Add'}
        </button>
        {msg && <small className="sx-note">{msg}</small>}
      </div>
    </div>
  );
}

export function KeywordRow({ k, editable }: { k: { id: number; phrase: string; town: string | null; service: string | null; intent: string; priority: number; target_page: string | null; active: boolean; devices: string[]; location_name: string | null }; editable: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const save = async (patch: Parameters<typeof updateKeyword>[1]) => {
    setBusy(true);
    await updateKeyword(k.id, patch);
    setBusy(false);
    router.refresh();
  };
  return (
    <tr style={k.active ? undefined : { opacity: 0.55 }}>
      <td>{k.phrase}</td>
      <td>
        {k.town}
        <br />
        <small className="sx-note">{k.location_name ?? ''}</small>
      </td>
      <td>
        <select value={k.service ?? 'general'} disabled={!editable || busy} onChange={(e) => save({ service: e.target.value })} aria-label="Service">
          {['solar', 'battery', 'heat_pump', 'ev', 'infrared', 'general'].map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select value={k.intent} disabled={!editable || busy} onChange={(e) => save({ intent: e.target.value })} aria-label="Intent">
          <option value="local_commercial">local commercial</option>
          <option value="commercial">commercial</option>
          <option value="informational">informational</option>
        </select>
      </td>
      <td>
        <select value={k.priority} disabled={!editable || busy} onChange={(e) => save({ priority: Number(e.target.value) })} aria-label="Priority">
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
        </select>
      </td>
      <td>
        <input defaultValue={k.target_page ?? ''} placeholder="/solar-panels-cardiff" disabled={!editable || busy} onBlur={(e) => e.target.value !== (k.target_page ?? '') && save({ target_page: e.target.value || null })} aria-label="Target page" style={{ width: 170 }} />
      </td>
      <td>
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!editable || busy} onClick={() => save({ active: !k.active })}>
          {busy ? 'Saving…' : k.active ? 'Pause' : 'Resume'}
        </button>
      </td>
    </tr>
  );
}

export function AccessRow({ id, name, role, isSelfOwner }: { id: string; name: string; role: string; isSelfOwner: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <tr>
      <td>{name}</td>
      <td>
        <select
          value={role}
          disabled={!isSelfOwner || busy}
          aria-label={`Role for ${name}`}
          onChange={async (e) => {
            setBusy(true);
            setErr(null);
            const r = await setRole(id, e.target.value);
            setBusy(false);
            if (!r.ok) setErr(r.error);
            router.refresh();
          }}
        >
          <option value="owner">Owner</option>
          <option value="admin">Admin</option>
          <option value="editor">Editor</option>
          <option value="viewer">Viewer</option>
        </select>
        {err && <small className="sx-down"> {err}</small>}
      </td>
    </tr>
  );
}
