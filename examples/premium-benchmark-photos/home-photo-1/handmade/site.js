(function(){
  var toggle=document.querySelector('.menu-toggle'),nav=document.querySelector('.site-nav');
  if(!toggle||!nav)return;
  toggle.addEventListener('click',function(){var open=nav.classList.toggle('is-open');toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Cerrar navegación':'Abrir navegación')});
  nav.addEventListener('click',function(){nav.classList.remove('is-open');toggle.setAttribute('aria-expanded','false')});
})();
