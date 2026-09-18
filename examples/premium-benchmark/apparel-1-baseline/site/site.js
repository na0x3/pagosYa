(function(){
  var toggle=document.querySelector('.menu-toggle');
  var nav=document.querySelector('.mobile-nav');
  if(toggle&&nav){
    toggle.addEventListener('click',function(){var open=toggle.getAttribute('aria-expanded')==='true';toggle.setAttribute('aria-expanded',String(!open));nav.hidden=open;});
    nav.addEventListener('click',function(e){if(e.target.closest('a')){nav.hidden=true;toggle.setAttribute('aria-expanded','false');}});
  }
  document.addEventListener('click',function(e){
    var button=e.target.closest('[data-product-add],.product-detail__buy');
    if(!button||button.disabled)return;
    window.setTimeout(function(){
      if(button.disabled)return;
      var old=button.dataset.originalLabel||button.textContent.trim();
      button.dataset.originalLabel=old;button.textContent='Añadido ✓';button.classList.add('is-added');
      window.setTimeout(function(){button.textContent=old;button.classList.remove('is-added');},1200);
    },80);
  });
  document.addEventListener('pagosya:ready',function(){
    document.querySelectorAll('.garment-entry').forEach(function(card,i){var mark=card.querySelector('.entry-index');if(mark)mark.dataset.item=String(i+1).padStart(2,'0');});
  });
})();
