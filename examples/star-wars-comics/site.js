(() => {
  const products = window.PAGOSYA_CONFIG.data.items;
  const covers = {
    jedi: {id:'sw-jedi',title:'Nº 01',subtitle:'UNA NUEVA ERA',image:'assets/hero.jpg',description:'Luke, Leia y Han. El Imperio ha caído, pero la galaxia todavía tiene historias que contar.',alt:'Portada de Star Wars (2025) número 1, ilustrada por Phil Noto',index:1},
    vader: {id:'sw-vader',title:'DARTH VADER',subtitle:'LA SOMBRA DEL IMPERIO',image:'assets/vader.jpg',description:'Un casco negro. Un sable rojo. Hay historias que se cuentan desde el otro lado de la Fuerza.',alt:'Portada de Darth Vader (2020) número 1, ilustrada por In-Hyuk Lee',index:2},
    mando: {id:'sw-mando',title:'MANDALORIAN',subtitle:'EL CAMINO A CASA',image:'assets/mando.jpg',description:'Un cazarrecompensas, un pequeño compañero y el camino más largo de la galaxia.',alt:'Portada variante de The Mandalorian (2022) número 1, ilustrada por Leinil Francis Yu',index:3}
  };
  let selected = 'jedi';
  const money = amount => `Bs ${amount / 100}`;
  function updateFeature() {
    const cover = covers[selected], single = products.find(p => p.id === cover.id);
    const collection = document.querySelector('[name=edition]:checked')?.value === 'collection';
    const product = collection ? products.find(p => p.id === 'sw-collection') : single;
    const set = (selector,text) => { const node=document.querySelector(selector); if(node) node.textContent=text; };
    document.querySelectorAll('[data-cover]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.cover === selected)));
    const photo=document.querySelector('[data-feature-image]');
    if(photo) { photo.src=cover.image;photo.alt=cover.alt;photo.closest('figure').classList.toggle('is-cover',selected!=='jedi'); }
    set('[data-feature-title]',cover.title);set('[data-feature-subtitle]',cover.subtitle);set('[data-feature-description]',cover.description);
    set('[data-cover-count]',`${cover.index} / 3`);set('[data-selected-name]',single.name);set('[data-single-price]',money(single.amount));set('[data-feature-price]',money(product.amount));
    const buy=document.querySelector('[data-feature-buy]');if(buy) buy.dataset.add=product.id;
    const link=document.querySelector('[data-feature-link]');if(link)link.href=`product.html?id=${encodeURIComponent(product.id)}`;
  }
  document.querySelectorAll('[data-cover]').forEach(button=>button.addEventListener('click',()=>{ selected=button.dataset.cover;updateFeature(); }));
  document.querySelectorAll('[name=edition]').forEach(input=>input.addEventListener('change',updateFeature));
  function decorateCollection() {
    const art=document.querySelector('[data-product-id=sw-collection] .comic-art');
    if (!art || art.children.length > 1) return;
    for (const src of ['assets/vader.jpg','assets/mando.jpg']) {
      const image=document.createElement('img');image.src=src;image.alt='';image.loading='lazy';art.append(image);
    }
    art.querySelector('img').alt='Colección de tres cómics: Star Wars, Darth Vader y The Mandalorian';
  }
  document.addEventListener('pagosya:ready',decorateCollection);decorateCollection();
  const search=document.querySelector('#comic-search');
  function filter() {
    if(!search)return;
    const query=search.value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    let visible=0;
    document.querySelectorAll('[data-pagosya-catalog] [data-product-id]').forEach(card=>{
      const text=card.textContent.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();card.hidden=!text.includes(query);if(!card.hidden)visible++;
    });
    document.querySelector('[data-search-empty]').hidden=visible>0;
    document.querySelector('[data-search-count]').textContent=`${visible} ${visible===1?'RESULTADO':'RESULTADOS'}`;
  }
  search?.addEventListener('input',filter);
  document.querySelector('.catalog-search')?.addEventListener('submit',event=>{event.preventDefault();filter();document.querySelector('[data-pagosya-catalog]')?.scrollIntoView({block:'start'});});
  document.querySelector('.search-link')?.addEventListener('click',()=>{if(search)window.setTimeout(()=>search.focus(),0);});
  document.addEventListener('pagosya:ready',filter);
  if(document.querySelector('[data-feature-buy]'))updateFeature();
})();
