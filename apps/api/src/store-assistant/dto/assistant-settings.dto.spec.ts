import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AssistantTestDto } from './assistant-settings.dto';

describe('AssistantTestDto', () => {
  it('accepts an ordinary question', async () => {
    await expect(validate(plainToInstance(AssistantTestDto, { message: '¿Hacen envíos?' }))).resolves.toHaveLength(0);
  });

  it('rejects a message that is only whitespace', async () => {
    expect(await validate(plainToInstance(AssistantTestDto, { message: '   \n ' }))).not.toHaveLength(0);
  });
});
