(function(){
  "use strict";
  document.addEventListener("click",function(event){
    var add=event.target.closest("[data-product-add]");
    if(!add||add.disabled||add.getAttribute("aria-disabled")==="true")return;
    var card=add.closest(".editorial-product");
    var feedback=card&&card.querySelector(".add-feedback");
    if(!feedback)return;
    window.setTimeout(function(){
      feedback.textContent="Añadido al pedido";
      card.classList.add("is-added");
      window.setTimeout(function(){feedback.textContent="";card.classList.remove("is-added")},2200);
    },100);
  });
  document.addEventListener("pagosya:ready",function(){
    document.querySelectorAll(".editorial-product").forEach(function(card){card.classList.add("is-ready")});
  });
})();
