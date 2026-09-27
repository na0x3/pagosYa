import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import configuration from '../config/configuration';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { ExtensionsController } from './extensions.controller';
import { ExtensionsModule } from './extensions.module';

// Compiling the real module (with its controller) catches a guard dependency missing from its imports.
describe('ExtensionsModule wiring', () => {
  it('compiles with the controller and its guards resolvable', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [configuration] }), ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]), PrismaModule, ExtensionsModule],
    }).overrideProvider(PrismaService).useValue({}).compile();
    expect(moduleRef.get(ExtensionsController)).toBeInstanceOf(ExtensionsController);
    await moduleRef.close();
  });
});
