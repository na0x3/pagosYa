(function(){
  function markAdded(button){
    if(!button)return;
    button.classList.add('is-added');
    var label=button.querySelector('span');
    if(label)label.textContent='Añadido';
    window.setTimeout(function(){
      button.classList.remove('is-added');
      if(label)label.textContent='Añadir';
    },1400);
  }
  document.addEventListener('click',function(event){
    var add=event.target.closest('[data-product-add]');
    if(add)window.setTimeout(function(){markAdded(add)},80);
  });
  document.addEventListener('pagosya:ready',function(){
    document.querySelectorAll('.bench-product').forEach(function(card,index){
      if(card.dataset.pointReady)return;
      card.dataset.pointReady='true';
      var mark=card.querySelector('.measure-mark');
      if(mark)mark.textContent='VISTA / '+String(index+1).padStart(2,'0');
    });
  });
})();