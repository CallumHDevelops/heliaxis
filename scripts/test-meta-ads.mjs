// Meta ad spend in Reports (src/lib/ad-spend.ts): reading Meta's figures, the money maths and
// rounding, currency formatting, a period's dates in Europe/London (both sides of the clocks
// changing), which CRM leads go with which ad, and Meta's errors in plain words.
// Usage: node --experimental-strip-types scripts/test-meta-ads.mjs
import {
  adAccountNumber,
  addDays,
  adMoney,
  adsFromRows,
  costPer,
  dayIn,
  isMetaSource,
  mergeAds,
  metaLeadCount,
  periodDates,
  plainAdsError,
  returnOn,
  spendTable,
  toMinor,
  totalsFromRows,
} from '../src/lib/ad-spend.ts';

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}
const yes = (name, cond) => eq(name, !!cond, true);

// ── Meta's numbers (all text) → pence ──
eq('"12.34" → 1234', toMinor('12.34'), 1234);
eq('"5339.5" → 533950', toMinor('5339.5'), 533950);
eq('"0.29" → 29 (no float drift)', toMinor('0.29'), 29);
eq('"1.005" rounds half a penny up', toMinor('1.005'), 101);
eq('"1.004" rounds down', toMinor('1.004'), 100);
eq('".5" → 50', toMinor('.5'), 50);
eq('"7" → 700', toMinor('7'), 700);
eq('a number works too', toMinor(12.5), 1250);
eq('blank, nonsense and missing → 0', [toMinor(''), toMinor('abc'), toMinor(undefined), toMinor(null), toMinor('1e3')], [0, 0, 0, 0, 0]);
eq('0.10 + 0.20 adds to exactly 30p', totalsFromRows([{ spend: '0.10' }, { spend: '0.20' }]).spend, 30);

// ── Meta's lead count: never add overlapping action types ──
const acts = (o) => Object.entries(o).map(([action_type, value]) => ({ action_type, value }));
eq("'lead' is the total", metaLeadCount(acts({ lead: '5', 'onsite_conversion.lead_grouped': '4', leadgen_grouped: '4', 'offsite_conversion.fb_pixel_lead': '1' })), 5);
eq("without 'lead': form + website", metaLeadCount(acts({ 'onsite_conversion.lead_grouped': '4', leadgen_grouped: '4', 'offsite_conversion.fb_pixel_lead': '2' })), 6);
eq('leadgen_grouped when it is all there is', metaLeadCount(acts({ leadgen_grouped: '3' })), 3);
eq('no lead actions → 0', metaLeadCount(acts({ link_click: '40' })), 0);
eq('no actions at all → 0', metaLeadCount(undefined), 0);

// ── Insights rows → ads ──
const rows = [
  { ad_id: '1', ad_name: ' Video 4 ', campaign_id: 'c1', campaign_name: 'Solar Oct', spend: '100.50', impressions: '1000', clicks: '20', actions: acts({ lead: '3' }) },
  { ad_id: '1', ad_name: 'Video 4', campaign_id: 'c1', campaign_name: 'Solar Oct', spend: '0.50', impressions: '10', clicks: '1', actions: acts({ lead: '1' }) },
  { ad_name: 'no id', spend: '9' },
  { ad_id: '2', campaign_id: 'c1', spend: '5' },
];
eq('rows for the same ad add up; rows without an ad id are left out', adsFromRows(rows), [
  { id: '1', name: 'Video 4', campaignId: 'c1', campaignName: 'Solar Oct', spend: 10100, impressions: 1010, clicks: 21, metaLeads: 4 },
  { id: '2', name: 'Ad 2', campaignId: 'c1', campaignName: 'Campaign c1', spend: 500, impressions: 0, clicks: 0, metaLeads: 0 },
]);
const ad = (id, name, campaignId, campaignName, spend, metaLeads = 0) => ({ id, name, campaignId, campaignName, spend, impressions: 0, clicks: 0, metaLeads });
eq('earlier days + today add up, with today’s names', mergeAds([ad('1', 'Old', 'c1', 'C', 1000, 2)], [ad('1', 'New', 'c1', 'C', 250, 1), ad('2', 'B', 'c1', 'C', 5)]), [
  ad('1', 'New', 'c1', 'C', 1250, 3),
  ad('2', 'B', 'c1', 'C', 5),
]);

