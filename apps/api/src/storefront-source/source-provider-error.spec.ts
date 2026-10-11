import { BadGatewayException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import {checkSourceProviderQuota, isProviderRejection, retryProviderRejection, SourceProviderQuotaException, SourceProviderRefusedException} from './source-provider-error';
it('distinguishes an authorization outage from rejection, quota and connection failures',()=>{
 for(const [status,code,text] of [[503,'chatgpt_authentication_unavailable','renovar la sesión'],[503,'chatgpt_authentication_rejected','rechazó la autorización'],[429,'limit','límite de uso'],[503,'chatgpt_connection_unavailable','conectar con ChatGPT']] as const){
  expect(()=>checkSourceProviderQuota(status,{error:{code}},'ChatGPT plan')).toThrow(text);
 }
});

describe('provider rejection retry (spec 2026-10-11 amendment "two cards")', () => {
  const rejected = (): unknown => { try { checkSourceProviderQuota(401, { error: { code: 'chatgpt_authentication_rejected' } }, 'ChatGPT plan'); } catch (error) { return error; } throw new Error('expected a throw'); };
  const limited = (): unknown => { try { checkSourceProviderQuota(429, {}, 'ChatGPT plan'); } catch (error) { return error; } throw new Error('expected a throw'); };
  afterEach(() => jest.useRealTimers());

  it('knows a rejection: quota, ChatGPT authorization rejected or usage limit, also as the cause of a wrapped error', () => {
    expect(isProviderRejection(new SourceProviderQuotaException('OpenAI'))).toBe(true);
    expect(isProviderRejection(rejected())).toBe(true);
    expect(isProviderRejection(limited())).toBe(true);
    expect(isProviderRejection(new BadGatewayException('No se completó la exploración visual.', { cause: rejected() }))).toBe(true);
    expect(isProviderRejection(new ServiceUnavailableException('YAPI no pudo continuar: ChatGPT no respondió dentro del tiempo disponible.'))).toBe(false);
    // Detected by type, never by the merchant copy: the same text on a plain 503 is not a refusal, and a reworded refusal still is.
    expect(isProviderRejection(new ServiceUnavailableException('YAPI no pudo continuar: ChatGPT rechazó la autorización. Vuelve a conectar tu cuenta de ChatGPT.'))).toBe(false);
    expect(isProviderRejection(new SourceProviderRefusedException('Cualquier texto nuevo'))).toBe(true);
    expect(isProviderRejection(new BadGatewayException('YAPI no logró armar una propuesta de diseño válida en este intento.'))).toBe(false);
    expect(isProviderRejection(new BadRequestException('x'))).toBe(false);
    expect(isProviderRejection(new DOMException('aborted', 'AbortError'))).toBe(false);
    expect(isProviderRejection(undefined)).toBe(false);
  });

  it('throws the refusals as their own 503 type with the merchant message unchanged', () => {
    const auth = rejected() as SourceProviderRefusedException, limit = limited() as SourceProviderRefusedException;
    for (const error of [auth, limit]) {
      expect(error).toBeInstanceOf(SourceProviderRefusedException);
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(error.code).toBe('provider_refused');
      expect(error.getStatus()).toBe(503);
    }
    expect(auth.message).toBe('YAPI no pudo continuar: ChatGPT rechazó la autorización. Vuelve a conectar tu cuenta de ChatGPT. No se cambió a una API de pago. Tu sitio sigue guardado.');
    expect(limit.message).toBe('YAPI no pudo continuar: ChatGPT indicó un límite de uso. Revisa ChatGPT → Ajustes → Uso antes de reintentar. No se cambió a una API de pago. Tu sitio sigue guardado.');
    let other: unknown;
    try { checkSourceProviderQuota(503, { error: { code: 'chatgpt_request_timeout' } }, 'ChatGPT plan'); } catch (error) { other = error; }
    expect(other).toBeInstanceOf(ServiceUnavailableException);
    expect(other).not.toBeInstanceOf(SourceProviderRefusedException);
  });

  it('waits 3 s and retries a rejected call once', async () => {
    jest.useFakeTimers();
    const call = jest.fn().mockRejectedValueOnce(rejected()).mockResolvedValueOnce('ok');
    const result = retryProviderRejection(call);
    await jest.advanceTimersByTimeAsync(2999);
    expect(call).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe('ok');
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('retries only once, and never a validation failure or an abort', async () => {
    jest.useFakeTimers();
    const twice = jest.fn().mockRejectedValue(rejected());
    const failed = retryProviderRejection(twice);
    failed.catch(() => undefined);
    await jest.advanceTimersByTimeAsync(3000);
    await expect(failed).rejects.toThrow('rechazó la autorización');
    expect(twice).toHaveBeenCalledTimes(2);
    const invalid = jest.fn().mockRejectedValue(new BadGatewayException('YAPI no logró armar estilos válidos en este intento.'));
    await expect(retryProviderRejection(invalid)).rejects.toThrow('estilos válidos');
    expect(invalid).toHaveBeenCalledTimes(1);
    const controller = new AbortController();
    controller.abort();
    const aborted = jest.fn().mockRejectedValue(rejected());
    await expect(retryProviderRejection(aborted, { signal: controller.signal })).rejects.toThrow('rechazó la autorización');
    expect(aborted).toHaveBeenCalledTimes(1);
  });

  it('stops waiting when the signal aborts during the pause', async () => {
    jest.useFakeTimers();
    const controller = new AbortController();
    const call = jest.fn().mockRejectedValueOnce(limited()).mockResolvedValueOnce('ok');
    const result = retryProviderRejection(call, { signal: controller.signal });
    result.catch(() => undefined);
    await jest.advanceTimersByTimeAsync(1000);
    controller.abort(new Error('stopped'));
    await expect(result).rejects.toThrow('stopped');
    expect(call).toHaveBeenCalledTimes(1);
  });
});
