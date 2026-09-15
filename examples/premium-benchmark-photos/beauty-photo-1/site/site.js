(function(){
  "use strict";
  function decorateCatalog(){
    document.querySelectorAll(".ritual-product").forEach(function(card,index){
      var name=card.querySelector('[data-product-field="name"]');
      if(!name)return;
      var label=card.querySelector(".gesture-label");
      if(label)label.textContent=index%2===0?"Hidratar":"Limpiar";
      if(name.textContent.trim().toLowerCase()==="crema de manos"){
        var slot=card.querySelector(".product-tag-slot");
        if(slot&&!slot.querySelector(".product-tag")){
          var tag=document.createElement("span");tag.className="product-tag";tag.textContent="Sin perfume";slot.appendChild(tag);
        }
      }
    });
  }
  document.addEventListener("pagosya:ready",decorateCatalog);
  document.addEventListener("click",function(event){
    var button=event.target.closest("[data-product-add]");
    if(!button||button.disabled)return;
    var original=button.textContent;
    window.setTimeout(function(){
      if(button.disabled)return;
      button.classList.add("is-added");button.textContent="Añadido";button.setAttribute("aria-label","Producto añadido al pedido");
      window.setTimeout(function(){button.classList.remove("is-added");button.textContent=original;button.removeAttribute("aria-label")},1100);
    },80);
  });
  decorateCatalog();
})();