// ── The ad account number ──
eq('act_ prefix or not', [adAccountNumber('act_1234567890'), adAccountNumber('1234567890'), adAccountNumber(' ACT 1234567890 '), adAccountNumber('act-1234567890')], [
  '1234567890',
  '1234567890',
  '1234567890',
  '1234567890',
]);
eq('not a number → null', [adAccountNumber(''), adAccountNumber('act_'), adAccountNumber('my account'), adAccountNumber(undefined)], [null, null, null, null]);

// ── Dates in the ad account's time zone (Europe/London) ──
const t = (iso) => Date.parse(iso);
eq('BST: 23:30 UTC is already tomorrow', dayIn(t('2026-10-24T23:30:00Z'), 'Europe/London'), '2026-10-25');
eq('GMT after the clocks go back: 23:30 UTC is still today', dayIn(t('2026-10-25T23:30:00Z'), 'Europe/London'), '2026-10-25');
eq('GMT before the clocks go forward', dayIn(t('2026-03-28T23:30:00Z'), 'Europe/London'), '2026-03-28');
eq('BST after the clocks go forward', dayIn(t('2026-03-29T23:30:00Z'), 'Europe/London'), '2026-03-30');
eq('another time zone (Los Angeles)', dayIn(t('2026-10-19T05:00:00Z'), 'America/Los_Angeles'), '2026-10-18');
eq('a time zone this computer doesn’t know → London', dayIn(t('2026-10-24T23:30:00Z'), 'Mars/Olympus'), '2026-10-25');
eq('addDays over the clock change', [addDays('2026-10-24', 1), addDays('2026-10-25', 1), addDays('2026-03-29', -1)], ['2026-10-25', '2026-10-26', '2026-03-28']);
eq('90 days ending today, today included', periodDates(90, 'Europe/London', t('2026-10-19T12:00:00Z')), {
  since: '2026-07-22',
  yesterday: '2026-10-18',
  today: '2026-10-19',
});
eq('30 days at 00:30 BST counts from the London date', periodDates(30, 'Europe/London', t('2026-10-18T23:30:00Z')), {
  since: '2026-09-20',
  yesterday: '2026-10-18',
  today: '2026-10-19',
});
eq('1 year over both clock changes', periodDates(365, 'Europe/London', t('2026-10-26T00:30:00Z')), { since: '2025-10-27', yesterday: '2026-10-25', today: '2026-10-26' });
eq('7 days from 23:59 on the night the clocks go back', periodDates(7, 'Europe/London', t('2026-10-25T23:59:00Z')), { since: '2026-10-19', yesterday: '2026-10-24', today: '2026-10-25' });

// ── Which sources are Meta's ──
eq('Meta sources', ['meta: Video 4', 'Meta: x', 'meta-ad', 'meta-ad: Solar Oct / Video 4', 'meta-lead-ad', 'whatsapp-ad'].map(isMetaSource), [true, true, true, true, true, true]);
eq('not Meta', ['metadata', 'whatsapp', 'cms-form', 'google-ads: Brand', 'meta-ads-thing', 'quote-form'].map(isMetaSource), [false, false, false, false, false, false]);

