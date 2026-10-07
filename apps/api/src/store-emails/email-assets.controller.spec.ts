import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { EmailAssetsController } from './email-assets.controller';

describe('public email icons', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [EmailAssetsController] }).compile();
    app = moduleRef.createNestApplication(); await app.init();
  });
  afterAll(() => app.close());
  it('serves a PNG with a long cache', async () => {
    const res = await request(app.getHttpServer()).get('/v1/email-assets/icons/truck-dark.png').expect(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toContain('max-age=31536000');
    expect(Buffer.from(res.body).subarray(1, 4).toString()).toBe('PNG');
  });
  it('404s anything outside the icon set', async () => {
    for (const path of ['nope-dark.png', 'truck-blue.png', '..%2Fblocks.html', 'truck-dark.svg']) await request(app.getHttpServer()).get(`/v1/email-assets/icons/${path}`).expect(404);
  });
});
