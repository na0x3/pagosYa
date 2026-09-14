(function(){
  "use strict";
  function feedback(button){
    if(!button || button.disabled || button.getAttribute("aria-disabled")==="true") return;
    var original=button.dataset.originalLabel||button.textContent.trim();
    button.dataset.originalLabel=original;
    window.setTimeout(function(){
      button.textContent="Añadido al pedido";
      button.classList.add("is-added");
      var note=button.parentElement&&button.parentElement.querySelector(".add-feedback");
      if(note) note.textContent="Selección añadida.";
      window.setTimeout(function(){button.textContent=original;button.classList.remove("is-added");if(note) note.textContent="";},1400);
    },180);
  }
  document.addEventListener("click",function(event){
    var button=event.target.closest("[data-product-add]");
    if(button) feedback(button);
  });
  document.addEventListener("pagosya:ready",function(){
    document.querySelectorAll("[data-pagosya-catalog] .menu-item").forEach(function(item,index){
      item.classList.add("specimen--"+(index+1));
    });
  });
})();