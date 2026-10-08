import tls from 'node:tls';
import { createInterface } from 'node:readline';

export type SmtpMessage = {
  toEmail: string;
  toName?: string | null;
  subject: string;
  text: string;
  html: string;
};

export type SmtpConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string | null;
};

const cleanHeader = (value: unknown) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();

const encodeHeader = (value: string) => {
  const cleaned = cleanHeader(value);
  return /^[\x20-\x7E]*$/.test(cleaned)
    ? cleaned
    : '=?UTF-8?B?' + Buffer.from(cleaned, 'utf8').toString('base64') + '?=';
};

const encodeBody = (value: string) => {
  const encoded = Buffer.from(value, 'utf8').toString('base64');
  return encoded.match(/.{1,76}/g)?.join('\r\n') ?? '';
};

const formatAddress = (emailValue: string, nameValue?: string | null) => {
  const email = cleanHeader(emailValue);
  const name = cleanHeader(nameValue);
  return name ? '"' + name.replace(/"/g, '\\"') + '" <' + email + '>' : '<' + email + '>';
};

const buildMimeMessage = (config: SmtpConfig, message: SmtpMessage) => {
  const boundary = 'nightjar_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
  const headers = [
    'From: ' + formatAddress(config.fromEmail, config.fromName),
    'To: ' + formatAddress(message.toEmail, message.toName),
    'Subject: ' + encodeHeader(message.subject),
    'Date: ' + new Date().toUTCString(),
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="' + boundary + '"',
    ...(config.replyTo ? ['Reply-To: ' + formatAddress(config.replyTo)] : []),
  ];

  const body = [
    '--' + boundary,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    encodeBody(message.text),
    '--' + boundary,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    encodeBody(message.html),
    '--' + boundary + '--',
    '',
  ].join('\r\n');

  return [...headers, '', body].join('\r\n')
    .split('\r\n')
    .map((line) => line.startsWith('.') ? '.' + line : line)
    .join('\r\n');
};

type LineIterator = AsyncIterator<string>;

const readResponse = async (iterator: LineIterator, expected?: number[]) => {
  const lines: string[] = [];
  let code = 0;

  while (true) {
    const next = await iterator.next();
    if (next.done) throw new Error('SMTP connection closed unexpectedly.');
    const line = String(next.value ?? '');
    lines.push(line);
    const match = /^(\d{3})([ -])/.exec(line);
    if (!match) continue;
    code = Number(match[1]);
    if (match[2] === ' ') break;
  }

  if (expected?.length && !expected.includes(code)) {
    throw new Error('SMTP ' + code + ': ' + lines.join(' | ').slice(0, 600));
  }

  return { code, lines };
};

const writeCommand = async (
  socket: tls.TLSSocket,
  iterator: LineIterator,
  command: string,
  expected: number[],
) => {
  socket.write(command + '\r\n');
  return readResponse(iterator, expected);
};

export class SmtpSession {
  private socket: tls.TLSSocket | null = null;
  private lineReader: ReturnType<typeof createInterface> | null = null;
  private iterator: LineIterator | null = null;

  constructor(private readonly config: SmtpConfig) {}

  async connect() {
    if (this.socket && !this.socket.destroyed && this.iterator) return;

    const socket = tls.connect({
      host: this.config.host,
      port: this.config.port,
      servername: this.config.host,
      rejectUnauthorized: true,
    });

    socket.setTimeout(30_000);
    await new Promise<void>((resolve, reject) => {
      const onSecure = () => {
        cleanup();
        resolve();
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const onTimeout = () => {
        cleanup();
        socket.destroy(new Error('SMTP connection timed out.'));
        reject(new Error('SMTP connection timed out.'));
      };
      const cleanup = () => {
        socket.off('secureConnect', onSecure);
        socket.off('error', onError);
        socket.off('timeout', onTimeout);
      };
      socket.once('secureConnect', onSecure);
      socket.once('error', onError);
      socket.once('timeout', onTimeout);
    });

    const reader = createInterface({ input: socket, crlfDelay: Infinity });
    const iterator = reader[Symbol.asyncIterator]();
    this.socket = socket;
    this.lineReader = reader;
    this.iterator = iterator;

    await readResponse(iterator, [220]);
    await writeCommand(socket, iterator, 'EHLO nightjar.app', [250]);
    await writeCommand(socket, iterator, 'AUTH LOGIN', [334]);
    await writeCommand(socket, iterator, Buffer.from(this.config.username, 'utf8').toString('base64'), [334]);
    await writeCommand(socket, iterator, Buffer.from(this.config.password, 'utf8').toString('base64'), [235]);
  }

  async send(message: SmtpMessage) {
    await this.connect();
    if (!this.socket || !this.iterator) throw new Error('SMTP session is unavailable.');

    const socket = this.socket;
    const iterator = this.iterator;

    try {
      await writeCommand(socket, iterator, 'MAIL FROM:<' + this.config.fromEmail + '>', [250]);
      await writeCommand(socket, iterator, 'RCPT TO:<' + message.toEmail + '>', [250, 251]);
      await writeCommand(socket, iterator, 'DATA', [354]);
      socket.write(buildMimeMessage(this.config, message) + '\r\n.\r\n');
      await readResponse(iterator, [250]);
    } catch (error) {
      try {
        if (!socket.destroyed) await writeCommand(socket, iterator, 'RSET', [250]);
      } catch {
        this.close();
      }
      throw error;
    }
  }

  async quit() {
    if (!this.socket || !this.iterator || this.socket.destroyed) {
      this.close();
      return;
    }
    try {
      await writeCommand(this.socket, this.iterator, 'QUIT', [221]);
    } catch {
      // Closing the socket is sufficient if the server has already ended the session.
    } finally {
      this.close();
    }
  }

  close() {
    this.lineReader?.close();
    this.socket?.destroy();
    this.lineReader = null;
    this.socket = null;
    this.iterator = null;
  }
}
