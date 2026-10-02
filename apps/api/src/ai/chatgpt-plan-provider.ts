import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

/** Resolve only the local bridge credential. OAuth tokens stay in its process. */
export function chatgptPlanProvider(config: ConfigService, model: string) {
  const plan = config.get<{ url: string; secret: string }>('app.chatgptPlan');
  if (!plan || typeof plan !== 'object') return undefined;
  if (config.get('app.environment') !== 'development' || !plan.secret) throw new ServiceUnavailableException('La conexión con ChatGPT solo está disponible en desarrollo local.');
  if (!model.startsWith('gpt-')) throw new BadRequestException('El modo ChatGPT local requiere un modelo GPT. Claude y DeepSeek usan API de pago y están desactivados.');
  return { name: 'ChatGPT plan', apiKey: plan.secret, endpoint: plan.url };
}
