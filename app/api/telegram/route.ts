import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { extractProjectFields, FIELD_TO_COLUMN, type ProjectFields } from '@/lib/extractProject';

export const runtime = 'nodejs';

// How long a burst of messages from the same chat is treated as ONE project
const ACTIVE_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

const HELP = [
  'Send a real install to the Post Studio 👇',
  '',
  '• Type the details — e.g. “New install in Pontypridd, 6.4 kWp, 16 Aiko panels, GivEnergy 9.5 kWh battery, saves ~£900/yr”. I’ll pull out the figures.',
  '• Send one or more photos (a caption works as the details too).',
  '• Everything you send in the next couple of hours adds to the same project.',
  '• Send /new to start a fresh project, or /done when finished.',
].join('\n');

function tgUrl(token: string, method: string) {
  return `https://api.telegram.org/bot${token}/${method}`;
}
async function tgCall(token: string, method: string, params: Record<string, unknown>) {
  const r = await fetch(tgUrl(token, method), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
  return r.json().catch(() => ({}));
}
async function sendMessage(token: string, chatId: number | string, text: string) {
  await tgCall(token, 'sendMessage', { chat_id: chatId, text });
}
async function downloadAsDataUrl(token: string, fileId: string): Promise<string> {
  const info = await tgCall(token, 'getFile', { file_id: fileId });
  const path = info?.result?.file_path;
  if (!path) throw new Error('no file_path');
  const r = await fetch(`https://api.telegram.org/file/bot${token}/${path}`);
  if (!r.ok) throw new Error('download failed');
  const buf = Buffer.from(await r.arrayBuffer());
  const ext = String(path).split('.').pop()?.toLowerCase() || 'jpg';
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function isAllowed(chatId: number, fromId?: number, username?: string) {
  const raw = process.env.TELEGRAM_ALLOWED || '';
  const allow = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!allow.length) return false; // locked until an admin configures the allowlist
  const cands = [
    String(chatId),
    fromId != null ? String(fromId) : '',
    username ? `@${username}`.toLowerCase() : '',
    username ? username.toLowerCase() : '',
  ].filter(Boolean);
  return cands.some((c) => allow.includes(c));
}

export async function POST(req: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  // verify the request really came from Telegram (secret set at registration)
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return new NextResponse('forbidden', { status: 401 });
  }
  if (!token) return NextResponse.json({ ok: true }); // nothing configured; don't make TG retry

  let update: any;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }
  const msg = update?.message || update?.edited_message;
  if (!msg?.chat?.id) return NextResponse.json({ ok: true });

  const chatId: number = msg.chat.id;
  const fromId: number | undefined = msg.from?.id;
  const username: string | undefined = msg.from?.username;

  if (!isAllowed(chatId, fromId, username)) {
    await sendMessage(
      token,
      chatId,
      `Sorry — you're not authorised to add projects.\nYour Telegram ID is: ${fromId ?? chatId}\nAsk an admin to add it to TELEGRAM_ALLOWED.`
    );
    return NextResponse.json({ ok: true });
  }

  // ---- commands ----
  const rawText: string = (msg.text || msg.caption || '').trim();
  let forceNew = false;
  let text = rawText;
  if (rawText.startsWith('/')) {
    const [cmd, ...rest] = rawText.split(/\s+/);
    const arg = rest.join(' ').trim();
    if (/^\/(start|help)\b/i.test(cmd)) {
      await sendMessage(token, chatId, `${HELP}\n\nYour Telegram ID: ${fromId ?? chatId}`);
      return NextResponse.json({ ok: true });
    }
    if (/^\/new\b/i.test(cmd)) {
      forceNew = true;
      text = arg;
    } else if (/^\/done\b/i.test(cmd)) {
      await sendMessage(token, chatId, 'Done ✓ Send /new to start another project.');
      return NextResponse.json({ ok: true });
    } else {
      text = ''; // unknown command — ignore the text, still accept any photo
    }
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    await sendMessage(token, chatId, 'The tool isn’t fully configured yet (missing server keys).');
    return NextResponse.json({ ok: true });
  }

  // ---- get or create the active project for this chat ----
  const project = await getActiveProject(admin, chatId, forceNew);
  if (!project) {
    await sendMessage(
      token,
      chatId,
      'Could not open a project — the database may be missing the tg_chat_id column. Ask an admin to run the setup SQL.'
    );
    return NextResponse.json({ ok: true });
  }

  // ---- details from text ----
  let updatedFields = 0;
  if (text) {
    try {
      const fields = await extractProjectFields(text);
      const patch: Record<string, string> = {};
      (Object.keys(FIELD_TO_COLUMN) as (keyof ProjectFields)[]).forEach((camel) => {
        const v = fields[camel];
        if (v && String(v).trim()) {
          patch[FIELD_TO_COLUMN[camel]] = String(v).trim();
          updatedFields++;
        }
      });
      if (!project.name && !patch.name && patch.location) patch.name = patch.location;
      if (Object.keys(patch).length) {
        patch.updated_at = new Date().toISOString();
        await admin.from('projects').update(patch).eq('id', project.id);
        if (patch.name) project.name = patch.name;
      }
    } catch {
      /* extraction failed — still accept photos, note nothing */
    }
  }

  // ---- photos ----
  let photoCount = 0;
  const fileIds: string[] = [];
  if (Array.isArray(msg.photo) && msg.photo.length) {
    fileIds.push(msg.photo[msg.photo.length - 1].file_id); // largest size
  }
  if (msg.document && /^image\//.test(msg.document.mime_type || '')) {
    fileIds.push(msg.document.file_id);
  }
  for (const fid of fileIds) {
    try {
      const dataUrl = await downloadAsDataUrl(token, fid);
      await admin
        .from('project_images')
        .insert({ project_id: project.id, name: 'telegram', data_url: dataUrl });
      photoCount++;
    } catch {
      /* skip a failed photo */
    }
  }
  if (photoCount) {
    await admin
      .from('projects')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', project.id);
  }

  // ---- reply ----
  const name = project.name || 'Untitled project';
  const bits: string[] = [];
  if (updatedFields) bits.push(`${updatedFields} detail${updatedFields === 1 ? '' : 's'} updated`);
  if (photoCount) bits.push(`${photoCount} photo${photoCount === 1 ? '' : 's'} added`);
  const summary = bits.length ? bits.join(', ') : 'saved';
  const tail =
    !updatedFields && text
      ? '\n(couldn’t read any figures from that — try naming the town, kWp, panels, battery, savings)'
      : '';
  await sendMessage(
    token,
    chatId,
    `✓ Project “${name}” — ${summary}.${tail}\nSend more to add to it, or /new to start another.`
  );
  return NextResponse.json({ ok: true });
}

async function getActiveProject(
  admin: ReturnType<typeof createAdminClient>,
  chatId: number,
  forceNew: boolean
) {
  if (!forceNew) {
    const { data, error } = await admin
      .from('projects')
      .select('*')
      .eq('tg_chat_id', String(chatId))
      .order('updated_at', { ascending: false })
      .limit(1);
    if (error) return null; // column likely missing
    const p = data?.[0];
    if (p && Date.now() - new Date(p.updated_at).getTime() < ACTIVE_WINDOW_MS) return p;
  }
  const { data, error } = await admin
    .from('projects')
    .insert({ tg_chat_id: String(chatId), name: '' })
    .select('*')
    .single();
  if (error) return null;
  return data;
}
