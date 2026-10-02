import {checkSourceProviderQuota} from './source-provider-error';
it('distinguishes an authorization outage from rejection, quota and connection failures',()=>{
 for(const [status,code,text] of [[503,'chatgpt_authentication_unavailable','renovar la sesión'],[503,'chatgpt_authentication_rejected','rechazó la autorización'],[429,'limit','límite de uso'],[503,'chatgpt_connection_unavailable','conectar con ChatGPT']] as const){
  expect(()=>checkSourceProviderQuota(status,{error:{code}},'ChatGPT plan')).toThrow(text);
 }
});
