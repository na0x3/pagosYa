(function(){
  function preferredImage(card){
    var title=card.querySelector('[data-product-field="name"]');
    var img=card.querySelector('[data-product-field="image"]');
    if(!title||!img)return;
    var name=title.textContent.toLowerCase();
    var src=name.indexOf('jugo')>-1?'assets/image-06465dbb2877.jpg':name.indexOf('granola')>-1?'assets/image-5d185857f7d9.jpg':'';
    if(src&&!card.dataset.photoSet){img.src=src;card.dataset.photoSet='true'}
  }
  document.addEventListener('pagosya:ready',function(){
    document.querySelectorAll('.breakfast-row').forEach(preferredImage);
  });
  document.addEventListener('click',function(e){
    var button=e.target.closest('[data-product-add]');
    if(!button)return;
    var label=button.querySelector('span');
    if(!label)return;
    window.setTimeout(function(){
      button.classList.add('is-added');label.textContent='Añadido';
      window.setTimeout(function(){button.classList.remove('is-added');label.textContent='Añadir'},1100);
    },80);
  });
})();
