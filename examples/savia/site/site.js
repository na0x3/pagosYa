(function(){
  var toggle=document.querySelector('.menu-toggle');
  var menu=document.getElementById('mobile-menu');
  if(toggle&&menu){
    toggle.addEventListener('click',function(){var open=toggle.getAttribute('aria-expanded')==='true';toggle.setAttribute('aria-expanded',String(!open));menu.hidden=open});
    menu.addEventListener('click',function(e){if(e.target.closest('a')){menu.hidden=true;toggle.setAttribute('aria-expanded','false')}});
  }
  document.addEventListener('click',function(e){
    var button=e.target.closest('[data-product-add]');
    if(!button)return;
    button.classList.remove('is-added');
    window.setTimeout(function(){button.classList.add('is-added');button.setAttribute('data-confirmation',button.hasAttribute('data-add')?'Agregado':'Elige tus opciones')},30);
    window.setTimeout(function(){button.classList.remove('is-added');button.removeAttribute('data-confirmation')},900);
  });
  document.addEventListener('pagosya:ready',function(){
    document.querySelectorAll('.ritual-product').forEach(function(card,i){
      var label=card.querySelector('.chapter-kicker');
      if(label)label.textContent=['Mañana','Pausa','Compañía'][i%3];
    });
  });
})();

(function(){var link=document.querySelector('.product-detail__breadcrumb a');if(link)link.href='index.html#chapter-catalog';})();
