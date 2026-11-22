import { describe, expect, it } from 'vitest';
import {
  companyDomain,
  domainFromText,
  domainOf,
  folderFor,
  groupForOrgType,
  guessLabel,
  isPersonalDomain,
  looksAutomated,
  looksLikeMarketing,
  markFor,
  cidsIn,
  cleanSignature,
  insertAtTop,
  markedSignature,
  pickFont,
  pickSignature,
  sharedEnding,
  readyToFile,
  textToHtml,
  threadState,
  tidyFolderPath,
} from '@/lib/mail/shared';

describe('who goes where', () => {
  it('finds the company domain behind a mail server', () => {
    expect(companyDomain('mail.goodwe.com')).toBe('goodwe.com');
    expect(companyDomain('goodwe.com')).toBe('goodwe.com');
    expect(companyDomain('email.nationalgrid.co.uk')).toBe('nationalgrid.co.uk');
    expect(companyDomain('nationalgrid.co.uk')).toBe('nationalgrid.co.uk');
    expect(companyDomain('a.b.hmrc.gov.uk')).toBe('hmrc.gov.uk');
  });

  it('reads a domain from an address or a website', () => {
    expect(domainOf('Jane@Sales.GoodWe.com')).toBe('sales.goodwe.com');
    expect(domainFromText('https://www.goodwe.com/uk/contact')).toBe('goodwe.com');
    expect(domainFromText('info@nationalgrid.co.uk')).toBe('nationalgrid.co.uk');
    expect(domainFromText('not a site')).toBe('');
  });

  it('never groups people on free email services by domain', () => {
    expect(isPersonalDomain('gmail.com')).toBe(true);
    expect(isPersonalDomain('btinternet.com')).toBe(true);
    expect(isPersonalDomain('goodwe.com')).toBe(false);
  });

  it('makes folder names Outlook will take', () => {
    expect(folderFor('Suppliers', 'GoodWe')).toBe('Suppliers/GoodWe');
    expect(folderFor('Customers', 'Smith / Jones: Ltd')).toBe('Customers/Smith Jones Ltd');
    expect(tidyFolderPath(' Suppliers /  GoodWe / ')).toBe('Suppliers/GoodWe');
    expect(tidyFolderPath('a/b/c/d')).toBe('a/b/c');
    expect(guessLabel('mail.goodwe.com')).toBe('Goodwe');
    expect(groupForOrgType('supplier')).toBe('Suppliers');
    expect(groupForOrgType(null)).toBe('Other');
  });
});

describe('marketing and system emails', () => {
  it('spots a mailing list', () => {
    expect(looksLikeMarketing([{ name: 'List-Unsubscribe', value: '<https://x.com/u>' }])).toBe(true);
    expect(looksLikeMarketing([{ name: 'Precedence', value: 'bulk' }])).toBe(true);
    expect(looksLikeMarketing([{ name: 'Subject', value: 'Your quote' }])).toBe(false);
    expect(looksLikeMarketing(undefined)).toBe(false);
  });

  it('spots a system sender', () => {
    expect(looksAutomated('no-reply@nationalgrid.co.uk')).toBe(true);
    expect(looksAutomated('noreply@x.com')).toBe(true);
    expect(looksAutomated('notifications@github.com')).toBe(true);
    expect(looksAutomated('jane@goodwe.com')).toBe(false);
    expect(looksAutomated('jane@goodwe.com', [{ name: 'Auto-Submitted', value: 'auto-replied' }])).toBe(true);
  });
});

describe('where a conversation stands', () => {
  const base = { marketing: false, lastInAt: '2026-11-20T10:00:00Z', lastOutAt: null, doneAt: null, triagedFor: null, needsReply: null };

  it('is new until it has been looked at', () => {
    expect(threadState(base)).toBe('new');
  });
  it('needs a reply, or not, once looked at', () => {
    expect(threadState({ ...base, triagedFor: base.lastInAt, needsReply: true })).toBe('reply');
    expect(threadState({ ...base, triagedFor: base.lastInAt, needsReply: false })).toBe('fyi');
  });
  it('is looked at again when they write again', () => {
    expect(threadState({ ...base, lastInAt: '2026-11-21T10:00:00Z', triagedFor: base.lastInAt, needsReply: false })).toBe('new');
  });
  it('is replied once you sent the last email', () => {
    expect(threadState({ ...base, lastOutAt: '2026-11-20T11:00:00Z', triagedFor: base.lastInAt, needsReply: true })).toBe('replied');
  });
  it('is done when you said no reply needed after their last email', () => {
    expect(threadState({ ...base, doneAt: '2026-11-20T12:00:00Z', triagedFor: base.lastInAt, needsReply: true })).toBe('done');
  });
  it('marketing, unless you have written to them', () => {
    expect(threadState({ ...base, marketing: true })).toBe('marketing');
    expect(threadState({ ...base, marketing: true, lastOutAt: '2026-11-20T11:00:00Z' })).toBe('replied');
  });

  it('files dealt-with emails, and old ones whatever their state', () => {
    const now = Date.parse('2026-11-22T10:00:00Z');
    expect(readyToFile('replied', '2026-11-21T10:00:00Z', now)).toBe(true);
    expect(readyToFile('reply', '2026-11-21T10:00:00Z', now)).toBe(false);
    expect(readyToFile('new', '2026-11-21T10:00:00Z', now)).toBe(false);
    expect(readyToFile('reply', '2026-09-01T10:00:00Z', now)).toBe(true);
  });
});

