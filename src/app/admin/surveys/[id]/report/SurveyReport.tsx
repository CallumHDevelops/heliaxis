'use client';

import { compassLabel } from '@/lib/surveys/device';
import { evaluate, isShown, levelOf, roofName, roofsOf, slotFor, toSend, DRAWINGS_FLAG } from '@/lib/surveys/rules';
import { ENA_PHOTOS, fieldIndex, SCREENS, SOLAR_SCHEMA, type Answers, type Ctx, type Field, type RoofAnswers, type Section, type SurveyPayload, type SurveyPhoto } from '@/lib/surveys/solar-schema';
import { PhotoFigure } from '../PhotoSlot';

/**
 * The survey report: header with the DNO route, planning and structural verdicts, red flags, each
 * screen's answers (Should items not filled in grey), every photo with its drawing laid over it,
 * drawings still to do, what the customer will send, and the sign-off. Prints cleanly to A4.
 * For CRM staff (`ena`), the main cut-out and meter photos together, each to download for the DNO
 * application on ENA (left out of the print).
 */

const FIELDS = fieldIndex();
const UK_DATE = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
const UK_WHEN = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const DNO = { g98: 'G98', g99: 'G99', unknown: 'Not known' } as const;
const PLANNING = { permitted: 'Permitted development', check: 'Check with the council', consent: 'Listed building consent' } as const;
const STRUCTURAL = { desktop_ok: 'Desktop check', engineer: 'Structural engineer', not_suitable: 'Not suitable', unknown: 'Not known' } as const;
const STATUS = { booked: 'Booked', draft: 'Started, not finished', complete: 'Finished', cancelled: 'Cancelled' } as const;

const isPhoto = (f: Field) => f.type === 'photo' || f.type === 'photos';
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);

/** An answer in words, or null if there isn't one. */
function words(f: Field, v: unknown, src: Record<string, unknown>, roofs: RoofAnswers[]): string | null {
  if (v == null || v === '') return null;
  const opt = (k: unknown) => f.options?.find((o) => o.key === k)?.label ?? String(k);
  const unit = f.unit ? (f.unit === '°' ? '°' : ` ${f.unit}`) : '';
  switch (f.type) {
    case 'choice':
    case 'band': {
      const other = v === 'other' && typeof src[`${f.id}_other`] === 'string' ? `: ${src[`${f.id}_other`]}` : '';
      return `${opt(v)}${other}`;
    }
    case 'multi':
      return Array.isArray(v) && v.length ? v.map(opt).join(', ') : null;
    case 'yesno':
      return v === true ? 'Yes' : v === false ? 'No' : null;
    case 'number':
    case 'pitch':
      return num(v) != null ? `${num(v)}${f.type === 'pitch' ? '°' : unit}` : null;
    case 'compass':
      return num(v) != null ? `${compassLabel(num(v) as number)} (${Math.round(num(v) as number)}°)` : null;
    case 'dims': {
      if (typeof v === 'string') return `${v.replace('x', ' × ')}${unit}`;
      const o = v as { w?: unknown; d?: unknown };
      return num(o.w) && num(o.d) ? `${num(o.w)} × ${num(o.d)}${unit}` : null;
    }
    case 'address': {
      const o = v as { address?: string; postcode?: string };
      return [o.address, o.postcode].filter(Boolean).join(', ') || null;
    }
    case 'system': {
      const z = v as Record<string, unknown>;
      const faces = Array.isArray(z.faces) ? z.faces.map((id) => roofs.findIndex((r) => r.id === id)).filter((i) => i >= 0).map((i) => roofName(roofs[i], i)) : [];
      const bits = [
        num(z.panels) != null && `${num(z.panels)} panels`,
        num(z.kwp) != null && `${num(z.kwp)} kWp`,
        (z.inverter || num(z.inverterKw) != null) && `inverter ${[z.inverter, num(z.inverterKw) != null ? `${num(z.inverterKw)} kW` : null].filter(Boolean).join(', ')}`,
        num(z.batteryKwh) != null && `battery ${num(z.batteryKwh)} kWh`,
        faces.length > 0 && `on ${faces.join(' and ')}`,
      ].filter(Boolean);
      return bits.length ? bits.join(' · ') : null;
    }
    case 'signature': {
      const o = v as { name?: string };
      return o.name ? `Signed by ${o.name}` : null;
    }
    default:
      return typeof v === 'string' ? v : String(v);
  }
}

