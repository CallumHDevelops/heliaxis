// Where a lead came from (src/lib/lead-source.ts): which leads are Meta's, the ad's name, the four groups
// the Enquiries list filters by and ?source= in the address bar, the plain labels, and the counts the
// status cards and source buttons show.
// Usage: node --experimental-strip-types scripts/test-lead-source.mjs
import { registerHooks } from 'node:module';

// lead-source.ts imports './ad-spend' without the .ts on the end (as the app's bundler expects); Node needs it.
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (e) {
      if (/^\.\.?\//.test(specifier) && !/\.\w+$/.test(specifier)) return next(`${specifier}.ts`, context);
      throw e;
    }
  },
});
const { leadToEnquiry } = await import('../src/lib/whatsapp/leads.ts');
const { isMetaSource } = await import('../src/lib/ad-spend.ts');
const { shownLeads } = await import('../src/lib/enquiries.ts');
const { inSource, isMetaLead, leadSourceLabel, metaAdLabel, metaAdName, sourceCounts, sourceFromParam, sourceGroup, SOURCE_GROUPS } = await import(
  '../src/lib/lead-source.ts'
);

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

// What the lead forms write (the live webhook and the importer share leadToEnquiry).
const fromAd = leadToEnquiry([{ name: 'full_name', values: ['Esther Smith'] }], 'Video 4', false).source;
const noAdName = leadToEnquiry([{ name: 'full_name', values: ['Tom Hughes'] }], null, false).source;
const organic = leadToEnquiry([{ name: 'full_name', values: ['Priya Patel'] }], 'Video 4', false, true).source;
eq('a lead form writes meta: <ad>', fromAd, 'meta: Video 4');
eq('...meta-lead-ad without an ad name', noAdName, 'meta-lead-ad');
eq('...meta-organic when not on an ad', organic, 'meta-organic');

// Which leads are Meta's: everything Reports counts, plus organic forms.
const META = [fromAd, noAdName, organic, 'meta: Valley Vets Off Grid', 'Meta: Video 1', ' meta: Video 2 ', 'meta-ad: Solar Oct 2026 / Video 4', 'meta-ad', 'whatsapp-ad', 'META-ORGANIC'];
const NOT = ['website', 'quote-form', 'cms-form', 'website-booking', 'whatsapp', 'whatsapp-import', 'crm', 'google-ads: Brand', 'newsletter', 'metaverse', '', null, undefined];
for (const s of META) eq(`Meta: ${JSON.stringify(s)}`, isMetaLead(s), true);
for (const s of NOT) eq(`not Meta: ${JSON.stringify(s)}`, isMetaLead(s), false);
// Reports' isMetaSource is unchanged: organic forms still aren't ad leads there.
eq('Reports still leaves organic out', isMetaSource('meta-organic'), false);
eq('...and counts ad leads', [fromAd, noAdName, 'meta-ad: X', 'whatsapp-ad'].every(isMetaSource), true);

// The ad's name.
eq('ad name', metaAdName('meta: Video 4'), 'Video 4');
eq('renamed ad', metaAdName('meta: Valley Vets Off Grid'), 'Valley Vets Off Grid');
eq('ad name, any case and spaces', metaAdName('  Meta:   Video 1  '), 'Video 1');
eq('a colon in the name stays', metaAdName('meta: Solar: Autumn'), 'Solar: Autumn');
eq('no name after the colon', metaAdName('meta:'), null);
eq('meta-lead-ad has none', metaAdName('meta-lead-ad'), null);
eq('organic has none', metaAdName('meta-organic'), null);
eq('website ad link is not a form', metaAdName('meta-ad: Solar Oct'), null);
eq('website has none', metaAdName('website'), null);
eq('null', metaAdName(null), null);

// What a Meta lead's row says about the ad.
eq('row: the ad', metaAdLabel('meta: Video 4'), 'Video 4');
eq('row: organic', metaAdLabel('meta-organic'), 'Organic');
eq('row: WhatsApp ad', metaAdLabel('whatsapp-ad'), 'WhatsApp ad');
eq('row: website ad link', metaAdLabel('meta-ad: Solar Oct 2026 / Video 4'), 'Website · Solar Oct 2026 / Video 4');
eq('row: website ad link without a campaign', metaAdLabel('meta-ad'), 'Website ad link');
eq('row: Meta didn’t say', metaAdLabel('meta-lead-ad'), 'Ad not known');
eq('row: not Meta', metaAdLabel('website'), null);

// Groups.
for (const s of META) eq(`group meta: ${s}`, sourceGroup(s), 'meta');
eq('group: website', sourceGroup('website'), 'website');
eq('group: quote form', sourceGroup('quote-form'), 'website');
eq('group: CMS form', sourceGroup('cms-form'), 'website');
eq('group: online booking', sourceGroup('website-booking'), 'website');
eq('group: Google ad (through the website)', sourceGroup('google-ads: Brand'), 'website');
eq('group: no source is the website (the column’s default)', sourceGroup(''), 'website');
eq('group: WhatsApp', sourceGroup('whatsapp'), 'whatsapp');
eq('group: imported chat', sourceGroup('whatsapp-import'), 'whatsapp');
eq('group: added by staff', sourceGroup('crm'), 'other');
eq('group: a tagged link', sourceGroup('newsletter: October'), 'other');
eq('groups in order', SOURCE_GROUPS.map((g) => g.key), ['meta', 'website', 'whatsapp', 'other']);

