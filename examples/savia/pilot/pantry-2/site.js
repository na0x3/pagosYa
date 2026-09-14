(function(){
  var toggle=document.querySelector('.menu-toggle'),menu=document.querySelector('.mobile-nav');
  if(toggle&&menu){toggle.addEventListener('click',function(){var open=toggle.getAttribute('aria-expanded')==='true';toggle.setAttribute('aria-expanded',String(!open));menu.hidden=open});menu.addEventListener('click',function(e){if(e.target.closest('a')){menu.hidden=true;toggle.setAttribute('aria-expanded','false')}})}
  document.addEventListener('pagosya:ready',function(){
    var cards=document.querySelectorAll('[data-pagosya-catalog] .ritual-product');
    if(cards[0]){var juice=cards[0].querySelector('[data-product-field="image"]');if(juice&&juice.getAttribute('src')!=='assets/image-06465dbb2877.jpg')juice.src='assets/image-06465dbb2877.jpg'}
    if(cards[1]){var granola=cards[1].querySelector('[data-product-field="image"]');if(granola&&granola.getAttribute('src')!=='assets/image-e2dc7f4f02d3.jpg')granola.src='assets/image-e2dc7f4f02d3.jpg'}
  });
  document.addEventListener('click',function(e){var button=e.target.closest('[data-product-add]');if(!button)return;var original=button.textContent;setTimeout(function(){button.classList.add('added');button.textContent='Añadido';setTimeout(function(){button.classList.remove('added');button.textContent=original},1400)},80)});
})();