// ── Matching leads to ads ──
const L = (source, o = {}) => ({ source, metaAdId: null, surveyed: false, won: false, lost: false, value: 0, ...o });
const ads = [
  ad('101', 'Video 4', 'c1', 'Solar Oct', 30000, 9), // £300
  ad('102', 'Carousel 2', 'c1', 'Solar Oct', 12000, 3),
  ad('103', 'Static 1', 'c1', 'Solar Oct', 5000, 0), // no leads in the CRM
  ad('201', 'Video 4', 'c2', 'Solar Oct – Copy', 8000, 2), // same name, another campaign
  ad('301', 'Pump film', 'c3', 'Heat pumps', 20000, 4),
  ad('302', 'Pump still', 'c3', 'Heat pumps', 0, 0), // shown, never charged: left out
];
const leads = [
  L('meta: Carousel 2', { surveyed: true }),
  L('meta: Carousel 2', { surveyed: true, won: true, value: 12000 }),
  L('meta: Old name', { metaAdId: '301' }), // renamed ad: the id wins
  L('meta: Pump film', { lost: true, surveyed: true }),
  L('meta-ad: Heat pumps / Pump film', { surveyed: true }), // website, ad named in the link
  L('meta-ad: Heat pumps'), // website, campaign only
  L('meta-ad: c3 / 301'), // ids in the link ({{campaign.id}} / {{ad.id}})
  L('meta: Video 4'), // two ads have this name
  L('meta: Video 4', { metaAdId: '101' }), // pinned by id, but the name is shared: one row
  L('meta: Gone ad'), // not in Meta's figures
  L('meta-lead-ad'),
  L('whatsapp-ad', { metaAdId: '102' }),
  L('cms-form', { won: true, value: 9000 }), // not Meta: left out
];
const table = spendTable(leads, ads, { spend: 80000, metaLeads: 20 });
const g = Object.fromEntries(table.groups.map((x) => [x.label, x]));
const rowOf = (group, label) => g[group]?.rows.find((r) => r.label === label);
eq('groups: by £ won, then leads; "Other" last', table.groups.map((x) => x.label), ['Solar Oct', 'Heat pumps', 'Other Meta leads and spend']);
eq('Carousel 2 by name, plus the WhatsApp ad chat by id', (({ leads, surveys, won, value, spend, metaLeads }) => ({ leads, surveys, won, value, spend, metaLeads }))(rowOf('Solar Oct', 'Carousel 2')), {
  leads: 3,
  surveys: 2,
  won: 1,
  value: 12000,
  spend: 12000,
  metaLeads: 3,
});
const film = rowOf('Heat pumps', 'Pump film');
eq('id beats the old name; website link by name and by ids; lost lead not a survey', [film.leads, film.surveys, film.lost, film.spend], [4, 1, 1, 20000]);
const web = rowOf('Heat pumps', 'Website enquiries');
eq('campaign-only website lead: under the campaign, no spend of its own', [web.leads, web.spend, !!web.note], [1, null, true]);
eq('the campaign’s total counts the website lead against all its spend', [g['Heat pumps'].total.leads, g['Heat pumps'].total.spend], [5, 20000]);
yes('an ad shown but never charged, with no leads, is left out', !rowOf('Heat pumps', 'Pump still'));
const v4 = rowOf('Solar Oct', 'Video 4');
eq('a shared name: one row with both ads’ spend, under the campaign that spent most', [v4.leads, v4.spend, v4.metaLeads, v4.note], [2, 38000, 11, '2 ads with this name, also in “Solar Oct – Copy”']);
yes('…and the other campaign has no row of its own for it', !g['Solar Oct – Copy']);
eq('an ad with spend and no leads gets its own row', [rowOf('Solar Oct', 'Static 1').leads, rowOf('Solar Oct', 'Static 1').spend], [0, 5000]);
eq('ad rows in a campaign: by £ won, then leads, then spend', g['Solar Oct'].rows.map((r) => r.label), ['Carousel 2', 'Video 4', 'Static 1']);
const other = g['Other Meta leads and spend'];
eq('unmatched leads and unlisted spend go in "Other"', other.rows.map((r) => [r.label, r.leads, r.spend]), [
  ['Gone ad', 1, null],
  ['Meta lead form', 1, null],
  ['Ads Meta no longer lists', 0, 80000 - 75000],
]);
yes('…each with a note saying why', other.rows.every((r) => r.note));
eq('total spend is the account’s, and the groups add up to it', [table.total.spend, table.groups.reduce((n, x) => n + x.total.spend, 0)], [80000, 80000]);
eq('total leads: every Meta lead, nothing else', [table.total.leads, table.total.won, table.total.value], [12, 1, 12000]);
eq('Meta’s own count is the account’s', table.total.metaLeads, 20);