export function SurveyReport({ payload, ena }: { payload: SurveyPayload; /** Photo id → download link (the original file). */ ena?: Record<string, string> }) {
  const s = payload.survey;
  const answers: Answers = s.answers ?? {};
  const roofs = roofsOf(answers);
  const products = payload.project.products;
  const photos = payload.photos.filter((p) => p.slot);
  const ev = evaluate(SOLAR_SCHEMA, answers, photos.map((p) => ({ slot: p.slot as string, hasMarkup: !!p.markup })), products);
  const missing = new Set(ev.missing.map((m) => slotFor(m.field, m.roofId)));
  const notFilled = new Set(ev.notFilled.map((m) => slotFor(m.field, m.roofId)));
  const skip = (answers.skip ?? {}) as Record<string, string>;
  const base: Ctx = { a: { ...answers, roofs }, products };
  const customer = payload.customer?.name || payload.project.title || 'Customer';
  const a3 = (answers.A3 ?? {}) as { address?: string; postcode?: string };
  const address = [a3.address || payload.project.address, a3.postcode || payload.project.postcode].filter(Boolean).join(', ');
  const when = s.completed_at ?? s.finished_on_site_at ?? payload.project.survey_at;
  const red = ev.flags.filter((f) => f !== DRAWINGS_FLAG);
  const sending = toSend(answers);
  const z8 = (answers.Z8 ?? null) as { name?: string; at?: string } | null;
  const slotPhotos = (slot: string) => photos.filter((p) => p.slot === slot);

  const tools = (
    <div className="svr-tools">
      <a className="svf-btn svf-btn--ghost" href={`/admin/surveys/${s.id}`}>
        ← Survey
      </a>
      <a className="svf-btn svf-btn--ghost" href={`/admin/crm/${payload.project.id}`}>
        Open the job
      </a>
      <button type="button" className="svf-btn" onClick={() => window.print()}>
        🖨 Print or save as PDF
      </button>
    </div>
  );

  const head = (
    <header className="svr-head">
      <p className="svr-kicker">Heliaxis · {s.type === 'ashp' ? 'Heat pump survey' : 'Solar survey'}</p>
      <h1>{customer}</h1>
      <p>{address || 'No address'}</p>
      <p>
        {[
          when ? UK_DATE.format(new Date(when)) : null,
          s.completed_by_name || s.surveyor ? `Surveyor: ${s.completed_by_name || s.surveyor}` : null,
          payload.project.ref,
          STATUS[s.status],
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </header>
  );

  if (s.type === 'ashp') {
    return (
      <article className="svr">
        {tools}
        {head}
        <section className="svr-section">
          <h2>SimpliHeat</h2>
          <dl className="svr-qs">
            <div className="svr-q">
              <dt>SimpliHeat link</dt>
              <dd>{s.simpliheat_url ? <a href={s.simpliheat_url}>{s.simpliheat_url}</a> : <span className="svr-none">Not added</span>}</dd>
            </div>
            <div className="svr-q">
              <dt>Report</dt>
              <dd>
                {payload.documents.length ? (
                  payload.documents.map((d) => (
                    <a key={d.id} href={d.url ?? undefined} className="svr-doc">
                      📄 {d.name}
                    </a>
                  ))
                ) : (
                  <span className="svr-none">Not uploaded</span>
                )}
              </dd>
            </div>
            {s.notes && (
              <div className="svr-q">
                <dt>Notes</dt>
                <dd className="svr-text">{s.notes}</dd>
              </div>
            )}
          </dl>
          <Photos list={slotPhotos('G1')} label="Photo" />
        </section>
      </article>
    );
  }

  const renderField = (f: Field, ctx: Ctx, key: string) => {
    if (f.type === 'auto' || f.type === 'signature') return null;
    if (!isShown(f, ctx)) return null;
    const roofId = ctx.roof?.id;
    const slot = slotFor(f.id, roofId);
    const level = levelOf(f, ctx);
    if (isPhoto(f)) {
      const list = slotPhotos(slot);
      if (!list.length && level === 'optional') return null;
      return (
        <div key={key} className="svr-photos-q">
          <p className="svr-photos-q__label">
            {f.label}
            {missing.has(slot) ? <span className="svr-tag svr-tag--need"> Needed, missing</span> : null}
          </p>
          {list.length ? <Photos list={list} label={f.label} /> : <p className="svr-none">No photo</p>}
        </div>
      );
    }
    const src = (ctx.roof ?? answers) as Record<string, unknown>;
    const sent = f.canSend && (answers.send as Record<string, boolean> | undefined)?.[slot];
    const value = sent ? 'The customer will send this' : words(f, src[f.id], src, roofs);
    if (!value && level === 'optional') return null;
    return (
      <div key={key} className="svr-q">
        <dt>{f.label}</dt>
        <dd className={value ? (f.type === 'longtext' ? 'svr-text' : undefined) : 'svr-none'}>
          {value ?? (missing.has(slot) ? 'Needed, not filled' : notFilled.has(slot) ? 'Not filled' : '–')}
        </dd>
      </div>
    );
  };

  const renderSection = (sec: Section) => {
    if (sec.show && !sec.show(base)) return null;
    if (sec.key === 'J') return null; // the Finish screen is the summary at the top and the sign-off below
    if (!sec.perRoof) {
      if (skip[sec.key]) return <NotChecked key={sec.key} title={sec.title} reason={skip[sec.key]} />;
      return (
        <div key={sec.key} className="svr-block">
          {sec.title !== SCREENS[sec.screen].title && <h3>{sec.title}</h3>}
          <dl className="svr-qs">{sec.fields.map((f) => renderField(f, base, f.id))}</dl>
        </div>
      );
    }
    return (
      <div key={sec.key} className="svr-block">
        {sec.once?.length ? <dl className="svr-qs">{sec.once.map((f) => renderField(f, base, f.id))}</dl> : null}
        {roofs.map((r, i) => {
          const title = roofs.length > 1 ? `${sec.title}: ${roofName(r, i)}` : null;
          const reason = skip[`${sec.key}:${r.id}`];
          if (reason) return <NotChecked key={r.id} title={title ?? sec.title} reason={reason} />;
          const ctx: Ctx = { ...base, roof: r };
          const suggestion = sec.key === 'D' ? ev.suggestions[r.id] : undefined;
          return (
            <div key={r.id} className="svr-roof">
              {title && <h3>{title}</h3>}
              <dl className="svr-qs">{sec.fields.map((f) => renderField(f, ctx, `${f.id}:${r.id}`))}</dl>
              {suggestion && (
                <p className="svr-note">
                  Suggested: {STRUCTURAL[suggestion.verdict]}. {suggestion.reasons.join('. ')}.
                </p>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const z1 = FIELDS.get('Z1')?.field;
  const z6 = FIELDS.get('Z6')?.field;

  return (
    <article className="svr">
      {tools}
      {head}

      <div className="svr-chips">
        <span className="svr-chip">
          <small>DNO route</small>
          {DNO[ev.summary.dnoRoute]}
        </span>
        <span className="svr-chip">
          <small>Planning</small>
          {PLANNING[ev.summary.planning]}
        </span>
        <span className="svr-chip">
          <small>Structural</small>
          {STRUCTURAL[ev.summary.structural]}
        </span>
        <span className="svr-chip">
          <small>Done</small>
          {ev.percent}%
        </span>
      </div>
      <p className="svr-note">{ev.summary.dnoNote}</p>
      <p className="svr-note">{ev.summary.planningNote}</p>

      {red.length > 0 && (
        <section className="svr-section svr-flags">
          <h2>Red flags ({red.length})</h2>
          <ul>
            {red.map((f) => (
              <li key={f}>⚑ {f}</li>
            ))}
          </ul>
        </section>
      )}

      {(ev.drawingsToDo.length > 0 || sending.length > 0 || ev.missing.length > 0) && (
        <section className="svr-section">
          <h2>Still to do</h2>
          <ul className="svr-todo">
            {ev.missing.map((m) => (
              <li key={`m:${m.field}:${m.roofId ?? ''}`}>Needed: {m.label}</li>
            ))}
            {ev.drawingsToDo.map((m) => (
              <li key={`d:${m.field}:${m.roofId ?? ''}`}>Drawing to do: {m.label}</li>
            ))}
            {sending.map((k) => (
              <li key={`s:${k}`}>Customer will send: {FIELDS.get(k.split(':')[0])?.field.label ?? k}</li>
            ))}
          </ul>
        </section>
      )}

      {ena && (
        <section className="svr-section svr-ena">
          <h2>For the ENA application</h2>
          <p className="svr-note">The photos to upload to ENA (Connect Direct) for the DNO application. Download saves the original photo, without any drawing.</p>
          <div className="svr-ena__grid">
            {ENA_PHOTOS.map(({ slot }) => {
              const label = FIELDS.get(slot)?.field.label ?? slot;
              const list = slotPhotos(slot);
              return (
                <div key={slot} className="svr-ena__item">
                  <p className="svr-photos-q__label">{label}</p>
                  {list.length ? (
                    list.map((p, i) => (
                      <figure key={p.id} className="svr-photo">
                        <PhotoFigure src={p.url ?? p.thumb} markup={null} width={p.width} height={p.height} alt={`${label} ${i + 1}`} />
                        <figcaption className="svr-ena__foot">
                          <span>{list.length > 1 ? `Photo ${i + 1} of ${list.length}` : 'Photo'}</span>
                          {ena[p.id] ? (
                            <a className="svf-btn svf-btn--ghost" href={ena[p.id]} download>
                              ⬇ Download
                            </a>
                          ) : (
                            <span className="svr-none">Can’t download right now. Reload the page to try again.</span>
                          )}
                        </figcaption>
                      </figure>
                    ))
                  ) : (
                    <p className="svr-none">No photo yet</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {SCREENS.map((sc, i) => {
        if (i === SCREENS.length - 1) return null;
        const secs = SOLAR_SCHEMA.filter((x) => x.screen === i && (!x.show || x.show(base)));
        if (!secs.length) return null;
        return (
          <section key={sc.title} className="svr-section">
            <h2>{sc.title}</h2>
            {secs.map(renderSection)}
          </section>
        );
      })}

      <section className="svr-section">
        <h2>Finish</h2>
        <dl className="svr-qs">
          {z1 && renderField(z1, base, 'Z1')}
          {z6 && renderField(z6, base, 'Z6')}
        </dl>
        <div className="svr-sign">
          <h3>Customer sign-off</h3>
          <p>“I agree the kit locations and cable routes we discussed.”</p>
          {s.signatureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a signed storage URL
            <img src={s.signatureUrl} alt={`Signature of ${s.customer_signed_name ?? 'the customer'}`} />
          ) : null}
          <p>
            {s.customer_signed_name || z8?.name ? (
              <>
                Signed by <strong>{s.customer_signed_name || z8?.name}</strong>
                {s.customer_signed_at || z8?.at ? `, ${UK_WHEN.format(new Date((s.customer_signed_at || z8?.at) as string))}` : ''}
              </>
            ) : (
              <span className="svr-none">Not signed</span>
            )}
          </p>
        </div>
      </section>
    </article>
  );
}

function NotChecked({ title, reason }: { title: string; reason: string }) {
  return (
    <div className="svr-block">
      <h3>{title}</h3>
      <p className="svr-note">Not checked: {reason}</p>
    </div>
  );
}

function Photos({ list, label }: { list: SurveyPhoto[]; label: string }) {
  if (!list.length) return null;
  return (
    <div className="svr-photos">
      {list.map((p, i) => (
        <figure key={p.id} className="svr-photo">
          <PhotoFigure src={p.url ?? p.thumb} markup={p.markup} width={p.width} height={p.height} alt={`${label} ${i + 1}`} />
          <figcaption>
            {label}
            {list.length > 1 ? ` (${i + 1})` : ''}
            {p.markup ? ' · with drawing' : ''}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
