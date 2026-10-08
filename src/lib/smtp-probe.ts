import 'server-only';
import net from 'net';
import tls from 'tls';

/**
 * Minimal SMTP client for diagnostics: does exactly what Supabase Auth's custom
 * SMTP does (connect, EHLO, AUTH, MAIL/RCPT/DATA) and returns the transcript with
 * credentials redacted. Port 465 = implicit TLS, 587 = STARTTLS.
 */
export async function smtpProbe(opts: {
  host: string;
  port: 465 | 587;
  user: string;
  pass: string;
  from: string;
  to: string;
  timeoutMs?: number;
}): Promise<{ ok: boolean; transcript: string[]; error?: string; ms: number }> {
  const started = performance.now();
  const transcript: string[] = [];
  const timeoutMs = opts.timeoutMs ?? 15_000;
  let sock!: net.Socket | tls.TLSSocket;
  let buffer = '';
  let waiter: ((line: string) => void) | null = null;

  const onData = (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    // A reply is complete when a line has "NNN " (space, not dash) after the code.
    const lines = buffer.split('\r\n');
    for (let i = 0; i < lines.length - 1; i++) {
      if (/^\d{3} /.test(lines[i])) {
        const reply = lines.slice(0, i + 1).join('\n');
        buffer = lines.slice(i + 1).join('\r\n');
        transcript.push(`S: ${reply}`);
        const w = waiter;
        waiter = null;
        w?.(reply);
        return;
      }
    }
  };

  const read = () =>
    new Promise<string>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms waiting for the server`)), timeoutMs);
      waiter = (line) => {
        clearTimeout(t);
        resolve(line);
      };
    });

  const send = async (cmd: string, shown = cmd) => {
    transcript.push(`C: ${shown}`);
    sock.write(`${cmd}\r\n`);
    return read();
  };
  const expect = (reply: string, code: string) => {
    if (!reply.startsWith(code)) throw new Error(`expected ${code}, got: ${reply.split('\n').pop()}`);
  };

  try {
    sock =
      opts.port === 465
        ? tls.connect({ host: opts.host, port: 465, servername: opts.host })
        : net.connect({ host: opts.host, port: opts.port });
    sock.on('data', onData);
    sock.on('error', (e) => transcript.push(`! socket error: ${e.message}`));
    expect(await read(), '220');
    let ehlo = await send('EHLO heliaxis.co.uk');
    expect(ehlo, '250');

    if (opts.port === 587) {
      expect(await send('STARTTLS'), '220');
      sock.removeListener('data', onData);
      sock = tls.connect({ socket: sock as net.Socket, servername: opts.host });
      sock.on('data', onData);
      await new Promise<void>((res, rej) => {
        (sock as tls.TLSSocket).once('secureConnect', () => res());
        (sock as tls.TLSSocket).once('error', rej);
      });
      transcript.push('-- TLS upgraded');
      ehlo = await send('EHLO heliaxis.co.uk');
      expect(ehlo, '250');
    }

    const plain = Buffer.from(`\0${opts.user}\0${opts.pass}`).toString('base64');
    expect(await send(`AUTH PLAIN ${plain}`, 'AUTH PLAIN <redacted>'), '235');
    expect(await send(`MAIL FROM:<${opts.from}>`), '250');
    expect(await send(`RCPT TO:<${opts.to}>`), '250');
    expect(await send('DATA'), '354');
    const msg = [
      `From: Heliaxis <${opts.from}>`,
      `To: <${opts.to}>`,
      'Subject: Heliaxis SMTP test (same path as Supabase Auth)',
      'Content-Type: text/plain; charset=utf-8',
      '',
      `Sent over SMTP via ${opts.host}:${opts.port}. If this arrived, these SMTP settings work.`,
      '.',
    ].join('\r\n');
    expect(await send(msg, '<message body>'), '250');
    await send('QUIT').catch(() => '');
    sock.end();
    return { ok: true, transcript, ms: Math.round(performance.now() - started) };
  } catch (e) {
    try {
      sock?.destroy();
    } catch {
      /* ignore */
    }
    return { ok: false, transcript, error: e instanceof Error ? e.message : String(e), ms: Math.round(performance.now() - started) };
  }
}
