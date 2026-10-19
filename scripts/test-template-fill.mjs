// node --experimental-strip-types scripts/test-template-fill.mjs
import { fillTemplate, parseTemplateNote } from '../src/lib/whatsapp/template-fill.ts';

let failed = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
};

const followup = {
  header: null,
  body: 'Hi {{1}}, it’s {{2}} from Heliaxis. A while ago you asked us about {{3}}. Are you still thinking about it?',
  footer: null,
  buttons: ['Yes, still interested', 'Not right now'],
};
eq(
  'fills each blank and lists the buttons',
  fillTemplate(followup, ['Nikki', 'Callum', 'solar panels and battery storage']),
  'Hi Nikki, it’s Callum from Heliaxis. A while ago you asked us about solar panels and battery storage. Are you still thinking about it?\n\n[Yes, still interested] [Not right now]'
);
eq('a missing value leaves its blank', fillTemplate({ ...followup, buttons: [] }, ['Nikki']).includes('{{2}}'), true);
eq('text header and footer kept', fillTemplate({ header: 'Hello {{1}}', body: 'Body', footer: 'Reply STOP to opt out', buttons: [] }, ['Jo']), 'Hello Jo\n\nBody\n\nReply STOP to opt out');
eq('a picture header is left out', fillTemplate({ header: '[image]', body: 'Body', footer: null, buttons: [] }, []), 'Body');
eq('$ in a value is kept as it is', fillTemplate({ header: null, body: 'Total {{1}}', footer: null, buttons: [] }, ['$1 & £2']), 'Total $1 & £2');

eq('old note with blanks', parseTemplateNote('Template “enquiry_followup” (Nikki, Callum, Solar)'), { name: 'enquiry_followup', raw: 'Nikki, Callum, Solar' });
eq('old note without blanks', parseTemplateNote('Template “hello_world”'), { name: 'hello_world', raw: '' });
eq('anything else is not a note', parseTemplateNote('Hi there'), null);
eq('null body', parseTemplateNote(null), null);

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nAll passed');
