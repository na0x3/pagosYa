(function(){
  function setGallery(root,color,src){
    var image=root.querySelector('.selection-image');
    if(!image)return;
    image.classList.add('is-changing');
    image.src=src;
    image.alt='Botella Ritual SAVIA en color '+color;
    root.querySelectorAll('[data-gallery-image]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.galleryColor===color))});
    requestAnimationFrame(function(){requestAnimationFrame(function(){image.classList.remove('is-changing')})});
  }
  var images={Salvia:'assets/image-d5b34d383f0c.jpg',Coral:'assets/image-9c4db2099869.jpg',Marfil:'assets/image-dbdc2c596f17.jpg'};
  document.addEventListener('click',function(e){
    var thumb=e.target.closest('[data-gallery-image]');
    if(thumb){setGallery(thumb.closest('[data-gallery]'),thumb.dataset.galleryColor,thumb.dataset.galleryImage);return}
    var option=e.target.closest('[data-product-option]');
    if(option){var text=(option.textContent||'').trim();Object.keys(images).some(function(color){if(text.indexOf(color)>-1){var gallery=option.closest('.selection-table');if(gallery)setGallery(gallery,color,images[color]);return true}return false})}
    var add=e.target.closest('[data-product-add]');
    if(add&&!add.disabled){var original=add.textContent;setTimeout(function(){add.classList.add('is-added');add.textContent='Añadida al pedido ✓';setTimeout(function(){add.classList.remove('is-added');add.textContent=original},1400)},80)}
  });
  document.addEventListener('pagosya:ready',function(){document.documentElement.classList.add('commerce-ready')});
})();