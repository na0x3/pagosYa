(function(){
  'use strict';
  function decorate(){
    document.querySelectorAll('.specimen').forEach(function(card,i){
      card.dataset.specimen=i===0?'principal':'secundario';
      var type=card.querySelector('.specimen__type');
      if(type) type.textContent=i===0?'Ficha principal / 01':'Ficha esencial / 02';
    });
  }
  document.addEventListener('pagosya:ready',decorate);
  document.addEventListener('click',function(e){
    var add=e.target.closest('[data-product-add]');
    if(!add||add.disabled)return;
    var original=add.textContent;
    window.setTimeout(function(){
      add.classList.add('is-added');
      add.textContent='Añadido al pedido';
      window.setTimeout(function(){add.classList.remove('is-added');add.textContent=original},1400);
    },80);
  });
})();
