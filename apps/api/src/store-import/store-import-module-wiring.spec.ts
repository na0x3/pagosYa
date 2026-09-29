import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import configuration from '../config/configuration';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { StoreImportController } from './store-import.controller';
import { StoreImportModule } from './store-import.module';

/**
 * The API process refused to boot once StoreImportModule was added: its controller's guards need
 * ApiKeyService and the merchant session service, which only arrive through the modules that export them.
 * Compiling the real module (with its controller) is what catches a missing import; unit tests of the service never would.
 */
describe('StoreImportModule wiring', () => {
  it('compiles with the controller and its guards resolvable', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [configuration] }), ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]), PrismaModule, StoreImportModule],
    }).overrideProvider(PrismaService).useValue({}).compile();
    expect(moduleRef.get(StoreImportController)).toBeInstanceOf(StoreImportController);
    await moduleRef.close();
  });
});
