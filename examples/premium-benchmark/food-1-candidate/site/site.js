(function(){
  'use strict';
  document.addEventListener('pagosya:ready',function(){
    document.querySelectorAll('[data-pagosya-catalog] .pantry-item').forEach(function(card){
      var title=card.querySelector('[data-product-field="name"]');
      if(!title)return;
      var text=title.textContent.toLowerCase();
      card.classList.toggle('is-granola',text.indexOf('granola')>-1);
      card.classList.toggle('is-juice',text.indexOf('jugo')>-1);
      var label=card.querySelector('.chapter-label');
      if(label)label.textContent=text.indexOf('granola')>-1?'Capítulo dos · para servir':'Capítulo uno · para beber';
    });
  });
  document.addEventListener('click',function(event){
    var link=event.target.closest('a[href^="#"]');
    if(!link)return;
    var target=document.querySelector(link.getAttribute('href'));
    if(!target)return;
    event.preventDefault();
    target.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  });
})();