// Website link where the campaign name itself has " / " in it.
const slash = spendTable([L('meta-ad: Solar / Batteries / Video A')], [ad('9', 'Video A', 'c9', 'Solar / Batteries', 1000)], null);
eq('a " / " inside the campaign name', [slash.groups[0].label, slash.groups[0].rows[0].label, slash.groups[0].rows[0].leads], ['Solar / Batteries', 'Video A', 1]);
// Only the ad in the link (no utm_campaign).
eq('only the ad in the link', spendTable([L('meta-ad: Video A')], [ad('9', 'Video A', 'c9', 'C', 1000)], null).groups[0].rows[0].leads, 1);
// A name that matches case and spacing loosely.
eq('names match without minding case or spaces', spendTable([L('meta:  video   a ')], [ad('9', 'Video A', 'c9', 'C', 1000)], null).groups[0].rows[0].leads, 1);
// Nothing from Meta: no groups, nothing spent.
const none = spendTable([L('cms-form')], [], { spend: 0, metaLeads: 0 });
eq('no Meta leads or spend: nothing to show', [none.groups.length, none.total.spend, none.total.leads], [0, null, 0]);
// No account total (Meta didn't send it): just the ads.
eq('no account total: the ads add up on their own', spendTable([], [ad('1', 'A', 'c', 'C', 1234)], null).total.spend, 1234);

// ── Money ──
eq('pence under £100 show pence', [adMoney(420), adMoney(9999), adMoney(0), adMoney(5)], ['£4.20', '£99.99', '£0.00', '£0.05']);
eq('£100 and over show whole pounds', [adMoney(10000), adMoney(125049), adMoney(125050), adMoney(9999.6)], ['£100', '£1,250', '£1,251', '£100']);
eq('nothing → —', [adMoney(null), adMoney(undefined), adMoney(NaN)], ['—', '—', '—']);
eq('the account’s currency', [adMoney(420, 'EUR'), adMoney(420, 'USD'), adMoney(123400, 'JPY'), adMoney(5000, 'JPY')], ['€4.20', 'US$4.20', 'JP¥1,234', 'JP¥50']);
eq('an unknown currency code still reads', adMoney(420, 'NOTACODE'), 'NOTACODE 4.20');
eq('cost per: spend ÷ how many', [costPer(100000, 4), costPer(1000, 3), costPer(1000, 0), costPer(null, 3), costPer(0, 3)], [25000, 1000 / 3, null, null, 0]);
eq('£3.33⅓ shows as £3.33', adMoney(costPer(1000, 3)), '£3.33');
eq('£2.665 rounds to £2.67', adMoney(costPer(533, 2)), '£2.67');
eq('return: £ won for each £1', [returnOn(4200, 100000), returnOn(12000, 37500), returnOn(0, 5000)], ['£4.20 per £1', '£32.00 per £1', '£0.00 per £1']);
eq('return with no spend → —', [returnOn(5000, 0), returnOn(5000, null)], ['—', '—']);
eq('return for a euro account', returnOn(4200, 100000, 'EUR'), '£4.20 per €1');
eq('a big return keeps its comma', returnOn(250000, 10000), '£2,500.00 per £1');

// ── Meta's errors in plain words ──
const says = (r, has) => yes(`${JSON.stringify(r)} → ${has}`, plainAdsError(r, '1234567890').includes(has));
says({ error: 'Error validating access token: Session has expired', code: 190 }, 'META_ADS_TOKEN');
says({ error: '(#200) Ad account owner has NOT grant ads_management or ads_read permission', code: 200 }, 'ads_read');
says({ error: '(#10) Application does not have permission for this action', code: 10 }, 'ads_read');
says({ error: "Unsupported get request. Object with ID 'act_1234567890' does not exist, cannot be loaded due to missing permissions", code: 100, subcode: 33 }, 'can’t find ad account act_1234567890');
says({ error: 'User request limit reached', code: 17, subcode: 2446079 }, 'limiting how often');
says({ error: 'There have been too many calls from this ad-account', code: 80004 }, 'limiting how often');
says({ error: 'The operation was aborted due to timeout' }, 'took too long');
says({ error: 'Please reduce the amount of data', code: 100, subcode: 1504018 }, 'took too long');
says({ error: '(#2635) You are calling a deprecated version of the Ads API', code: 2635 }, 'META_ADS_GRAPH_VERSION');
says({ error: 'Something odd', code: 1 }, 'Meta said: “Something odd”');

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
