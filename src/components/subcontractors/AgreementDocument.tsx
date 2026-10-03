import { AGREEMENT_SUBTITLE, AGREEMENT_TITLE, type Block } from '@/lib/subcontractors/agreement';
import { CIS_LABEL, ENTITY_LABEL, type AgreementRow, type AgreementSnapshot } from '@/lib/subcontractors/types';
import './agreement.css';

function fmtDate(iso: string | null | undefined, withTime = false) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' } : {}),
    timeZone: 'Europe/London',
  });
}

function Rates({ s }: { s: AgreementSnapshot }) {
  const bespoke = s.rateOption === 'bespoke';
  return (
    <>
      <div className={`agr-rates${bespoke ? ' agr-struck' : ''}`}>
        <p className="agr-rates-title">
          Clause 4.1.1 — Standard default rates {bespoke ? '(does not apply — replaced by Clause 4.1.2)' : '(applies)'}
        </p>
        <p>Where no specific rate is agreed in a Work Order, the following standard default rates shall apply:</p>
        <table className="agr-table">
          <thead>
            <tr><th>Trade</th><th>Default rate</th><th>Basis</th></tr>
          </thead>
          <tbody>
            {s.defaultRates.map((r) => (
              <tr key={r.trade}><td>{r.trade}</td><td>{r.rate}</td><td>{r.basis}</td></tr>
            ))}
          </tbody>
        </table>
        <p>Rates above are exclusive of VAT. Where work is paid on a day-rate basis, a Working Day is eight (8) hours of productive work excluding lunch break.</p>
      </div>
      {bespoke && (
        <div className="agr-rates">
          <p className="agr-rates-title">Clause 4.1.2 — Agreed bespoke rate for this Subcontractor (applies)</p>
          <p>
            The parties agree that the default rates in Clause 4.1.1 shall not apply to this Subcontractor. Instead, the
            following agreed rate(s) shall apply to all engagements unless a different rate is expressly stated in a Work
            Order:
          </p>
          <table className="agr-table">
            <thead>
              <tr><th>Trade / description</th><th>Agreed rate (£)</th><th>Basis (per hr / day / unit)</th></tr>
            </thead>
            <tbody>
              {s.bespokeRates.map((r, i) => (
                <tr key={i}><td>{r.trade}</td><td>{r.rate}</td><td>{r.basis}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="agr-muted">Authorised by Heliaxis on countersignature of this Agreement.</p>
        </div>
      )}
    </>
  );
}

function BlockView({ b, s }: { b: Block; s: AgreementSnapshot }) {
  if ('rates' in b) return <Rates s={s} />;
  if ('h' in b) return <h3 className="agr-h3">{b.h}</h3>;
  if ('p' in b) return <p>{b.p}</p>;
  if ('note' in b) return <p className="agr-note">{b.note}</p>;
  if ('ul' in b)
    return (
      <ul className="agr-ul">
        {b.ul.map((li, i) => (
          <li key={i} className={li.startsWith('—') ? 'agr-sub' : undefined}>{li.replace(/^—\s*/, '')}</li>
        ))}
      </ul>
    );
  if ('defs' in b)
    return (
      <dl className="agr-defs">
        {b.defs.map(([term, def]) => (
          <div key={term}><dt>{term}</dt><dd>{def}</dd></div>
        ))}
      </dl>
    );
  return (
    <p className="agr-clause">
      <span className="agr-num">{b.c}</span>
      <span>{b.t}</span>
    </p>
  );
}

function SigBlock({
  party,
  name,
  title,
  signature,
  date,
  pending,
}: {
  party: string;
  name?: string | null;
  title?: string | null;
  signature?: string | null;
  date?: string | null;
  pending: string;
}) {
  return (
    <div className="agr-sig">
      <p className="agr-sig-party">{party}</p>
      <div className="agr-sig-line">
        {signature ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={signature} alt={`Signature of ${name}`} />
        ) : (
          <span className="agr-muted">{pending}</span>
        )}
      </div>
      <dl className="agr-sig-meta">
        <div><dt>Signature</dt><dd>{signature ? 'Signed electronically' : '—'}</dd></div>
        <div><dt>Name (print)</dt><dd>{name || '—'}</dd></div>
        <div><dt>Title / trade</dt><dd>{title || '—'}</dd></div>
        <div><dt>Date</dt><dd>{fmtDate(date) || '—'}</dd></div>
      </dl>
    </div>
  );
}

export function AgreementDocument({
  snapshot: s,
  agreement,
  contentHash,
  showAudit = true,
}: {
  snapshot: AgreementSnapshot;
  agreement?: AgreementRow | null;
  contentHash?: string;
  showAudit?: boolean;
}) {
  const d = s.details;
  const executed = !!agreement?.hlx_signed_at;
  const rows: [string, string, string][] = [
    ['Registered address', s.heliaxis.registeredAddress, d.registeredAddress || ''],
    ['Company number', s.heliaxis.companyNumber, d.companyNumber || (d.entityType ? ENTITY_LABEL[d.entityType] : '')],
    ['VAT number', s.heliaxis.vatNumber, d.vatNumber || 'Not VAT registered'],
    ['UTR / CIS number', s.heliaxis.utr || '—', [d.utr, d.cisNumber].filter(Boolean).join(' / ')],
    ['CIS status', '—', d.cisStatus ? CIS_LABEL[d.cisStatus] : ''],
    ['Notices email', s.heliaxis.noticesEmail, d.noticesEmail || ''],
    ['Accounts / invoices email', s.heliaxis.accountsEmail, d.accountsEmail || ''],
    ['Primary contact', s.heliaxis.primaryContact, [d.primaryContact, d.phone].filter(Boolean).join(' · ')],
  ];

  return (
    <article className="agr">
      <header className="agr-cover">
        <p className="agr-kicker">Heliaxis Limited</p>
        <h1>{AGREEMENT_TITLE}</h1>
        <p className="agr-subtitle">{AGREEMENT_SUBTITLE}</p>
        <div className="agr-parties">
          <p><strong>BETWEEN</strong> Heliaxis Limited, Company No. {s.heliaxis.companyNumber}, registered in England &amp; Wales (&ldquo;the Company&rdquo; or &ldquo;Heliaxis&rdquo;)</p>
          <p><strong>AND</strong> {d.legalName || s.companyName}{d.companyNumber ? `, Company No. ${d.companyNumber}` : ''}{d.registeredAddress ? `, of ${d.registeredAddress}` : ''} (&ldquo;the Subcontractor&rdquo;)</p>
        </div>
        <dl className="agr-meta">
          <div><dt>Date of Agreement</dt><dd>{executed ? fmtDate(agreement!.hlx_signed_at) : 'On countersignature by Heliaxis'}</dd></div>
          <div><dt>Agreement reference</dt><dd>{s.ref}</dd></div>
          <div><dt>Document version</dt><dd>{s.version}</dd></div>
        </dl>
      </header>

      {s.sections.map((sec) => (
        <section key={sec.num} className="agr-section">
          <h2>{sec.num}. {sec.title}</h2>
          {sec.blocks.map((b, i) => <BlockView key={i} b={b} s={s} />)}
        </section>
      ))}

      <section className="agr-section agr-signatures">
        <h2>Signatures</h2>
        <p>IN WITNESS WHEREOF the parties have executed this Agreement as of the date first written above.</p>
        <div className="agr-sig-grid">
          <SigBlock
            party="For and on behalf of HELIAXIS LIMITED"
            name={agreement?.hlx_name}
            title={agreement?.hlx_title}
            signature={agreement?.hlx_signature}
            date={agreement?.hlx_signed_at}
            pending="Awaiting Heliaxis countersignature"
          />
          <SigBlock
            party="For and on behalf of THE SUBCONTRACTOR"
            name={agreement?.sub_name}
            title={agreement?.sub_title}
            signature={agreement?.sub_signature}
            date={agreement?.sub_signed_at}
            pending="Awaiting Subcontractor signature"
          />
        </div>
      </section>

      <section className="agr-section agr-pagebreak">
        <h2>Schedule A — Work Order Template</h2>
        <p>This template may be issued as a standalone document, a formal letter, or by email — provided it is expressly identified as a Work Order under the Subcontractor Framework Agreement.</p>
        <table className="agr-table">
          <thead><tr><th>Field</th><th>Details</th><th>Notes / reference</th></tr></thead>
          <tbody>
            {s.scheduleA.map(([f, n]) => (
              <tr key={f}><td>{f}</td><td /><td>{n}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="agr-section">
        <h2>Schedule B — Party Details and Notices</h2>
        <table className="agr-table">
          <thead><tr><th /><th>Heliaxis Limited</th><th>The Subcontractor</th></tr></thead>
          <tbody>
            {rows.map(([label, h, sub]) => (
              <tr key={label}><th scope="row">{label}</th><td>{h}</td><td>{sub || '—'}</td></tr>
            ))}
          </tbody>
        </table>
        <p>This Schedule shall be completed at the time of signing and updated in writing should any details change. In particular, any change to CIS or VAT registration status must be notified to Heliaxis immediately.</p>
      </section>

      {showAudit && agreement && (
        <section className="agr-section agr-audit">
          <h2>Electronic signature record</h2>
          <p className="agr-muted">
            Signed electronically under the Electronic Communications Act 2000. The fingerprint below is a SHA-256 hash of
            the exact agreement text and party details each signatory was shown.
          </p>
          <dl className="agr-meta">
            <div><dt>Subcontractor signed</dt><dd>{agreement.sub_name} · {fmtDate(agreement.sub_signed_at, true)} · IP {agreement.sub_ip || 'unknown'}</dd></div>
            <div><dt>Heliaxis countersigned</dt><dd>{agreement.hlx_signed_at ? `${agreement.hlx_name} (${agreement.hlx_signed_by}) · ${fmtDate(agreement.hlx_signed_at, true)}` : 'Pending'}</dd></div>
            <div><dt>Document fingerprint</dt><dd className="agr-hash">{agreement.content_hash}</dd></div>
            {contentHash && (
              <div>
                <dt>Integrity check</dt>
                <dd>{contentHash === agreement.content_hash ? '✓ Record matches what was signed' : '⚠ Record has been altered since signing'}</dd>
              </div>
            )}
          </dl>
        </section>
      )}
    </article>
  );
}
