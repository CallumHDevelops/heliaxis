// What each WhatsApp webhook message type says in the chat (src/lib/whatsapp/describe.ts).
// Usage: node --experimental-strip-types scripts/test-wa-describe.mjs
import { describeMessage, shownBody } from '../src/lib/whatsapp/describe.ts';

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const msg = (type, extra = {}) => describeMessage({ id: 'wamid.1', from: '12135550123', type, ...extra });
const RESEND = 'Ask them to send it again as a normal message or photo.';
const NOT_PASSED_ON = '⚠️ WhatsApp didn’t pass this on. It may have been deleted, or be a poll, a view-once photo or another business’s automated message.';
const NAMED = '⚠️ WhatsApp didn’t pass this message on. If it matters, ask them to send it again.';
const AUTOMATED = '⚠️ An automated message from another business’s WhatsApp system (a code or an alert, say). WhatsApp doesn’t pass these on.';

// Real text: the only kind that can trigger a smart reply.
eq('text', msg('text', { text: { body: 'How much for 10 panels?' } }), { kind: 'text', body: 'How much for 10 panels?' });
eq('template quick-reply button', msg('button', { button: { text: 'Yes please', payload: 'yes' } }), { kind: 'text', body: 'Yes please' });
eq('interactive button reply', msg('interactive', { interactive: { type: 'button_reply', button_reply: { title: 'Book a survey' } } }), {
  kind: 'text',
  body: 'Book a survey',
});
eq('interactive list reply', msg('interactive', { interactive: { type: 'list_reply', list_reply: { title: 'Battery only' } } }), {
  kind: 'text',
  body: 'Battery only',
});

// Media.
eq('image', msg('image', { image: { caption: 'Our roof' } }), { kind: 'image', body: '📷 Photo: Our roof' });
eq('image, no caption', msg('image', { image: {} }), { kind: 'image', body: '📷 Photo' });
eq('video', msg('video', { video: {} }), { kind: 'video', body: '🎥 Video' });
eq('document', msg('document', { document: { filename: 'bill.pdf', caption: 'Last quarter' } }), { kind: 'document', body: '📄 bill.pdf — Last quarter' });
eq('voice note', msg('audio', { audio: { voice: true } }), { kind: 'audio', body: '🎤 Voice note' });
eq('audio file', msg('audio', { audio: { voice: false } }), { kind: 'audio', body: '🎵 Audio file' });
eq('audio, older payload', msg('audio', { audio: {} }), { kind: 'audio', body: '🎤 Voice note' });
eq('sticker', msg('sticker', { sticker: { animated: true } }), { kind: 'other', body: '🙂 Sticker' });
eq('location', msg('location', { location: { latitude: 51.58, longitude: -2.99, name: 'Newport' } }), {
  kind: 'location',
  body: '📍 Newport (51.58, -2.99)',
});
eq('reaction', msg('reaction', { reaction: { emoji: '👍' } }), { kind: 'other', body: 'Reacted 👍' });
eq('reaction removed', msg('reaction', { reaction: {} }), { kind: 'other', body: 'Removed a reaction' });

// Contacts: name and number, so the team can act on it.
eq(
  'one contact',
  msg('contacts', {
    contacts: [
      {
        name: { formatted_name: 'Dai Jones', first_name: 'Dai' },
        org: { company: 'Jones Roofing' },
        phones: [{ phone: '+44 7700 900123', wa_id: '447700900123', type: 'CELL' }],
        emails: [{ email: 'dai@example.com' }],
      },
    ],
  }),
  { kind: 'other', body: '👤 Shared contact: Dai Jones (Jones Roofing): +44 7700 900123, dai@example.com' }
);
eq(
  'two contacts, one with only a WhatsApp id',
  msg('contacts', {
    contacts: [{ name: { first_name: 'Sian', last_name: 'Evans' }, phones: [{ wa_id: '447700900456' }] }, { name: { formatted_name: 'Gareth' } }],
  }),
  { kind: 'other', body: '👤 Shared 2 contacts:\nSian Evans: +447700900456\nGareth (no number)' }
);
eq('contact with nothing in it', msg('contacts', {}), { kind: 'other', body: '👤 Shared a contact' });

