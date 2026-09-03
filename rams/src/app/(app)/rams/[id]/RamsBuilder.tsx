'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HazardPicker } from '@/components/rams/HazardPicker';
import { ChipSelect, ListEditor } from '@/components/rams/ListEditor';
import { RiskSelect } from '@/components/rams/RiskSelect';
import { Alert, Badge, Button, Card, Field, Input, Textarea } from '@/components/ui';
import { expiryState } from '@/lib/content/certifications';
import { PERMIT_OPTIONS, PPE_OPTIONS } from '@/lib/content/defaults';
import type { HazardTemplate } from '@/lib/content/hazards';
import { overallResidual, riskBand, riskScore } from '@/lib/risk';
import type {
  Certification,
  HazardEntry,
  Profile,
  RamsContent,
  RamsDocument,
} from '@/lib/types';
import { saveRamsContent } from '../actions';

const WHO_OPTIONS = [
  'Operatives',
  'Members of the public',
  'Building occupants',
  'Client / site staff',
  'Other trades',
  'Visitors',
  'Environment',
];

const TABS = [
  { id: 'scope', label: 'Scope' },
  { id: 'hazards', label: 'Risk assessment' },
  { id: 'method', label: 'Method statement' },
  { id: 'resources', label: 'PPE, plant & COSHH' },
  { id: 'emergency', label: 'Welfare & emergency' },
  { id: 'people', label: 'People & certificates' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function RamsBuilder({
  doc,
  certifications,
  staff,
  readOnly,
}: {
  doc: RamsDocument;
  certifications: Certification[];
  staff: Profile[];
  readOnly: boolean;
}) {
  const [content, setContent] = useState<RamsContent>(doc.content);
  const [title, setTitle] = useState(doc.title);
  const [reviewDate, setReviewDate] = useState(doc.review_date ?? '');
  const [tab, setTab] = useState<TabId>('scope');
  const [picker, setPicker] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const patch = useCallback((next: Partial<RamsContent>) => {
    setContent((c) => ({ ...c, ...next }));
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    if (readOnly) return;
    setSaving(true);
    setError(null);
    const res = await saveRamsContent(doc.id, { title, review_date: reviewDate, content });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setDirty(false);
    setSavedAt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
  }, [content, doc.id, readOnly, reviewDate, title]);

  // Autosave two seconds after the last edit, so a long build is never lost.
  // The ref keeps the timer from restarting every time `save` is recreated.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  useEffect(() => {
    if (!dirty || readOnly) return;
    const t = setTimeout(() => saveRef.current(), 2000);
    return () => clearTimeout(t);
  }, [content, title, reviewDate, dirty, readOnly]);

  // Warn on navigating away with unsaved edits in flight.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const residual = useMemo(() => overallResidual(content.hazards), [content.hazards]);

  function addHazards(templates: HazardTemplate[]) {
    patch({
      hazards: [
        ...content.hazards,
        ...templates.map((t) => ({
          id: uid('hz'),
          libraryId: t.id,
          hazard: t.hazard,
          whoIsAtRisk: [...t.whoIsAtRisk],
          initialLikelihood: t.initialLikelihood,
          initialSeverity: t.initialSeverity,
          controls: [...t.controls],
          residualLikelihood: t.residualLikelihood,
          residualSeverity: t.residualSeverity,
        })),
      ],
    });
  }

  function updateHazard(id: string, next: Partial<HazardEntry>) {
    patch({ hazards: content.hazards.map((h) => (h.id === id ? { ...h, ...next } : h)) });
  }

  return (
    <div className="space-y-5">
      {picker && (
        <HazardPicker
          technology={doc.technology}
          sector={doc.sector}
          existing={content.hazards}
          onAdd={addHazards}
          onClose={() => setPicker(false)}
        />
      )}

      <div className="sticky top-[3.6rem] z-30 -mx-1 flex flex-wrap items-center gap-2 border-b border-[color:var(--line)] bg-paper/95 px-1 py-2 backdrop-blur">
        <nav className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-[2px] px-3 py-1.5 text-[0.8rem] font-semibold transition-colors ${
                tab === t.id ? 'bg-ink text-paper' : 'text-muted hover:bg-paper-2 hover:text-ink'
              }`}
            >
              {t.label}
              {t.id === 'hazards' && (
                <span className="mono ml-1.5 text-[0.7rem] opacity-70">
                  {content.hazards.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span
            className="mono rounded-[2px] px-2 py-1 text-[0.72rem] font-bold"
            style={{ background: residual.bg, color: residual.fg }}
            title={`Highest residual risk: ${residual.action}`}
          >
            Residual {residual.score}
          </span>
          {!readOnly && (
            <>
              <span className="mono text-[0.72rem] text-muted">
                {saving ? 'Saving…' : dirty ? 'Unsaved' : savedAt ? `Saved ${savedAt}` : 'Saved'}
              </span>
              <Button type="button" variant="solar" size="sm" onClick={save} disabled={saving}>
                Save
              </Button>
            </>
          )}
        </div>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}
      {readOnly && (
        <Alert tone="neutral">
          This document is {doc.status === 'archived' ? 'archived' : 'issued'} and is a controlled
          record, so it cannot be edited. Create a new version to make changes.
        </Alert>
      )}

      <fieldset disabled={readOnly} className="space-y-5">
        {tab === 'scope' && (
          <Card className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Document title" required className="sm:col-span-2">
                <Input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setDirty(true);
                  }}
                />
              </Field>
              <Field label="Review date" hint="When this document must be reassessed.">
                <Input
                  type="date"
                  value={reviewDate}
                  onChange={(e) => {
                    setReviewDate(e.target.value);
                    setDirty(true);
                  }}
                />
              </Field>
              <Field label="Duration and working hours">
                <Input
                  value={content.duration}
                  onChange={(e) => patch({ duration: e.target.value })}
                  placeholder="3 days, 08:00–17:00 Mon–Fri"
                />
              </Field>
            </div>

            <Field label="Scope of works" required hint="What this document covers, in plain terms.">
              <Textarea
                rows={5}
                value={content.scopeOfWorks}
                onChange={(e) => patch({ scopeOfWorks: e.target.value })}
                placeholder="Supply and installation of a 8.2 kWp roof-mounted solar PV array comprising 20 x 410 W modules on the south-facing pitch, a 6 kW hybrid inverter in the garage, and all associated DC and AC works…"
              />
            </Field>

            <Field label="Work areas" hint="Which parts of the site the works affect.">
              <Textarea
                rows={3}
                value={content.workAreas}
                onChange={(e) => patch({ workAreas: e.target.value })}
                placeholder="South-facing rear roof pitch, loft void, garage (inverter position), meter cupboard, driveway (scaffold and unloading)."
              />
            </Field>

            <Field label="Personnel" hint="Team size and make-up for these works.">
              <Textarea
                rows={2}
                value={content.personnel}
                onChange={(e) => patch({ personnel: e.target.value })}
                placeholder="1 x site supervisor, 1 x qualified electrician, 2 x installers. Scaffold erected by an approved subcontractor."
              />
            </Field>

            <Field label="Competence statement">
              <Textarea
                rows={6}
                value={content.competence}
                onChange={(e) => patch({ competence: e.target.value })}
              />
            </Field>

            <Field
              label="Site-specific notes"
              hint="Anything about this site that the template does not cover."
            >
              <Textarea
                rows={4}
                value={content.siteSpecificNotes}
                onChange={(e) => patch({ siteSpecificNotes: e.target.value })}
              />
            </Field>
          </Card>
        )}

        {tab === 'hazards' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[0.86rem] text-muted">
                {content.hazards.length} hazard{content.hazards.length === 1 ? '' : 's'}. Initial
                score assumes no controls; residual is the score once the listed controls are in
                place.
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setPicker(true)}>
                  Browse library
                </Button>
                <Button
                  type="button"
                  variant="solar"
                  size="sm"
                  onClick={() =>
                    patch({
                      hazards: [
                        ...content.hazards,
                        {
                          id: uid('hz'),
                          libraryId: null,
                          hazard: '',
                          whoIsAtRisk: ['Operatives'],
                          initialLikelihood: 3,
                          initialSeverity: 3,
                          controls: [''],
                          residualLikelihood: 1,
                          residualSeverity: 2,
                        },
                      ],
                    })
                  }
                >
                  + Custom hazard
                </Button>
              </div>
            </div>

            {content.hazards.length === 0 && (
              <Card className="px-6 py-10 text-center">
                <p className="font-extrabold">No hazards yet</p>
                <p className="mx-auto mt-1.5 max-w-md text-[0.86rem] text-muted">
                  Add from the library for this technology, or write your own.
                </p>
                <Button
                  type="button"
                  variant="solar"
                  size="sm"
                  className="mt-4"
                  onClick={() => setPicker(true)}
                >
                  Browse library
                </Button>
              </Card>
            )}

            {content.hazards.map((h, index) => {
              const initial = riskScore(h.initialLikelihood, h.initialSeverity);
              const band = riskBand(
                riskScore(h.residualLikelihood, h.residualSeverity),
                h.residualSeverity
              );
              return (
                <Card key={h.id} className="p-4">
                  <div className="mb-3 flex items-start gap-3">
                    <span className="mono mt-2 shrink-0 text-[0.68rem] text-muted">
                      H/{String(index + 1).padStart(2, '0')}
                    </span>
                    <Textarea
                      rows={2}
                      className="font-semibold"
                      value={h.hazard}
                      placeholder="Describe the hazard"
                      onChange={(e) => updateHazard(h.id, { hazard: e.target.value })}
                    />
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span
                        className="mono rounded-[2px] px-2 py-1 text-[0.72rem] font-bold"
                        style={{ background: band.bg, color: band.fg }}
                      >
                        {initial} → {riskScore(h.residualLikelihood, h.residualSeverity)}
                      </span>
                      <button
                        type="button"
                        className="text-[0.72rem] text-muted hover:text-danger"
                        onClick={() =>
                          patch({ hazards: content.hazards.filter((x) => x.id !== h.id) })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="mono mb-1.5 text-[0.62rem] uppercase tracking-[0.1em] text-muted">
                      Who is at risk
                    </div>
                    <ChipSelect
                      options={WHO_OPTIONS}
                      selected={h.whoIsAtRisk}
                      onChange={(whoIsAtRisk) => updateHazard(h.id, { whoIsAtRisk })}
                    />
                  </div>

                  <div className="mb-3 grid gap-3 sm:grid-cols-2">
                    <RiskSelect
                      label="Initial risk (no controls)"
                      likelihood={h.initialLikelihood}
                      severity={h.initialSeverity}
                      disabled={readOnly}
                      onChange={({ likelihood, severity }) =>
                        updateHazard(h.id, {
                          initialLikelihood: likelihood,
                          initialSeverity: severity,
                        })
                      }
                    />
                    <RiskSelect
                      label="Residual risk (with controls)"
                      likelihood={h.residualLikelihood}
                      severity={h.residualSeverity}
                      disabled={readOnly}
                      onChange={({ likelihood, severity }) =>
                        updateHazard(h.id, {
                          residualLikelihood: likelihood,
                          residualSeverity: severity,
                        })
                      }
                    />
                  </div>

                  <div className="mono mb-1.5 text-[0.62rem] uppercase tracking-[0.1em] text-muted">
                    Control measures
                  </div>
                  <ListEditor
                    items={h.controls}
                    onChange={(controls) => updateHazard(h.id, { controls })}
                    addLabel="control"
                    placeholder="State the control precisely — what is done, by whom, and to what standard."
                  />
                </Card>
              );
            })}
          </div>
        )}

        {tab === 'method' && (
          <div className="space-y-4">
            <p className="text-[0.86rem] text-muted">
              The safe sequence of work. Hold points require a signature before the job continues.
            </p>

            {content.sequence.map((step, i) => (
              <Card key={step.id} className="p-4">
                <div className="mb-3 flex items-start gap-3">
                  <span className="mono mt-2.5 shrink-0 text-[0.68rem] text-muted">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <Input
                    className="font-semibold"
                    value={step.title}
                    placeholder="Step title"
                    onChange={(e) =>
                      patch({
                        sequence: content.sequence.map((s) =>
                          s.id === step.id ? { ...s, title: e.target.value } : s
                        ),
                      })
                    }
                  />
                  <div className="flex shrink-0 gap-0.5">
                    <button
                      type="button"
                      aria-label="Move up"
                      disabled={i === 0}
                      className="rounded-[2px] px-1.5 py-1 text-[0.7rem] text-muted hover:bg-paper-2 disabled:opacity-30"
                      onClick={() => {
                        const next = [...content.sequence];
                        [next[i - 1], next[i]] = [next[i], next[i - 1]];
                        patch({ sequence: next });
                      }}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      aria-label="Move down"
                      disabled={i === content.sequence.length - 1}
                      className="rounded-[2px] px-1.5 py-1 text-[0.7rem] text-muted hover:bg-paper-2 disabled:opacity-30"
                      onClick={() => {
                        const next = [...content.sequence];
                        [next[i], next[i + 1]] = [next[i + 1], next[i]];
                        patch({ sequence: next });
                      }}
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      className="rounded-[2px] px-1.5 py-1 text-[0.72rem] text-muted hover:text-danger"
                      onClick={() =>
                        patch({ sequence: content.sequence.filter((s) => s.id !== step.id) })
                      }
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <Textarea
                  rows={4}
                  value={step.detail}
                  placeholder="What happens at this step, in enough detail that an operative could follow it."
                  onChange={(e) =>
                    patch({
                      sequence: content.sequence.map((s) =>
                        s.id === step.id ? { ...s, detail: e.target.value } : s
                      ),
                    })
                  }
                />

                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <label className="flex flex-1 items-center gap-2 text-[0.78rem]">
                    <span className="mono shrink-0 text-[0.62rem] uppercase tracking-[0.1em] text-muted">
                      Responsible
                    </span>
                    <Input
                      className="py-1 text-[0.8rem]"
                      value={step.responsible ?? ''}
                      placeholder="Site supervisor"
                      onChange={(e) =>
                        patch({
                          sequence: content.sequence.map((s) =>
                            s.id === step.id ? { ...s, responsible: e.target.value } : s
                          ),
                        })
                      }
                    />
                  </label>
                  <label className="flex items-center gap-2 text-[0.8rem]">
                    <input
                      type="checkbox"
                      className="accent-[#C77F04]"
                      checked={!!step.holdPoint}
                      onChange={(e) =>
                        patch({
                          sequence: content.sequence.map((s) =>
                            s.id === step.id ? { ...s, holdPoint: e.target.checked } : s
                          ),
                        })
                      }
                    />
                    Hold point
                  </label>
                </div>
              </Card>
            ))}

            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                patch({
                  sequence: [...content.sequence, { id: uid('st'), title: '', detail: '' }],
                })
              }
            >
              + Add step
            </Button>
          </div>
        )}

        {tab === 'resources' && (
          <div className="space-y-5">
            <Card className="p-5">
              <h3 className="mb-3 text-[0.95rem] font-extrabold">PPE required</h3>
              <ChipSelect
                options={PPE_OPTIONS}
                selected={content.ppe}
                onChange={(ppe) => patch({ ppe })}
              />
            </Card>

            <Card className="p-5">
              <h3 className="mb-3 text-[0.95rem] font-extrabold">Permits required</h3>
              <ChipSelect
                options={PERMIT_OPTIONS}
                selected={content.permits}
                onChange={(permits) => patch({ permits })}
              />
            </Card>

            <Card className="p-5">
              <h3 className="mb-3 text-[0.95rem] font-extrabold">Plant &amp; equipment</h3>
              <div className="space-y-2">
                {content.plant.map((p) => (
                  <div key={p.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <Input
                      value={p.name}
                      placeholder="Item"
                      onChange={(e) =>
                        patch({
                          plant: content.plant.map((x) =>
                            x.id === p.id ? { ...x, name: e.target.value } : x
                          ),
                        })
                      }
                    />
                    <Input
                      value={p.inspection ?? ''}
                      placeholder="Inspection / certification requirement"
                      onChange={(e) =>
                        patch({
                          plant: content.plant.map((x) =>
                            x.id === p.id ? { ...x, inspection: e.target.value } : x
                          ),
                        })
                      }
                    />
                    <button
                      type="button"
                      className="px-2 text-[0.75rem] text-muted hover:text-danger"
                      onClick={() => patch({ plant: content.plant.filter((x) => x.id !== p.id) })}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-3"
                onClick={() => patch({ plant: [...content.plant, { id: uid('pl'), name: '' }] })}
              >
                + Add item
              </Button>
            </Card>

            <Card className="p-5">
              <h3 className="mb-1 text-[0.95rem] font-extrabold">COSHH substances</h3>
              <p className="mb-3 text-[0.82rem] text-muted">
                A safety data sheet must be held on site for every substance listed here.
              </p>
              <div className="space-y-3">
                {content.coshh.map((c) => (
                  <div key={c.id} className="rounded-[2px] border border-[color:var(--line)] p-3">
                    <div className="mb-2 flex items-start gap-2">
                      <Input
                        className="font-semibold"
                        value={c.substance}
                        placeholder="Substance"
                        onChange={(e) =>
                          patch({
                            coshh: content.coshh.map((x) =>
                              x.id === c.id ? { ...x, substance: e.target.value } : x
                            ),
                          })
                        }
                      />
                      <button
                        type="button"
                        className="shrink-0 px-1 text-[0.75rem] text-muted hover:text-danger"
                        onClick={() => patch({ coshh: content.coshh.filter((x) => x.id !== c.id) })}
                      >
                        ✕
                      </button>
                    </div>
                    <div className="grid gap-2">
                      <Textarea
                        rows={2}
                        value={c.hazard}
                        placeholder="Hazard"
                        onChange={(e) =>
                          patch({
                            coshh: content.coshh.map((x) =>
                              x.id === c.id ? { ...x, hazard: e.target.value } : x
                            ),
                          })
                        }
                      />
                      <Textarea
                        rows={3}
                        value={c.controls}
                        placeholder="Controls"
                        onChange={(e) =>
                          patch({
                            coshh: content.coshh.map((x) =>
                              x.id === c.id ? { ...x, controls: e.target.value } : x
                            ),
                          })
                        }
                      />
                      <Input
                        value={c.sdsLocation ?? ''}
                        placeholder="Where the safety data sheet is held"
                        onChange={(e) =>
                          patch({
                            coshh: content.coshh.map((x) =>
                              x.id === c.id ? { ...x, sdsLocation: e.target.value } : x
                            ),
                          })
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-3"
                onClick={() =>
                  patch({
                    coshh: [
                      ...content.coshh,
                      { id: uid('co'), substance: '', hazard: '', controls: '' },
                    ],
                  })
                }
              >
                + Add substance
              </Button>
            </Card>

            <Card className="p-5">
              <h3 className="mb-3 text-[0.95rem] font-extrabold">Legislation &amp; guidance</h3>
              <ListEditor
                items={content.legislation}
                onChange={(legislation) => patch({ legislation })}
                addLabel="reference"
                rows={1}
              />
            </Card>
          </div>
        )}

        {tab === 'emergency' && (
          <Card className="space-y-4 p-5">
            <Field label="Welfare arrangements">
              <Textarea
                rows={5}
                value={content.welfare}
                onChange={(e) => patch({ welfare: e.target.value })}
              />
            </Field>
            <Field label="First aid">
              <Textarea
                rows={5}
                value={content.firstAid}
                onChange={(e) => patch({ firstAid: e.target.value })}
              />
            </Field>
            <Field label="Emergency procedure">
              <Textarea
                rows={6}
                value={content.emergencyProcedure}
                onChange={(e) => patch({ emergencyProcedure: e.target.value })}
              />
            </Field>
            <Field
              label="Working at height rescue plan"
              hint="Mandatory wherever a fall-arrest system is used."
            >
              <Textarea
                rows={7}
                value={content.rescuePlan}
                onChange={(e) => patch({ rescuePlan: e.target.value })}
              />
            </Field>
            <Field label="Environmental controls">
              <Textarea
                rows={5}
                value={content.environmental}
                onChange={(e) => patch({ environmental: e.target.value })}
              />
            </Field>
            <Field label="Monitoring &amp; review">
              <Textarea
                rows={6}
                value={content.monitoring}
                onChange={(e) => patch({ monitoring: e.target.value })}
              />
            </Field>
          </Card>
        )}

        {tab === 'people' && (
          <div className="space-y-5">
            <Card className="p-5">
              <h3 className="mb-1 text-[0.95rem] font-extrabold">Operatives</h3>
              <p className="mb-3 text-[0.82rem] text-muted">
                Named on the document and listed on the briefing record.
              </p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {staff.map((p) => {
                  const on = content.operativeIds.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-[2px] border px-3 py-2 text-[0.83rem] ${
                        on
                          ? 'border-amber-2 bg-solar/15'
                          : 'border-[color:var(--line)] hover:border-[color:var(--line-strong)]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="accent-[#C77F04]"
                        checked={on}
                        onChange={() =>
                          patch({
                            operativeIds: on
                              ? content.operativeIds.filter((x) => x !== p.id)
                              : [...content.operativeIds, p.id],
                          })
                        }
                      />
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-semibold">{p.full_name || p.email}</span>
                        {p.job_title && (
                          <span className="text-muted"> · {p.job_title}</span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </Card>

            <Card className="p-5">
              <h3 className="mb-1 text-[0.95rem] font-extrabold">Subcontractors &amp; visitors</h3>
              <p className="mb-3 text-[0.82rem] text-muted">
                People working under this document who do not have an account.
              </p>
              <div className="space-y-2">
                {content.externalOperatives.map((o) => (
                  <div key={o.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                    <Input
                      value={o.name}
                      placeholder="Name"
                      onChange={(e) =>
                        patch({
                          externalOperatives: content.externalOperatives.map((x) =>
                            x.id === o.id ? { ...x, name: e.target.value } : x
                          ),
                        })
                      }
                    />
                    <Input
                      value={o.role}
                      placeholder="Role"
                      onChange={(e) =>
                        patch({
                          externalOperatives: content.externalOperatives.map((x) =>
                            x.id === o.id ? { ...x, role: e.target.value } : x
                          ),
                        })
                      }
                    />
                    <Input
                      value={o.company}
                      placeholder="Company"
                      onChange={(e) =>
                        patch({
                          externalOperatives: content.externalOperatives.map((x) =>
                            x.id === o.id ? { ...x, company: e.target.value } : x
                          ),
                        })
                      }
                    />
                    <button
                      type="button"
                      className="px-2 text-[0.75rem] text-muted hover:text-danger"
                      onClick={() =>
                        patch({
                          externalOperatives: content.externalOperatives.filter(
                            (x) => x.id !== o.id
                          ),
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-3"
                onClick={() =>
                  patch({
                    externalOperatives: [
                      ...content.externalOperatives,
                      { id: uid('ex'), name: '', role: '', company: '' },
                    ],
                  })
                }
              >
                + Add person
              </Button>
            </Card>

            <Card className="p-5">
              <h3 className="mb-1 text-[0.95rem] font-extrabold">Attached certificates</h3>
              <p className="mb-3 text-[0.82rem] text-muted">
                Attached certificates are listed in the document appendix. Expired certificates are
                flagged — do not issue a document that relies on one.
              </p>

              <CertificatePicker
                certifications={certifications}
                selected={content.attachedCertificationIds}
                onChange={(attachedCertificationIds) => patch({ attachedCertificationIds })}
              />
            </Card>
          </div>
        )}
      </fieldset>
    </div>
  );
}

function CertificatePicker({
  certifications,
  selected,
  onChange,
}: {
  certifications: Certification[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const groups = useMemo(() => {
    const company = certifications.filter((c) => c.owner_type === 'company');
    const byHolder = new Map<string, Certification[]>();
    for (const c of certifications.filter((c) => c.owner_type === 'user')) {
      const key = c.holder_name || 'Unassigned';
      byHolder.set(key, [...(byHolder.get(key) ?? []), c]);
    }
    return { company, byHolder: [...byHolder.entries()] };
  }, [certifications]);

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  function row(c: Certification) {
    const state = expiryState(c.expiry_date);
    const on = selected.includes(c.id);
    return (
      <label
        key={c.id}
        className={`flex cursor-pointer items-center gap-2.5 rounded-[2px] border px-3 py-2 text-[0.83rem] ${
          on ? 'border-amber-2 bg-solar/15' : 'border-[color:var(--line)] hover:border-[color:var(--line-strong)]'
        }`}
      >
        <input
          type="checkbox"
          className="accent-[#C77F04]"
          checked={on}
          onChange={() => toggle(c.id)}
        />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-semibold">{c.title}</span>
          {c.issuing_body && <span className="text-muted"> · {c.issuing_body}</span>}
        </span>
        {state === 'expired' && <Badge tone="danger">Expired</Badge>}
        {state === 'expiring' && <Badge tone="warn">Expiring</Badge>}
        {!c.file_path && <Badge tone="neutral">No PDF</Badge>}
      </label>
    );
  }

  if (certifications.length === 0) {
    return (
      <p className="text-[0.85rem] text-muted">
        No certificates recorded yet. Add them under Certifications.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {groups.company.length > 0 && (
        <div>
          <h4 className="mono mb-1.5 text-[0.64rem] uppercase tracking-[0.12em] text-amber-2">
            Company
          </h4>
          <div className="grid gap-1.5 sm:grid-cols-2">{groups.company.map(row)}</div>
        </div>
      )}
      {groups.byHolder.map(([holder, certs]) => (
        <div key={holder}>
          <h4 className="mono mb-1.5 text-[0.64rem] uppercase tracking-[0.12em] text-amber-2">
            {holder}
          </h4>
          <div className="grid gap-1.5 sm:grid-cols-2">{certs.map(row)}</div>
        </div>
      ))}
    </div>
  );
}
