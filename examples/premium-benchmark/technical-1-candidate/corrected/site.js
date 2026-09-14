(function(){
  var toggle=document.querySelector('.menu-toggle');
  var nav=document.querySelector('.site-nav');
  if(toggle&&nav){toggle.addEventListener('click',function(){var open=toggle.getAttribute('aria-expanded')==='true';toggle.setAttribute('aria-expanded',String(!open));nav.classList.toggle('is-open',!open)});nav.addEventListener('click',function(e){if(e.target.closest('a')){toggle.setAttribute('aria-expanded','false');nav.classList.remove('is-open')}})}
  document.querySelectorAll('[data-year]').forEach(function(el){el.textContent=new Date().getFullYear()});
  document.addEventListener('click',function(e){var button=e.target.closest('[data-product-add]');if(!button||button.disabled)return;var old=button.childNodes[0]&&button.childNodes[0].nodeValue;setTimeout(function(){button.classList.add('is-added');if(button.childNodes[0])button.childNodes[0].nodeValue='Añadido ';},180);setTimeout(function(){button.classList.remove('is-added');if(button.childNodes[0]&&old!=null)button.childNodes[0].nodeValue=old;},1300)});
  document.addEventListener('pagosya:ready',function(){document.documentElement.classList.add('commerce-ready')});
})();
