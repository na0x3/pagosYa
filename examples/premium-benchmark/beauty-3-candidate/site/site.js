(function(){
  var toggle=document.querySelector('.menu-toggle');
  var nav=document.querySelector('.site-nav');
  if(toggle&&nav){
    toggle.addEventListener('click',function(){
      var open=toggle.getAttribute('aria-expanded')==='true';
      toggle.setAttribute('aria-expanded',String(!open));
      nav.classList.toggle('is-open',!open);
    });
    nav.addEventListener('click',function(){toggle.setAttribute('aria-expanded','false');nav.classList.remove('is-open')});
  }

  var pending=null;
  document.addEventListener('click',function(e){
    var button=e.target.closest('[data-product-add]');
    if(button) pending=button;
  },true);

  var counts=document.querySelectorAll('[data-cart-count]');
  if(counts.length&&window.MutationObserver){
    new MutationObserver(function(){
      if(!pending)return;
      pending.classList.add('is-confirmed');
      var original=pending.dataset.originalLabel||pending.textContent.trim();
      pending.dataset.originalLabel=original;
      pending.textContent='Añadido';
      var current=pending;
      pending=null;
      setTimeout(function(){current.classList.remove('is-confirmed');current.textContent=current.dataset.originalLabel||'Añadir'},1200);
    }).observe(counts[0],{childList:true,subtree:true,characterData:true});
  }

  document.addEventListener('pagosya:ready',function(){
    document.querySelectorAll('.counter-product').forEach(function(card){
      var mark=card.querySelector('.volume-mark');
      if(!mark||mark.dataset.ready)return;
      var options=card.querySelector('.product-choice');
      var match=options&&options.textContent.match(/\b(\d+)\s*ml/i);
      mark.textContent=match?match[1]:'ml';
      mark.dataset.ready='true';
    });
  });
})();