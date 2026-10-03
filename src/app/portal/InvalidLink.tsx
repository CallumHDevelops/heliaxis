export function InvalidLink() {
  return (
    <div className="pt-card pt-narrow">
      <h1>This link isn&apos;t valid any more</h1>
      <p>
        Onboarding links are replaced whenever Heliaxis sends a new one. Please use the most recent email from us, or
        contact <a href="mailto:hello@heliaxis.co.uk">hello@heliaxis.co.uk</a> /{' '}
        <a href="tel:01633965205">01633 965205</a> for a fresh link.
      </p>
    </div>
  );
}
