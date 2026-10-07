import { NTP_SUBTITLE, NTP_TITLE } from '@/lib/subcontractors/ntp-agreement';
import type { NtpRow, NtpSnapshot } from '@/lib/subcontractors/types';
import { BlockView, fmtDate, SigBlock } from './AgreementDocument';
import './agreement.css';

/** The NTP agreement as signed: clauses, Schedule (scope + supervision), signatures, audit. */
export function NtpDocument({
  snapshot: s,
  ntp,
  contentHash,
  showAudit = true,
}: {
  snapshot: NtpSnapshot;
  ntp?: Pick<
    NtpRow,
    | 'sub_name'
    | 'sub_title'
    | 'sub_signature'
    | 'sub_signed_at'
    | 'sub_ip'
    | 'hlx_name'
    | 'hlx_title'
    | 'hlx_signature'
    | 'hlx_signed_at'
    | 'hlx_signed_by'
    | 'valid_from'
    | 'expires_on'
    | 'content_hash'
  > | null;
  contentHash?: string;
  showAudit?: boolean;
}) {
  const sup = s.supervision || {};
  const supRows: [string, string | undefined][] = [
    ['Geographical spread', sup.geography],
    ['Typical installations per month', sup.installsPerMonth],
    ['Typical installation duration', sup.typicalDuration],
    ['Installers to supervise', sup.installersToSupervise],
    ['Other requirements', sup.notes],
  ];

  return (
    <article className="agr">
      <header className="agr-cover">
        <p className="agr-kicker">Heliaxis Limited</p>
        <h1>{NTP_TITLE}</h1>
        <p className="agr-subtitle">{NTP_SUBTITLE}</p>
        <div className="agr-parties">
          <p><strong>BETWEEN</strong> Heliaxis Limited, Company No. {s.heliaxis.companyNumber}, registered in England &amp; Wales (&ldquo;Heliaxis&rdquo;)</p>
          <p><strong>AND</strong> {s.companyName} (&ldquo;the Subcontractor&rdquo;), under Subcontractor Framework Agreement {s.frameworkRef}</p>
          <p><strong>AND</strong> {s.ntpName} (&ldquo;the NTP&rdquo;)</p>
        </div>
        <dl className="agr-meta">
          <div><dt>Agreement reference</dt><dd>{s.ref}</dd></div>
          <div><dt>Term</dt><dd>{ntp?.valid_from ? `${fmtDate(ntp.valid_from)} to ${fmtDate(ntp.expires_on)}` : '12 months from countersignature by Heliaxis'}</dd></div>
          <div><dt>Document version</dt><dd>{s.version}</dd></div>
        </dl>
      </header>

      {s.sections.map((sec) => (
        <section key={sec.num} className="agr-section">
          <h2>{sec.num}. {sec.title}</h2>
          {sec.blocks.map((b, i) => <BlockView key={i} b={b} />)}
        </section>
      ))}

      <section className="agr-section">
        <h2>Schedule — Appointment details</h2>
        <table className="agr-table">
          <tbody>
            <tr><th scope="row">NTP</th><td>{s.ntpName}</td></tr>
            <tr><th scope="row">Subcontractor</th><td>{s.companyName}</td></tr>
            <tr>
              <th scope="row">Technologies</th>
              <td>{s.technologies.map((t) => <div key={t.key}>{t.label} — {t.standard}</div>)}</td>
            </tr>
            <tr><th scope="row">Minimum engagement</th><td>{s.minDaysPerMonth ? `${s.minDaysPerMonth} day(s) per month` : 'As required to meet the supervision requirements'}</td></tr>
            {supRows.map(([k, v]) => (
              <tr key={k}><th scope="row">{k}</th><td>{v || '—'}</td></tr>
            ))}
            <tr><th scope="row">Fee</th><td>{s.fee || 'Framework Agreement rates (Clause 10.1)'}</td></tr>
            <tr><th scope="row">Term</th><td>12 months from countersignature by Heliaxis; renewed annually (Clause 8)</td></tr>
          </tbody>
        </table>
      </section>

      <section className="agr-section agr-signatures">
        <h2>Signatures</h2>
        <p>The NTP agrees that all work undertaken on behalf of Heliaxis Limited as its Nominated Technical Person will be carried out in accordance with this Agreement, and signs for themselves and on behalf of the Subcontractor.</p>
        <div className="agr-sig-grid">
          <SigBlock
            party="For and on behalf of HELIAXIS LIMITED"
            name={ntp?.hlx_name}
            title={ntp?.hlx_title}
            signature={ntp?.hlx_signature}
            date={ntp?.hlx_signed_at}
            pending="Awaiting Heliaxis countersignature"
          />
          <SigBlock
            party={`The NTP, for themselves and on behalf of ${s.companyName.toUpperCase()}`}
            name={ntp?.sub_name}
            title={ntp?.sub_title}
            signature={ntp?.sub_signature}
            date={ntp?.sub_signed_at}
            pending="Awaiting NTP signature"
          />
        </div>
      </section>

      {showAudit && ntp?.sub_signed_at && (
        <section className="agr-section agr-audit">
          <h2>Electronic signature record</h2>
          <dl className="agr-meta">
            <div><dt>NTP signed</dt><dd>{ntp.sub_name} · {fmtDate(ntp.sub_signed_at, true)} · IP {ntp.sub_ip || 'unknown'}</dd></div>
            <div><dt>Heliaxis countersigned</dt><dd>{ntp.hlx_signed_at ? `${ntp.hlx_name} (${ntp.hlx_signed_by}) · ${fmtDate(ntp.hlx_signed_at, true)}` : 'Pending'}</dd></div>
            <div><dt>Document fingerprint</dt><dd className="agr-hash">{ntp.content_hash}</dd></div>
            {contentHash && (
              <div>
                <dt>Integrity check</dt>
                <dd>{contentHash === ntp.content_hash ? '✓ Record matches what was signed' : '⚠ Record has been altered since signing'}</dd>
              </div>
            )}
          </dl>
        </section>
      )}
    </article>
  );
}
