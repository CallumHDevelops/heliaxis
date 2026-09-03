import { Spark } from '@/components/brand/Spark';
import { expiryState } from '@/lib/content/certifications';
import { technology as techDef, sectorName } from '@/lib/content/technologies';
import { formatDate } from '@/lib/format';
import { likelihoodLabel, overallResidual, riskBand, riskMatrix, riskScore, severityLabel } from '@/lib/risk';
import type {
  Briefing,
  Certification,
  CompanySettings,
  Profile,
  Project,
  RamsDocument,
} from '@/lib/types';

export type ReportData = {
  doc: RamsDocument;
  project: Project | null;
  company: CompanySettings | null;
  certifications: Certification[];
  operatives: Profile[];
  briefings: Briefing[];
  author: Profile | null;
  approver: Profile | null;
};

const GOLD = '#F8BC1E';
const INK = '#211F18';

/**
 * The document itself. Rendered at A4 width on screen and printed straight to
 * PDF by the browser, so one component serves the on-screen preview, the print
 * route and the public share page.
 */
export function RamsReport({ data, watermark }: { data: ReportData; watermark?: string }) {
  const { doc, project, company, certifications, operatives, briefings, author, approver } = data;
  const c = doc.content;
  const residual = overallResidual(c.hazards);
  const tech = techDef(doc.technology);

  return (
    <article className="report mx-auto w-full max-w-[210mm] bg-white p-[14mm] print:p-0">
      {watermark && (
        <div
          className="mb-4 border px-3 py-2 text-center text-[8pt] font-bold uppercase tracking-[0.16em]"
          style={{ borderColor: '#E0AFAF', background: '#F4D2D2', color: '#7A1F1F' }}
        >
          {watermark}
        </div>
      )}

      {/* ---------------- Cover ---------------- */}
      <section className="report-page">
        <header
          className="flex items-start justify-between gap-6 px-5 py-5"
          style={{ background: INK, color: '#F7F2E7' }}
        >
          <div>
            <div
              className="mb-2 flex items-center gap-2 text-[7.5pt] font-semibold uppercase tracking-[0.16em]"
              style={{ color: GOLD, fontFamily: 'var(--font-mono)' }}
            >
              <Spark size={11} />
              Risk Assessment &amp; Method Statement
            </div>
            <h1 className="text-[19pt] font-black leading-tight">{doc.title}</h1>
            <p className="mt-1.5 text-[9pt]" style={{ color: '#A69F8E' }}>
              {tech.name} · {sectorName(doc.sector)}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div
              className="text-[16pt] font-black leading-none tracking-[0.06em]"
              style={{ color: '#F7F2E7', whiteSpace: 'nowrap' }}
            >
              HEL
              <Spark size={13} />
              AXIS
            </div>
            <div className="mt-1.5 text-[7.5pt]" style={{ color: '#A69F8E' }}>
              {company?.name ?? 'Heliaxis Ltd'}
            </div>
          </div>
        </header>

        <div className="grid grid-cols-4 border border-t-0" style={{ borderColor: '#C9C3B4' }}>
          <CoverCell label="Document ref" value={`${doc.reference}`} />
          <CoverCell label="Version" value={`v${doc.version}`} />
          <CoverCell label="Status" value={doc.status.replace('_', ' ')} />
          <CoverCell label="Review by" value={formatDate(doc.review_date)} last />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-5">
          <Block title="Project">
            <Row label="Project" value={project?.name} />
            <Row label="Project ref" value={project?.reference} />
            <Row label="Client" value={project?.client_name} />
            <Row label="Sector" value={sectorName(doc.sector)} />
            <Row label="Start" value={formatDate(project?.start_date)} />
            <Row label="Duration" value={c.duration} />
          </Block>

          <Block title="Site">
            <Row label="Address" value={project?.site_address} />
            <Row label="Postcode" value={project?.site_postcode} />
            <Row label="what3words" value={project?.what3words} />
            <Row label="Site contact" value={project?.site_contact} />
            <Row label="Site phone" value={project?.site_contact_phone} />
            <Row label="Nearest A&E" value={project?.nearest_hospital} />
          </Block>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-5">
          <Block title="Prepared by">
            <Row label="Author" value={author?.full_name ?? author?.email} />
            <Row label="Position" value={author?.job_title} />
            <Row label="Date" value={formatDate(doc.created_at)} />
          </Block>
          <Block title="Approved by">
            <Row label="Approver" value={approver?.full_name ?? approver?.email} />
            <Row label="Position" value={approver?.job_title} />
            <Row label="Date" value={formatDate(doc.approved_at)} />
          </Block>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-5">
          <Block title="CDM 2015">
            <Row label="Principal contractor" value={project?.principal_contractor} />
            <Row label="Principal designer" value={project?.principal_designer} />
            <Row label="Notifiable" value={project?.cdm_notifiable ? 'Yes' : 'No'} />
            <Row label="F10 reference" value={project?.f10_reference} />
          </Block>
          <Block title="Highest residual risk">
            <div
              className="mt-1 inline-block px-3 py-1.5 text-[11pt] font-black"
              style={{ background: residual.bg, color: residual.fg }}
            >
              {residual.label.toUpperCase()} · {residual.score}
            </div>
            <p className="mt-2 text-[8pt]" style={{ color: '#55524A' }}>
              {residual.action}
            </p>
            <p className="mt-2 text-[8pt]" style={{ color: '#55524A' }}>
              {c.hazards.length} hazards assessed across {c.sequence.length} method steps.
            </p>
          </Block>
        </div>

        {company && (
          <div className="mt-5 border-t pt-3 text-[7.5pt]" style={{ borderColor: '#C9C3B4', color: '#55524A' }}>
            {[
              company.name,
              company.address,
              company.postcode,
              company.phone,
              company.email,
              company.registration_number && `Reg. ${company.registration_number}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        )}
      </section>

      {/* ---------------- Scope ---------------- */}
      <section className="report-page pt-6">
        <SectionTitle index="01">Scope of works</SectionTitle>
        <Prose text={c.scopeOfWorks} />

        {c.workAreas && (
          <>
            <SubTitle>Work areas</SubTitle>
            <Prose text={c.workAreas} />
          </>
        )}
        {c.personnel && (
          <>
            <SubTitle>Personnel</SubTitle>
            <Prose text={c.personnel} />
          </>
        )}
        {c.siteSpecificNotes && (
          <>
            <SubTitle>Site-specific notes</SubTitle>
            <Prose text={c.siteSpecificNotes} />
          </>
        )}
        {project?.access_notes && (
          <>
            <SubTitle>Access</SubTitle>
            <Prose text={project.access_notes} />
          </>
        )}

        <SectionTitle index="02">Competence</SectionTitle>
        <Prose text={c.competence} />

        {(operatives.length > 0 || c.externalOperatives.length > 0) && (
          <>
            <SubTitle>Named operatives</SubTitle>
            <table className="avoid-break">
              <thead>
                <tr>
                  <th style={{ width: '38%' }}>Name</th>
                  <th style={{ width: '34%' }}>Role</th>
                  <th>Company</th>
                </tr>
              </thead>
              <tbody>
                {operatives.map((o) => (
                  <tr key={o.id}>
                    <td>{o.full_name || o.email}</td>
                    <td>{o.job_title || '—'}</td>
                    <td>{company?.name ?? 'Heliaxis Ltd'}</td>
                  </tr>
                ))}
                {c.externalOperatives.map((o) => (
                  <tr key={o.id}>
                    <td>{o.name || '—'}</td>
                    <td>{o.role || '—'}</td>
                    <td>{o.company || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      {/* ---------------- Risk assessment ---------------- */}
      <section className="report-page pt-6">
        <SectionTitle index="03">Risk assessment</SectionTitle>

        <RiskMatrixKey />

        <table className="mt-4">
          <thead>
            <tr>
              <th style={{ width: '4%' }}>#</th>
              <th style={{ width: '22%' }}>Hazard</th>
              <th style={{ width: '12%' }}>Who is at risk</th>
              <th style={{ width: '7%' }}>Initial</th>
              <th>Control measures</th>
              <th style={{ width: '7%' }}>Residual</th>
            </tr>
          </thead>
          <tbody>
            {c.hazards.map((h, i) => {
              const initial = riskScore(h.initialLikelihood, h.initialSeverity);
              const initialBand = riskBand(initial, h.initialSeverity);
              const res = riskScore(h.residualLikelihood, h.residualSeverity);
              const resBand = riskBand(res, h.residualSeverity);
              return (
                <tr key={h.id} className="avoid-break">
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{String(i + 1).padStart(2, '0')}</td>
                  <td style={{ fontWeight: 600 }}>{h.hazard}</td>
                  <td style={{ fontSize: '8pt' }}>{h.whoIsAtRisk.join(', ')}</td>
                  <td style={{ textAlign: 'center', background: initialBand.bg, color: initialBand.fg, fontWeight: 700 }}>
                    {initial}
                    <div style={{ fontSize: '6.5pt', fontWeight: 500 }}>
                      L{h.initialLikelihood} S{h.initialSeverity}
                    </div>
                  </td>
                  <td>
                    <ul style={{ margin: 0, paddingLeft: '1em' }}>
                      {h.controls.filter(Boolean).map((ctl, ci) => (
                        <li key={ci} style={{ marginBottom: '2px' }}>
                          {ctl}
                        </li>
                      ))}
                    </ul>
                    {h.additionalControls && (
                      <p style={{ marginTop: '4px', fontStyle: 'italic' }}>{h.additionalControls}</p>
                    )}
                  </td>
                  <td style={{ textAlign: 'center', background: resBand.bg, color: resBand.fg, fontWeight: 700 }}>
                    {res}
                    <div style={{ fontSize: '6.5pt', fontWeight: 500 }}>
                      L{h.residualLikelihood} S{h.residualSeverity}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* ---------------- Method statement ---------------- */}
      <section className="report-page pt-6">
        <SectionTitle index="04">Method statement</SectionTitle>
        <p className="mb-3 text-[8.5pt]" style={{ color: '#55524A' }}>
          The sequence below must be followed in order. Steps marked{' '}
          <strong>HOLD POINT</strong> require sign-off before work continues.
        </p>

        <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {c.sequence.map((s, i) => (
            <li
              key={s.id}
              className="avoid-break mb-3 border-l-2 pl-3"
              style={{ borderColor: s.holdPoint ? GOLD : '#C9C3B4' }}
            >
              <div className="flex items-baseline gap-2">
                <span
                  className="text-[8pt] font-bold"
                  style={{ fontFamily: 'var(--font-mono)', color: '#C77F04' }}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="text-[10pt] font-bold">{s.title}</h3>
                {s.holdPoint && (
                  <span
                    className="px-1.5 py-0.5 text-[6.5pt] font-bold uppercase tracking-[0.1em]"
                    style={{ background: GOLD, color: INK }}
                  >
                    Hold point
                  </span>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[9pt]">{s.detail}</p>
              {s.responsible && (
                <p className="mt-1 text-[8pt]" style={{ color: '#55524A' }}>
                  <strong>Responsible:</strong> {s.responsible}
                </p>
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* ---------------- Resources ---------------- */}
      <section className="report-page pt-6">
        <SectionTitle index="05">PPE, plant and substances</SectionTitle>

        <SubTitle>Personal protective equipment</SubTitle>
        <ul className="columns-2 gap-6 text-[9pt]" style={{ margin: 0, paddingLeft: '1.1em' }}>
          {c.ppe.map((p) => (
            <li key={p} style={{ breakInside: 'avoid' }}>
              {p}
            </li>
          ))}
        </ul>

        {c.permits.length > 0 && (
          <>
            <SubTitle>Permits required</SubTitle>
            <ul className="text-[9pt]" style={{ margin: 0, paddingLeft: '1.1em' }}>
              {c.permits.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </>
        )}

        <SubTitle>Plant &amp; equipment</SubTitle>
        <table>
          <thead>
            <tr>
              <th style={{ width: '45%' }}>Item</th>
              <th>Inspection / certification requirement</th>
            </tr>
          </thead>
          <tbody>
            {c.plant.filter((p) => p.name).map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.inspection || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <SubTitle>COSHH — hazardous substances</SubTitle>
        <table>
          <thead>
            <tr>
              <th style={{ width: '20%' }}>Substance</th>
              <th style={{ width: '26%' }}>Hazard</th>
              <th>Controls</th>
              <th style={{ width: '18%' }}>SDS held</th>
            </tr>
          </thead>
          <tbody>
            {c.coshh.filter((s) => s.substance).map((s) => (
              <tr key={s.id} className="avoid-break">
                <td style={{ fontWeight: 600 }}>{s.substance}</td>
                <td>{s.hazard}</td>
                <td>{s.controls}</td>
                <td>{s.sdsLocation || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ---------------- Welfare & emergency ---------------- */}
      <section className="report-page pt-6">
        <SectionTitle index="06">Welfare, first aid and emergency</SectionTitle>
        <SubTitle>Welfare</SubTitle>
        <Prose text={c.welfare} />
        <SubTitle>First aid</SubTitle>
        <Prose text={c.firstAid} />
        <SubTitle>Emergency procedure</SubTitle>
        <Prose text={c.emergencyProcedure} />
        <SubTitle>Working at height rescue plan</SubTitle>
        <Prose text={c.rescuePlan} />

        <SectionTitle index="07">Environmental controls</SectionTitle>
        <Prose text={c.environmental} />

        <SectionTitle index="08">Monitoring and review</SectionTitle>
        <Prose text={c.monitoring} />

        <SectionTitle index="09">Legislation and guidance</SectionTitle>
        <ul className="columns-2 gap-6 text-[8.5pt]" style={{ margin: 0, paddingLeft: '1.1em' }}>
          {c.legislation.map((l) => (
            <li key={l} style={{ breakInside: 'avoid' }}>
              {l}
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------- Certificates ---------------- */}
      {certifications.length > 0 && (
        <section className="report-page pt-6">
          <SectionTitle index="10">Appendix A — competence and accreditation</SectionTitle>
          <table>
            <thead>
              <tr>
                <th style={{ width: '22%' }}>Holder</th>
                <th style={{ width: '28%' }}>Certificate</th>
                <th style={{ width: '18%' }}>Issuing body</th>
                <th style={{ width: '14%' }}>Reference</th>
                <th style={{ width: '9%' }}>Issued</th>
                <th style={{ width: '9%' }}>Expires</th>
              </tr>
            </thead>
            <tbody>
              {certifications.map((cert) => {
                const state = expiryState(cert.expiry_date);
                return (
                  <tr key={cert.id}>
                    <td>{cert.owner_type === 'company' ? (company?.name ?? 'Heliaxis Ltd') : cert.holder_name || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{cert.title}</td>
                    <td>{cert.issuing_body || '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '8pt' }}>
                      {cert.reference || '—'}
                    </td>
                    <td>{formatDate(cert.issue_date)}</td>
                    <td
                      style={
                        state === 'expired'
                          ? { background: '#F4D2D2', color: '#7A1F1F', fontWeight: 700 }
                          : state === 'expiring'
                            ? { background: '#FBEBC2', color: '#6B4A05', fontWeight: 700 }
                            : undefined
                      }
                    >
                      {cert.expiry_date ? formatDate(cert.expiry_date) : 'n/a'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[8pt]" style={{ color: '#55524A' }}>
            Copies of the certificates listed above are held by {company?.name ?? 'Heliaxis Ltd'} and
            are available on request.
          </p>
        </section>
      )}

      {/* ---------------- Briefing record ---------------- */}
      <section className="report-page pt-6">
        <SectionTitle index="11">Appendix B — operative briefing record</SectionTitle>
        <p className="mb-3 text-[8.5pt]" style={{ color: '#55524A' }}>
          I confirm that I have been briefed on this Risk Assessment and Method Statement, that I
          understand its contents, and that I will work in accordance with it. I understand that I
          have the authority to stop work if I believe it is unsafe.
        </p>
        <table>
          <thead>
            <tr>
              <th style={{ width: '24%' }}>Name</th>
              <th style={{ width: '18%' }}>Role</th>
              <th style={{ width: '18%' }}>Company</th>
              <th style={{ width: '25%' }}>Signature</th>
              <th style={{ width: '15%' }}>Date</th>
            </tr>
          </thead>
          <tbody>
            {briefings.map((b) => (
              <tr key={b.id}>
                <td>{b.person_name}</td>
                <td>{b.person_role || '—'}</td>
                <td>{b.company || company?.name || '—'}</td>
                <td style={{ height: '26px' }}>{b.signed_at ? 'Signed electronically' : ''}</td>
                <td>{b.signed_at ? formatDate(b.signed_at) : ''}</td>
              </tr>
            ))}
            {/* Blank rows so the printed sheet can be signed on site. */}
            {Array.from({ length: Math.max(4, 12 - briefings.length) }).map((_, i) => (
              <tr key={`blank-${i}`}>
                <td style={{ height: '26px' }} />
                <td />
                <td />
                <td />
                <td />
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 grid grid-cols-2 gap-8 text-[8.5pt]">
          <SignatureBox
            label="Briefed by"
            name={author?.full_name ?? ''}
            role={author?.job_title ?? ''}
          />
          <SignatureBox
            label="Approved by"
            name={approver?.full_name ?? ''}
            role={approver?.job_title ?? ''}
            date={doc.approved_at ? formatDate(doc.approved_at) : ''}
          />
        </div>

        <footer
          className="mt-8 border-t pt-3 text-[7.5pt]"
          style={{ borderColor: '#C9C3B4', color: '#55524A' }}
        >
          {doc.reference} v{doc.version} · {doc.title} · {company?.name ?? 'Heliaxis Ltd'} · Review
          by {formatDate(doc.review_date)} · This is a controlled document. Printed copies are
          uncontrolled unless signed above.
        </footer>
      </section>
    </article>
  );
}

// --- Pieces ----------------------------------------------------------------

function CoverCell({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className="px-3 py-2"
      style={{ borderRight: last ? 'none' : '1px solid #C9C3B4' }}
    >
      <div
        className="text-[6.5pt] uppercase tracking-[0.12em]"
        style={{ fontFamily: 'var(--font-mono)', color: '#55524A' }}
      >
        {label}
      </div>
      <div className="mt-0.5 text-[9.5pt] font-bold capitalize">{value || '—'}</div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border p-3" style={{ borderColor: '#C9C3B4' }}>
      <h3
        className="mb-2 text-[7pt] font-bold uppercase tracking-[0.14em]"
        style={{ fontFamily: 'var(--font-mono)', color: '#C77F04' }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex gap-2 border-b py-1 last:border-0" style={{ borderColor: '#E5DFD1' }}>
      <span className="w-[34%] shrink-0 text-[8pt]" style={{ color: '#55524A' }}>
        {label}
      </span>
      <span className="flex-1 whitespace-pre-wrap text-[8.5pt] font-medium">{value || '—'}</span>
    </div>
  );
}

function SectionTitle({ index, children }: { index: string; children: React.ReactNode }) {
  return (
    <h2 className="mt-5 mb-2 flex items-baseline gap-2 border-b pb-1.5" style={{ borderColor: INK }}>
      <span
        className="text-[7.5pt] font-bold tracking-[0.14em]"
        style={{ fontFamily: 'var(--font-mono)', color: '#C77F04' }}
      >
        {index}
      </span>
      <span className="text-[12pt] font-black">{children}</span>
    </h2>
  );
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-3.5 mb-1.5 text-[9.5pt] font-bold">{children}</h3>;
}

function Prose({ text }: { text?: string | null }) {
  if (!text?.trim()) {
    return (
      <p className="text-[9pt] italic" style={{ color: '#8A8578' }}>
        Not specified.
      </p>
    );
  }
  return <p className="whitespace-pre-wrap text-[9pt]">{text}</p>;
}

function SignatureBox({
  label,
  name,
  role,
  date,
}: {
  label: string;
  name: string;
  role: string;
  date?: string;
}) {
  return (
    <div>
      <div
        className="text-[6.5pt] uppercase tracking-[0.12em]"
        style={{ fontFamily: 'var(--font-mono)', color: '#55524A' }}
      >
        {label}
      </div>
      <div className="mt-6 border-b" style={{ borderColor: INK }} />
      <div className="mt-1 flex justify-between">
        <span className="font-semibold">{name || ' '}</span>
        <span style={{ color: '#55524A' }}>{date || ''}</span>
      </div>
      <div style={{ color: '#55524A' }}>{role}</div>
    </div>
  );
}

function RiskMatrixKey() {
  const matrix = riskMatrix();
  return (
    <div className="avoid-break flex flex-wrap items-start gap-6">
      <div>
        <h3 className="mb-1.5 text-[8pt] font-bold uppercase tracking-[0.1em]">
          5 × 5 risk matrix
        </h3>
        <table style={{ width: 'auto' }}>
          <thead>
            <tr>
              <th style={{ fontSize: '6.5pt' }}>Severity ↓ / Likelihood →</th>
              {matrix[0].cells.map((cell) => (
                <th key={cell.likelihood.value} style={{ fontSize: '6.5pt', textAlign: 'center' }}>
                  {cell.likelihood.value}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...matrix].reverse().map((row) => (
              <tr key={row.severity.value}>
                <td style={{ fontSize: '7pt', whiteSpace: 'nowrap' }}>
                  {row.severity.value} · {row.severity.label}
                </td>
                {row.cells.map((cell) => (
                  <td
                    key={cell.likelihood.value}
                    style={{
                      background: cell.bg,
                      color: cell.fg,
                      textAlign: 'center',
                      fontWeight: 700,
                      width: '26px',
                    }}
                  >
                    {cell.score}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex-1" style={{ minWidth: '190px' }}>
        <h3 className="mb-1.5 text-[8pt] font-bold uppercase tracking-[0.1em]">Action required</h3>
        <table>
          <tbody>
            {(['low', 'medium', 'high', 'critical'] as const).map((band) => {
              const info = riskBand(band === 'low' ? 2 : band === 'medium' ? 6 : band === 'high' ? 12 : 20);
              return (
                <tr key={band}>
                  <td
                    style={{
                      background: info.bg,
                      color: info.fg,
                      fontWeight: 700,
                      width: '58px',
                      textAlign: 'center',
                    }}
                  >
                    {info.label}
                  </td>
                  <td style={{ fontSize: '7.5pt' }}>{info.action}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-1.5 text-[7pt]" style={{ color: '#55524A' }}>
          Likelihood: {[1, 2, 3, 4, 5].map((n) => `${n} ${likelihoodLabel(n)}`).join(' · ')}.
          Severity: {[1, 2, 3, 4, 5].map((n) => `${n} ${severityLabel(n)}`).join(' · ')}.
        </p>
      </div>
    </div>
  );
}
