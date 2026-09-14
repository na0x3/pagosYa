(function(){
  function initMenu(){
    var button=document.querySelector('.menu-toggle');
    var nav=document.getElementById('site-navigation');
    if(!button||!nav)return;
    button.addEventListener('click',function(){
      var open=button.getAttribute('aria-expanded')==='true';
      button.setAttribute('aria-expanded',String(!open));
      nav.classList.toggle('is-open',!open);
    });
    nav.addEventListener('click',function(e){if(e.target.closest('a')){button.setAttribute('aria-expanded','false');nav.classList.remove('is-open')}});
    document.addEventListener('keydown',function(e){if(e.key==='Escape'){button.setAttribute('aria-expanded','false');nav.classList.remove('is-open');button.focus()}});
  }
  function decorateCatalog(){
    document.querySelectorAll('[data-pagosya-catalog] .menu-item').forEach(function(card,index){
      card.classList.add('catalog-product--'+(index+1));
    });
  }
  function purchaseFeedback(e){
    var button=e.target.closest('[data-product-add],.product-detail__buy');
    if(!button||button.disabled)return;
    button.classList.remove('just-added');
    window.requestAnimationFrame(function(){button.classList.add('just-added')});
    window.setTimeout(function(){button.classList.remove('just-added')},1800);
  }
  document.addEventListener('DOMContentLoaded',initMenu);
  document.addEventListener('click',purchaseFeedback);
  document.addEventListener('pagosya:ready',decorateCatalog);
})();
