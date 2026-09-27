import type { ExtensionManifest } from '../extension';

export const pinterestTag: ExtensionManifest = {
  id: 'pinterest-tag', name: 'Pinterest Tag', category: 'ads', tier: 'free', logo: 'pinterest',
  summary: 'Mide tus anuncios de Pinterest.', description: 'Registra visitas y compras para medir tus campañas y crear audiencias en Pinterest. Solo carga si el comprador acepta las estadísticas.',
  docsUrl: 'https://help.pinterest.com/es/business/article/install-the-pinterest-tag',
  settings: [{ key: 'id', label: 'ID de la etiqueta', type: 'text', required: true, placeholder: '2612345678901', pattern: /^[0-9]{10,20}$/, normalize: value => value.trim(), where: 'Pinterest Ads → Conversiones → Administrador de etiquetas → ID de la etiqueta.' }],
  storefrontLoader: `function(c,tag,on){if(!w.pintrk){w.pintrk=function(){w.pintrk.queue.push(Array.prototype.slice.call(arguments))};w.pintrk.queue=[];w.pintrk.version='3.0';tag('https://s.pinimg.com/ct/core.js');}w.pintrk('load',c.id);w.pintrk('page');on('purchase',function(p){w.pintrk('track','checkout',{value:p.value,currency:p.currency,order_id:p.orderId,event_id:p.orderId})})}`,
};