// Unsupported: what Meta doesn't pass on, in plain words, and never "open WhatsApp".
const unsupportedError = { code: 131051, title: 'Message type unknown', message: 'Message type unknown', error_data: { details: 'Message type is currently not supported.' } };
eq('unsupported, type unknown (the +1 213 message)', msg('unsupported', { errors: [unsupportedError] }), { kind: 'other', body: NOT_PASSED_ON });
eq('unsupported, no errors at all', msg('unsupported'), { kind: 'other', body: NOT_PASSED_ON });
eq('unsupported poll', msg('unsupported', { unsupported: { type: 'poll_creation' }, errors: [unsupportedError] }), {
  kind: 'other',
  body: `⚠️ They sent a poll, which WhatsApp doesn’t pass on. ${RESEND}`,
});
eq('unsupported edit', msg('unsupported', { unsupported: { type: 'edit' }, errors: [unsupportedError] }), {
  kind: 'other',
  body: `⚠️ They edited a message, which WhatsApp doesn’t pass on. ${RESEND}`,
});
eq('unsupported gif', msg('unsupported', { unsupported: { type: 'gif' } }).body, `⚠️ They sent a GIF, which WhatsApp doesn’t pass on. ${RESEND}`);
eq('unsupported pin: nothing to do', msg('unsupported', { unsupported: { type: 'pin' } }), { kind: 'other', body: '📌 They pinned a message in the chat.' });
eq('unsupported type named like an Object property', msg('unsupported', { unsupported: { type: 'constructor' } }).body, NAMED);
eq('unsupported type we have no name for', msg('unsupported', { unsupported: { type: 'media_placeholder' }, errors: [unsupportedError] }).body, NAMED);
for (const t of ['hsm', 'template', 'interactive', 'button', 'list']) {
  eq(`unsupported ${t}: another business's automated message, no resend`, msg('unsupported', { unsupported: { type: t }, errors: [unsupportedError] }).body, AUTOMATED);
}
eq(
  'unsupported with another reason from Meta (131060)',
  msg('unsupported', { errors: [{ code: 131060, title: 'Message unavailable', error_data: { details: 'This message is currently unavailable.' } }] }),
  { kind: 'other', body: `⚠️ WhatsApp didn’t pass this message on (“This message is currently unavailable”). ${RESEND}` }
);
eq('unsupported with only a title', msg('unsupported', { errors: [{ code: 1, title: 'Something odd' }] }).body, `⚠️ WhatsApp didn’t pass this message on (“Something odd”). ${RESEND}`);
eq('old "unknown" type', msg('unknown', { errors: [{ code: 501, title: 'Unknown message type' }] }).body, `⚠️ WhatsApp didn’t pass this message on (“Unknown message type”). ${RESEND}`);

// System, welcome, deleted.
eq(
  'system: changed number',
  msg('system', { system: { body: 'User Dai changed from \u200e+1 213 555 0123 to \u200e+44 7700 900123\u200e', type: 'user_changed_number', wa_id: '447700900123' } }),
  { kind: 'other', body: 'ℹ️ User Dai changed from \u200e+1 213 555 0123 to \u200e+44 7700 900123. New messages from +447700900123 will start a new chat.' }
);
eq('system: changed number, older field', msg('system', { system: { type: 'customer_changed_number', new_wa_id: 447700900123 } }).body, 'ℹ️ They changed their WhatsApp number. New messages from +447700900123 will start a new chat.');
eq('system: other change', msg('system', { system: { body: 'Dai’s security code changed.', type: 'customer_identity_changed' } }), {
  kind: 'other',
  body: 'ℹ️ Dai’s security code changed.',
});
eq('system: empty', msg('system', {}).body, 'ℹ️ Their WhatsApp account changed.');
eq('request_welcome', msg('request_welcome'), { kind: 'other', body: '👋 They opened a WhatsApp chat with you but haven’t written anything yet.' });
eq('deleted', msg('revoked'), { kind: 'other', body: '🗑️ They deleted a message.' });

