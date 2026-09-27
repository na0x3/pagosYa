import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export class SecretBoxError extends Error {}

const derive = (key: string) => createHash('sha256').update(key, 'utf8').digest();
// The key id travels in the envelope, so a rotated key reads as "unreadable", not as tampering.
const keyId = (key: string) => createHash('sha256').update(`kid:${key}`, 'utf8').digest('hex').slice(0, 8);

export function sealSecrets(key: string, value: Record<string, string>): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', derive(key), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return ['v1', keyId(key), ...[iv, cipher.getAuthTag(), body].map(part => part.toString('base64url'))].join('.');
}

export function openSecrets(key: string, envelope: string): Record<string, string> {
  const [version, kid, iv, tag, body] = envelope.split('.');
  if (version !== 'v1' || !iv || !tag || !body || kid !== keyId(key)) throw new SecretBoxError('Unreadable secrets');
  try {
    const decipher = createDecipheriv('aes-256-gcm', derive(key), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8'));
  } catch { throw new SecretBoxError('Unreadable secrets'); }
}

/** Extension credentials at rest (spec 2026-09-27 §5). */
@Injectable()
export class SecretBox {
  constructor(private readonly config: ConfigService) {}
  private key() { return this.config.get<string>('app.extensionsEncryptionKey') || 'development-only-extensions-key'; }
  seal(value: Record<string, string>) { return sealSecrets(this.key(), value); }
  open(envelope: string) { return openSecrets(this.key(), envelope); }
}
