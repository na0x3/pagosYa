import { isDeepSeek } from './source-provider';
import { BadRequestException } from '@nestjs/common';
import { CREDIT_MICRO_USD, DEFAULT_MAX_CREDITS, SOURCE_MODELS, sourceUsage, type SourceModel } from './source-generation-policy';

/** One estimated provider-cost allowance shared by conversation and all generation attempts. */
export class SourceRequestBudget {
  private spent = 0;
  constructor(readonly maxCredits = DEFAULT_MAX_CREDITS) {
    if (!Number.isInteger(maxCredits) || maxCredits < 1 || maxCredits > 500) throw new BadRequestException('El límite debe ser de 1 a 500 créditos.');
  }
  reserve(model: string, inputTokens: number, requestedOutput: number, minimumOutput = 512) {
    if (!Object.hasOwn(SOURCE_MODELS, model)) throw new BadRequestException('No hay una tarifa configurada para este modelo. Selecciona un modelo disponible para controlar el costo.');
    const pricedModel = model as SourceModel;
    const input = Math.ceil(inputTokens);
    const cost = (output: number) => sourceUsage(pricedModel, { input_tokens: input, input_tokens_details: { cache_write_tokens: input }, output_tokens: output })!.providerMicroUsd;
    const outputRate = SOURCE_MODELS[pricedModel].output * (!isDeepSeek(model) && input > 272000 ? 1.5 : 1);
    const available = this.maxCredits * CREDIT_MICRO_USD - this.spent;
    const outputTokens = Math.min(requestedOutput, Math.floor((available - cost(0)) / outputRate));
    if (outputTokens < minimumOutput) throw new BadRequestException('El límite restante no alcanza para continuar. Tu sitio sigue guardado. Puedes reducir el alcance del cambio o aumentar el límite; los intentos anteriores pueden tener costo API.');
    const reserved = cost(outputTokens);
    this.spent += reserved;
    let settled = false;
    return { outputTokens, settle: (usage: unknown) => {
      if (settled) return;
      settled = true;
      const actual = sourceUsage(pricedModel, usage);
      // Missing usage keeps the reservation: never assume an unknown call was free.
      if (actual) this.spent += actual.providerMicroUsd - reserved;
    } };
  }
}
