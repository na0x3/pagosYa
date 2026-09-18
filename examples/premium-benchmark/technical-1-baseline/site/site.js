(function(){
  "use strict";
  function numberProducts(){
    document.querySelectorAll("[data-pagosya-catalog] .technical-product").forEach(function(card,index){
      var mark=card.querySelector(".product-index");
      if(mark) mark.textContent="P—"+String(index+1).padStart(2,"0");
    });
  }
  document.addEventListener("pagosya:ready",numberProducts);
  document.addEventListener("click",function(event){
    var button=event.target.closest("[data-product-add]");
    if(!button||button.disabled)return;
    var original=button.textContent;
    window.setTimeout(function(){
      button.textContent="Añadido al pedido";
      button.classList.add("is-added");
      window.setTimeout(function(){button.textContent=original;button.classList.remove("is-added");},1400);
    },80);
  });
})();
