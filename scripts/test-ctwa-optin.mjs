// Meta lead forms that ask for WhatsApp permission (META_LEADS_WHATSAPP_OPT_IN_FORMS), and a
// WhatsApp answer on the form itself.
// Usage: node --experimental-strip-types scripts/test-ctwa-optin.mjs
const { formAsksWhatsApp, leadToEnquiry } = await import('../src/lib/whatsapp/leads.ts');

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

eq('a listed form counts', formAsksWhatsApp('123', '123, 456'), true);
eq('space-separated works', formAsksWhatsApp('456', '123 456'), true);
eq('an unlisted form does not', formAsksWhatsApp('789', '123,456'), false);
eq('no list, no opt-in', formAsksWhatsApp('123', undefined), false);
eq('no form id, no opt-in', formAsksWhatsApp(undefined, '123'), false);
eq('ids match whole, not as a prefix', formAsksWhatsApp('12', '123'), false);

const phone = { name: 'phone_number', values: ['07700900123'] };
eq('no WhatsApp answer: not agreed', leadToEnquiry([phone], 'Ad', false).whatsappOptIn, false);
eq('a yes to a WhatsApp question: agreed', leadToEnquiry([phone, { name: 'happy_to_contact_on_whatsapp', values: ['Yes'] }], 'Ad', false).whatsappOptIn, true);
eq('a no: not agreed', leadToEnquiry([phone, { name: 'whatsapp_ok', values: ['No'] }], 'Ad', false).whatsappOptIn, false);
eq('a listed form agrees the lead', leadToEnquiry([phone], 'Ad', formAsksWhatsApp('123', '123')).optInSource, 'meta-lead-form');

if (failed) process.exit(1);
