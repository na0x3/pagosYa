(function(){
  'use strict';
  function setVolumeState(scope){
    if(!scope)return;
    var choices=scope.querySelectorAll('[data-product-option], .product-detail__values button, .volume-choice button');
    if(!choices.length)return;
    var selected=scope.querySelector('[data-product-option][aria-pressed="true"], .product-detail__values button[aria-pressed="true"], .volume-choice button[aria-pressed="true"]')||choices[0];
    var values=Array.prototype.map.call(choices,function(el){return parseFloat((el.textContent||'').replace(',','.'))||0;});
    var current=parseFloat((selected.textContent||'').replace(',','.'))||values[0];
    var max=Math.max.apply(Math,values);
    if(scope.classList.contains('volume-product'))scope.dataset.volumeLarge=String(current===max&&values.length>1);
    scope.style.setProperty('--selected-volume',Math.max(38,Math.round(current/max*78))+'%');
  }
  function decorate(){
    document.querySelectorAll('.volume-product, [data-pagosya-product]').forEach(setVolumeState);
    var detail=document.querySelector('[data-pagosya-product] .product-detail__copy');
    if(detail&&!detail.querySelector('.detail-tag')){
      var title=detail.querySelector('h1');
      if(title&&title.textContent.trim().toLowerCase()==='crema de manos'){
        var tag=document.createElement('p');tag.className='detail-tag';tag.textContent='Sin perfume';detail.insertBefore(tag,title);
      }
    }
  }
  document.addEventListener('pagosya:ready',function(){requestAnimationFrame(decorate)});
  document.addEventListener('click',function(event){
    var option=event.target.closest('[data-product-option], .volume-choice button, .product-detail__values button');
    if(option)setTimeout(function(){setVolumeState(option.closest('.volume-product, [data-pagosya-product]'))},0);
    var add=event.target.closest('[data-product-add]');
    if(add){
      var card=add.closest('.volume-product');
      var note=card&&card.querySelector('.add-note');
      add.classList.add('is-added');
      if(note)note.textContent='Añadido a Mi pedido';
      setTimeout(function(){add.classList.remove('is-added');if(note)note.textContent=''},1400);
    }
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',decorate);else decorate();
}());