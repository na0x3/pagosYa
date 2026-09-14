(function(){
  function setupMenu(){
    var button=document.querySelector('.menu-toggle');
    var nav=document.querySelector('.site-nav');
    if(!button||!nav)return;
    button.addEventListener('click',function(){var open=button.getAttribute('aria-expanded')==='true';button.setAttribute('aria-expanded',String(!open));nav.classList.toggle('is-open',!open)});
    nav.addEventListener('click',function(){button.setAttribute('aria-expanded','false');nav.classList.remove('is-open')});
  }
  function decorateCatalog(){
    document.querySelectorAll('.product-stripe').forEach(function(card){
      var title=card.querySelector('[data-product-field="name"]');
      var mark=card.querySelector('[data-volume-mark]');
      if(!title||!mark||mark.dataset.ready)return;
      var name=title.textContent.trim().toLowerCase();
      mark.innerHTML=name.indexOf('crema')>-1?'30<small>ml</small>':name.indexOf('jabón')>-1?'250<small>ml</small>':'';
      mark.dataset.ready='true';
    });
  }
  function setupAddFeedback(){
    document.addEventListener('click',function(event){
      var button=event.target.closest('[data-product-add]');
      if(!button)return;
      var original=button.innerHTML;
      window.setTimeout(function(){button.classList.add('is-added');button.textContent='Añadido';window.setTimeout(function(){button.classList.remove('is-added');button.innerHTML=original},1200)},80);
    });
  }
  document.addEventListener('DOMContentLoaded',function(){setupMenu();setupAddFeedback();decorateCatalog()});
  document.addEventListener('pagosya:ready',decorateCatalog);
})();