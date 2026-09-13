import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
@Injectable()
export class PrivateFilesService {
  private readonly client: S3Client | null; private readonly bucket: string;
  constructor(private readonly config: ConfigService) {
    this.bucket = config.get<string>('app.objectStorage.privateBucket') || '';
    const endpoint = config.get<string>('app.objectStorage.endpoint'), accessKeyId = config.get<string>('app.objectStorage.accessKeyId'), secretAccessKey = config.get<string>('app.objectStorage.secretAccessKey');
    this.client = this.bucket && endpoint && accessKeyId && secretAccessKey ? new S3Client({ endpoint, region: config.get<string>('app.objectStorage.region') || 'us-east-1', forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } }) : null;
  }
  private path(key: string) { if (!/^[a-f\d-]{36}$/.test(key)) throw new NotFoundException(); return join(this.config.get<string>('app.uploadsDir')!, 'private', key); }
  async put(bytes: Buffer, mime: string) {
    if (this.bucket && this.bucket === this.config.get<string>('app.objectStorage.bucket')) throw new ServiceUnavailableException('Usa un bucket separado y privado para las descargas.');
    if (!this.client && this.config.get<string>('app.environment') === 'production') throw new ServiceUnavailableException('Configura un bucket privado para vender archivos digitales.');
    const key = randomUUID();
    if (this.client) await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: `private/${key}`, Body: bytes, ContentType: mime }));
    else { await mkdir(join(this.config.get<string>('app.uploadsDir')!, 'private'), { recursive: true }); await writeFile(this.path(key), bytes, { flag: 'wx', mode: 0o600 }); }
    return key;
  }
  async get(key: string) {
    this.path(key);
    try { if (!this.client) return await readFile(this.path(key)); const value = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: `private/${key}` })); return Buffer.from(await value.Body!.transformToByteArray()); }
    catch { throw new NotFoundException('El archivo ya no está disponible.'); }
  }
  async remove(key: string) { this.path(key); if (this.client) await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: `private/${key}` })); else await unlink(this.path(key)).catch(() => {}); }
}
