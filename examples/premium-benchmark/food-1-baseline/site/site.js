(function(){
  var query=window.PAGOSYA_PREVIEW_QUERY||window.location.search;
  if(document.body.classList.contains('product-page')&&query&&!location.search&&window.PAGOSYA_PREVIEW_QUERY){document.body.dataset.previewQuery=query}
  document.addEventListener('click',function(e){
    var add=e.target.closest('[data-product-add],.product-detail__buy');
    if(!add)return;
    var original=add.textContent;
    window.setTimeout(function(){add.classList.add('is-added');add.textContent='Añadido al pedido';window.setTimeout(function(){add.classList.remove('is-added');add.textContent=original},1400)},80);
  });
  document.addEventListener('pagosya:ready',function(){
    document.querySelectorAll('.table-product').forEach(function(card,i){
      card.dataset.tableSide=i===0?'jugo':'granola';
      var image=card.querySelector('[data-product-field="image"]');
      var name=card.querySelector('[data-product-field="name"]');
      if(image&&name)image.alt=name.textContent.trim();
    });
  });
})();