// ?source=
eq('?source=meta', sourceFromParam('meta'), 'meta');
eq('?source= any case', sourceFromParam(' WhatsApp '), 'whatsapp');
eq('?source=website', sourceFromParam('website'), 'website');
eq('?source=other', sourceFromParam('other'), 'other');
eq('?source= unknown is everyone', sourceFromParam('facebook'), '');
eq('?source= empty', sourceFromParam(''), '');
eq('?source= missing', sourceFromParam(null), '');

// Labels.
eq('label: ad', leadSourceLabel('meta: Video 4'), 'Meta ad · Video 4');
eq('label: unnamed ad', leadSourceLabel('meta-lead-ad'), 'Meta ad');
eq('label: organic', leadSourceLabel('meta-organic'), 'Meta (organic)');
eq('label: website ad link', leadSourceLabel('meta-ad: Solar Oct 2026'), 'Meta ad (website) · Solar Oct 2026');
eq('label: website ad link, no campaign', leadSourceLabel('meta-ad'), 'Meta ad (website)');
eq('label: WhatsApp ad', leadSourceLabel('whatsapp-ad'), 'Meta ad (WhatsApp)');
eq('label: website', leadSourceLabel('website'), 'Website');
eq('label: quote form', leadSourceLabel('quote-form'), 'Website');
eq('label: CMS form', leadSourceLabel('cms-form'), 'Website');
eq('label: booking', leadSourceLabel('website-booking'), 'Website booking');
eq('label: Google ad', leadSourceLabel('google-ads: Brand / Solar'), 'Google ad · Brand / Solar');
eq('label: Google ad, no campaign', leadSourceLabel('google-ads'), 'Google ad');
eq('label: WhatsApp', leadSourceLabel('whatsapp'), 'WhatsApp');
eq('label: imported chat', leadSourceLabel('whatsapp-import'), 'WhatsApp (imported)');
eq('label: staff', leadSourceLabel('crm'), 'Added by staff');
eq('label: tagged link', leadSourceLabel('newsletter: October'), 'Newsletter · October');
eq('label: tagged link, no campaign', leadSourceLabel('newsletter'), 'Newsletter');
eq('label: nothing', leadSourceLabel(''), 'Website');
eq('label: null', leadSourceLabel(null), 'Website');

// The Enquiries list: a source group, then the status card and the search (shownLeads), newest first.
const lead = (id, name, status, src) => ({
  id, name, org: '', email: `${id}@example.com`, phone: '', town: '—', postcode: '', sector: '—', interests: [], msg: '',
  src, time: '', isnew: status === 'New', status, created_at: '', ref: '',
});
const leads = [
  lead('a', 'Esther Smith', 'New', 'meta: Video 4'),
  lead('b', 'Tom Hughes', 'New', 'website'),
  lead('c', 'Priya Smith', 'Contacted', 'meta-organic'),
  lead('d', 'Gareth Jones', 'New', 'whatsapp'),
  lead('e', 'Aisha Khan', 'New', 'meta-lead-ad'),
  lead('f', 'Owen Price', 'Won', 'crm'),
  lead('g', 'Lucy Smith', 'New', 'quote-form'),
];
const ids = (list) => list.map((l) => l.id);
eq('everyone', ids(inSource(leads, '')), ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
eq('Meta', ids(inSource(leads, 'meta')), ['a', 'c', 'e']);
eq('Website', ids(inSource(leads, 'website')), ['b', 'g']);
eq('WhatsApp', ids(inSource(leads, 'whatsapp')), ['d']);
eq('Other', ids(inSource(leads, 'other')), ['f']);
eq('Meta + New = new Meta leads', ids(shownLeads(inSource(leads, 'meta'), '', 'New')), ['a', 'e']);
eq('Meta + New + search', ids(shownLeads(inSource(leads, 'meta'), 'aisha', 'New')), ['e']);
eq('Website + search', ids(shownLeads(inSource(leads, 'website'), 'smith', '')), ['g']);
eq('WhatsApp + Won: nobody', ids(shownLeads(inSource(leads, 'whatsapp'), '', 'Won')), []);
// Select all is the same list without the kept rows: a lead moved off New stays on screen, not in Select all.
const moved = leads.map((l) => (l.id === 'a' ? { ...l, status: 'Contacted', isnew: false } : l));
eq('kept row stays on screen', ids(shownLeads(inSource(moved, 'meta'), '', 'New', new Set(['a']))), ['a', 'e']);
eq('...but Select all skips it', ids(shownLeads(inSource(moved, 'meta'), '', 'New')), ['e']);

// Counts: the status cards follow the source, the source buttons follow the status card.
eq('counts: everyone', sourceCounts(leads), { meta: 3, website: 2, whatsapp: 1, other: 1 });
eq('counts: New only', sourceCounts(leads.filter((l) => l.status === 'New')), { meta: 2, website: 2, whatsapp: 1, other: 0 });
eq('counts: none', sourceCounts([]), { meta: 0, website: 0, whatsapp: 0, other: 0 });

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
