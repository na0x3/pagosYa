(function(){
  var toggle=document.querySelector('.menu-toggle'),nav=document.querySelector('.site-nav');
  if(toggle&&nav){toggle.addEventListener('click',function(){var open=toggle.getAttribute('aria-expanded')==='true';toggle.setAttribute('aria-expanded',String(!open));nav.classList.toggle('is-open',!open)});nav.addEventListener('click',function(e){if(e.target.closest('a')){nav.classList.remove('is-open');toggle.setAttribute('aria-expanded','false')}})}
  document.addEventListener('click',function(e){var add=e.target.closest('[data-product-add],.menu-add');if(!add||add.disabled)return;add.classList.remove('is-added');requestAnimationFrame(function(){add.classList.add('is-added');setTimeout(function(){add.classList.remove('is-added')},900)})});
})();