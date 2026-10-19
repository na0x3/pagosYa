import { ValidationPipe } from '@nestjs/common';
import { SendSourceMessageDto } from './send-source-message.dto';

// Review fix: personalTouch is set only by the job runner's follow-up; a client sending it is rejected like any unknown field.
it('a client cannot send personalTouch', async () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true, transform: true });
  await expect(pipe.transform({ instruction: 'Hola', revision: 1, personalTouch: true }, { type: 'body', metatype: SendSourceMessageDto })).rejects.toBeTruthy();
  const ok = await pipe.transform({ instruction: 'Hola', revision: 1 }, { type: 'body', metatype: SendSourceMessageDto }).catch((error: any) => error.getResponse());
  expect(ok).toMatchObject({ instruction: 'Hola' });
});