// Orders, forms, call permission.
eq(
  'order',
  msg('order', {
    order: {
      catalog_id: '1',
      text: 'Can you fit it in May?',
      product_items: [
        { product_retailer_id: 'panel', quantity: 2, item_price: 150, currency: 'GBP' },
        { product_retailer_id: 'battery', quantity: 1, item_price: 3000, currency: 'GBP' },
      ],
    },
  }),
  { kind: 'other', body: '🛒 Order from your WhatsApp catalogue: 3 items, £3,300.00 — Can you fit it in May?' }
);
eq('order with a bad currency', msg('order', { order: { product_items: [{ quantity: 1, item_price: 5, currency: 'XX' }] } }).body, '🛒 Order from your WhatsApp catalogue: 1 item');
eq('order with nothing in it', msg('order').body, '🛒 Order from your WhatsApp catalogue');
eq(
  'flow (form) reply',
  msg('interactive', {
    interactive: {
      type: 'nfm_reply',
      nfm_reply: {
        name: 'flow',
        body: 'Sent',
        response_json: JSON.stringify({ flow_token: 'abc', screen_0_First_name_0: 'Dai', screen_0_Postcode_1: 'NP20 1AA', screen_1_Battery_2: true, screen_1_Extras_3: ['EV charger', 'Bird guard'] }),
      },
    },
  }),
  { kind: 'other', body: '📋 Filled in a form:\nFirst name: Dai\nPostcode: NP20 1AA\nBattery: Yes\nExtras: EV charger, Bird guard' }
);
eq(
  'address message',
  msg('interactive', {
    interactive: {
      type: 'nfm_reply',
      nfm_reply: { name: 'address_message', response_json: JSON.stringify({ saved_address_id: 'a1', values: { name: 'Dai', address: '1 High St', city: 'Newport', landmark_area: '' } }) },
    },
  }).body,
  '🏠 Sent their address:\nName: Dai\nAddress: 1 High St\nCity: Newport'
);
eq('form reply that isn’t JSON', msg('interactive', { interactive: { type: 'nfm_reply', nfm_reply: { name: 'flow', response_json: 'oops' } } }), {
  kind: 'other',
  body: '📋 Filled in a form',
});
eq('call permission: yes', msg('interactive', { interactive: { type: 'call_permission_reply', call_permission_reply: { response: 'accept' } } }), {
  kind: 'other',
  body: '📞 They said yes to WhatsApp calls from you.',
});
eq('call permission: no', msg('interactive', { interactive: { type: 'call_permission_reply', call_permission_reply: { response: 'reject' } } }).body, '📞 They said no to WhatsApp calls from you.');
eq('interactive we don’t know', msg('interactive', { interactive: { type: 'something_new' } }), {
  kind: 'other',
  body: `⚠️ They answered in a way this inbox can’t show. ${RESEND}`,
});

// A type Meta adds later.
eq('brand-new type', msg('hologram'), { kind: 'other', body: `⚠️ They sent a “hologram” message, which this inbox can’t show yet. ${RESEND}` });

// Rows saved before this: shown in today's wording; everything else as it is.
eq('old unsupported row', shownBody('[unsupported message — open WhatsApp to see it]'), NOT_PASSED_ON);
eq('old sticker row', shownBody('[sticker message — open WhatsApp to see it]'), '🙂 Sticker');
eq('old contacts row', shownBody('[contacts message — open WhatsApp to see it]'), '👤 Shared a contact');
eq('old system row', shownBody('[system message — open WhatsApp to see it]'), 'ℹ️ Their WhatsApp account changed.');
eq('normal text untouched', shownBody('Please open WhatsApp to see it'), 'Please open WhatsApp to see it');
eq('null untouched', shownBody(null), null);

// The whole set: never "open WhatsApp", only real text is kind 'text', and our own wording fits a notification (140).
const all = [
  msg('sticker'),
  msg('contacts'),
  msg('unsupported'),
  msg('unsupported', { errors: [unsupportedError] }),
  ...['poll_creation', 'poll_update', 'edit', 'gif', 'group_invite', 'product', 'view_once', 'pin', 'keep_in_chat', 'hsm'].map((t) => msg('unsupported', { unsupported: { type: t } })),
  msg('system'),
  msg('system', { system: { type: 'user_changed_number', wa_id: '447700900123' } }),
  msg('request_welcome'),
  msg('revoked'),
  msg('deleted'),
  msg('unknown'),
  msg('order'),
  msg('interactive', { interactive: { type: 'nfm_reply', nfm_reply: { response_json: '{}' } } }),
  msg('interactive', { interactive: { type: 'call_permission_reply', call_permission_reply: { response: 'accept' } } }),
  msg('interactive', {}),
  msg('ephemeral'),
  msg('a_long_future_type_name'),
];
eq('never says "open WhatsApp"', all.filter((d) => /open WhatsApp/i.test(d.body)), []);
eq('none of these is text (no smart reply)', all.filter((d) => d.kind === 'text'), []);
eq('all fit a notification', all.filter((d) => d.body.length > 140).map((d) => [d.body.length, d.body]), []);
eq('kinds the chat already knows', [...new Set(all.map((d) => d.kind))], ['other']);

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);
