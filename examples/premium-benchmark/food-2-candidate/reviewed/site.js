(function(){
  var toggles=document.querySelectorAll('.menu-toggle');
  toggles.forEach(function(toggle){
    var nav=document.getElementById(toggle.getAttribute('aria-controls'));
    if(!nav)return;
    toggle.addEventListener('click',function(){var open=toggle.getAttribute('aria-expanded')==='true';toggle.setAttribute('aria-expanded',String(!open));nav.classList.toggle('is-open',!open)});
    nav.addEventListener('click',function(e){if(e.target.closest('a')){nav.classList.remove('is-open');toggle.setAttribute('aria-expanded','false')}});
  });
  document.addEventListener('click',function(e){
    var add=e.target.closest('[data-product-add]');
    if(!add||add.disabled)return;
    window.setTimeout(function(){add.classList.add('is-added');window.setTimeout(function(){add.classList.remove('is-added')},1200)},80);
  });
  document.addEventListener('pagosya:ready',function(){
    document.querySelectorAll('.product-media img').forEach(function(img){var title=img.closest('.menu-item')&&img.closest('.menu-item').querySelector('h2');if(title&&!img.alt)img.alt=title.textContent.trim()});
  });
})();