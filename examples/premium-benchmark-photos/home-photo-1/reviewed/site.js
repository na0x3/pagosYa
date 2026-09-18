(function(){
  'use strict';
  var lastAdd=null;
  document.addEventListener('click',function(e){var b=e.target.closest('[data-product-add],.product-detail__buy');if(b)lastAdd=b;});
  var status=document.querySelector('[data-pagosya-status]');
  if(status){new MutationObserver(function(){var text=status.textContent.trim().toLowerCase();if(lastAdd&&/(añad|agreg|pedido)/.test(text)){lastAdd.classList.add('is-added');lastAdd.setAttribute('data-original-label',lastAdd.textContent);lastAdd.textContent='Añadido al pedido';window.setTimeout(function(){if(!lastAdd)return;lastAdd.textContent=lastAdd.getAttribute('data-original-label')||'Añadir al pedido';lastAdd.classList.remove('is-added');lastAdd=null;},1800);}}).observe(status,{childList:true,subtree:true,characterData:true});}
  document.addEventListener('pagosya:ready',function(){
    if(!document.body.classList.contains('home-page'))return;
    var cards=document.querySelectorAll('[data-pagosya-catalog] .editorial-product');
    cards.forEach(function(card){var name=(card.querySelector('[data-product-field="name"]')||{}).textContent||'';var img=card.querySelector('[data-product-field="image"]');if(!img)return;if(name.indexOf('Funda')>-1){img.src='assets/image-e58bfe385a7a.jpg';img.alt='Funda de cojín terracota en un sofá claro';}if(name.indexOf('Manta')>-1){img.src='assets/image-f82f55029d51.jpg';img.alt='Manta de algodón con flecos sobre un sillón';}});
  });
})();