describe('replies', () => {
  it('escapes and keeps paragraphs', () => {
    expect(textToHtml('Hi Jane,\n\nYes <ok> & thanks\nCallum')).toBe('<p>Hi Jane,</p><p>Yes &lt;ok&gt; &amp; thanks<br>Callum</p>');
  });
});

describe('highlighting in Outlook', () => {
  it('marks only conversations that need a reply, by importance', () => {
    expect(markFor(true, 'reply', 'urgent')).toBe('urgent');
    expect(markFor(true, 'reply', 'high')).toBe('high');
    expect(markFor(true, 'reply', 'normal')).toBe('reply');
    expect(markFor(true, 'reply', null)).toBe('reply');
  });
  it('takes the mark off once dealt with, or when highlighting is off', () => {
    expect(markFor(true, 'replied', 'urgent')).toBeNull();
    expect(markFor(true, 'done', 'high')).toBeNull();
    expect(markFor(false, 'reply', 'urgent')).toBeNull();
  });
});

describe('your signature, copied from your sent emails', () => {
  const SIG = '<div id="Signature"><p style="font-family:Aptos">Callum Hutchings<br>Director, Heliaxis</p><table><tr><td><img src="cid:logo123"></td></tr></table></div>';
  const web = (words: string) => `<html><body><div style="font-family: Aptos, sans-serif; font-size: 11pt">${words}</div><div><br></div>${SIG}</body></html>`;

  it('finds the signature Outlook marks, with everything inside it', () => {
    expect(markedSignature(web('Hi Tom, split it please.'))).toBe(SIG);
    expect(markedSignature('<div>No signature here</div>')).toBeNull();
  });

  it('picks the one most emails share, never one from the phone', () => {
    const phone = '<div>On my way</div><div id="ms-outlook-mobile-signature">Get Outlook for iOS</div>';
    expect(pickSignature([web('One'), phone, web('Two'), web('Three')])).toBe(SIG);
    expect(pickSignature([web('Only one')])).toBeNull();
  });

  it('finds the shared ending when Outlook on a computer does not mark it', () => {
    const sig = '<p class="MsoNormal">Kind regards<br>Callum Hutchings<br>07700 900123</p>';
    const a = `<div class="WordSection1"><p class="MsoNormal">Hi Sarah, thanks for this.</p>${sig}</div>`;
    const b = `<div class="WordSection1"><p class="MsoNormal">Morning Tom, all good.</p>${sig}</div>`;
    const found = sharedEnding(a, b);
    expect(found).toContain('Callum Hutchings');
    expect(found).not.toContain('Sarah');
    expect(pickSignature([a, b])).toContain('07700 900123');
  });

  it('leaves out a sign-off that only some emails share', () => {
    const sig = '<p class="MsoNormal">Callum Hutchings<br>Heliaxis<br>07700 900123</p>';
    const body = (words: string, off: string) => `<div class="WordSection1"><p class="MsoNormal">${words}</p><p class="MsoNormal">${off}</p>${sig}</div>`;
    const got = pickSignature([body('Hi Sarah, yes.', 'Kind regards,'), body('Hi Jo, no problem.', 'Kind regards,'), body('Morning Tom.', 'Cheers,'), body('Hi Rhys, Tuesday works.', 'Thanks,')]);
    expect(got).toBe(sig);
  });

  it('keeps the logo reference and takes out anything that runs', () => {
    expect(cidsIn(SIG)).toEqual(['logo123']);
    expect(cleanSignature('<p onclick="x()">Hi<script>alert(1)</script><a href="javascript:evil()">x</a><iframe src="y"></iframe></p>')).toBe('<p>Hi<a href="#">x</a></p>');
  });

  it('copies the font you write in', () => {
    expect(pickFont([web('a'), web('b')])).toBe('font-family: Aptos, sans-serif; font-size: 11pt');
    expect(pickFont([web('a')])).toBeNull();
  });

  it('puts the reply above the quoted email', () => {
    expect(insertAtTop('<html><body class="x"><hr>quoted</body></html>', '<p>Reply</p>')).toBe('<html><body class="x"><p>Reply</p><hr>quoted</body></html>');
  });
});
