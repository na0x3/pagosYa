(function(){
  var toggle=document.querySelector('.menu-toggle');
  var nav=document.querySelector('.site-nav');
  if(toggle&&nav){
    toggle.addEventListener('click',function(){var open=toggle.getAttribute('aria-expanded')==='true';toggle.setAttribute('aria-expanded',String(!open));nav.classList.toggle('is-open',!open);});
    nav.addEventListener('click',function(e){if(e.target.closest('a')){toggle.setAttribute('aria-expanded','false');nav.classList.remove('is-open');}});
  }
  document.addEventListener('click',function(e){
    var button=e.target.closest('[data-product-add]');
    if(!button||button.disabled)return;
    var original=button.textContent;
    button.classList.add('is-added');button.textContent='Añadido';
    window.setTimeout(function(){button.classList.remove('is-added');button.textContent=original;},900);
  });
  document.addEventListener('pagosya:ready',function(){
    document.querySelectorAll('.bar-item').forEach(function(item){
      item.classList.toggle('bar-item--ready',true);
    });
  });
})();