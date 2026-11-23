import { NextResponse } from 'next/server';
import { attachmentFile } from '@/lib/mail/graph';
import { mailSession } from '@/lib/mail/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const UUID = /^[0-9a-f-]{36}$/i;

/** Opens a file attached to one of the emails in a conversation (?m=<email row id>&a=<attachment id>). Your mailbox only. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await mailSession();
  if (!s.ok) return NextResponse.json({ error: s.error }, { status: s.status });
  const url = new URL(req.url);
  const m = url.searchParams.get('m') || '';
  const a = url.searchParams.get('a') || '';
  if (!s.box || !UUID.test(id) || !UUID.test(m) || !a || a.length > 500) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data: t } = await s.db.from('mail_threads').select('conversation_id').eq('id', id).eq('box_id', s.box.id).maybeSingle();
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // The email has to be in this conversation, in this mailbox.
  const { data: msg } = await s.db.from('mail_messages').select('graph_id').eq('id', m).eq('box_id', s.box.id).eq('conversation_id', t.conversation_id).maybeSingle();
  if (!msg) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const f = await attachmentFile(s.box.address, msg.graph_id as string, a).catch(() => null);
  if (!f) return NextResponse.json({ error: 'That attachment couldn’t be opened. Open it in Outlook.' }, { status: 404 });
  // Only types that can't run anything open in the browser; anything else (HTML, SVG…) downloads, so an attachment
  // can never run as part of the site.
  const type = f.contentType.toLowerCase().split(';')[0].trim();
  const inline = /^(application\/pdf|image\/(png|jpe?g|gif|webp)|text\/plain)$/.test(type);
  return new NextResponse(new Uint8Array(f.bytes), {
    headers: {
      'Content-Type': inline ? type : 'application/octet-stream',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${f.name.replace(/["\\\r\n]/g, '')}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
