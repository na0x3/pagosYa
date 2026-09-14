(function(){
  'use strict';
  var originalLabels=new WeakMap();
  document.addEventListener('click',function(event){
    var button=event.target.closest('[data-product-add]');
    if(!button||button.disabled)return;
    var label=button.querySelector('span')||button;
    if(!originalLabels.has(button))originalLabels.set(button,label.textContent);
    window.setTimeout(function(){
      if(!button.isConnected)return;
      label.textContent='Añadido';
      button.classList.add('is-added');
      button.setAttribute('aria-label','Añadido al pedido');
      window.setTimeout(function(){
        if(!button.isConnected)return;
        label.textContent=originalLabels.get(button)||'Añadir';
        button.classList.remove('is-added');
        button.removeAttribute('aria-label');
      },1100);
    },80);
  });

  document.addEventListener('pagosya:ready',function(){
    document.querySelectorAll('.drink-row').forEach(function(row,index){
      row.setAttribute('data-row',String(index+1).padStart(2,'0'));
    });
  });
})();
