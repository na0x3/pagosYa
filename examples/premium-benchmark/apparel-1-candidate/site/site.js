(function(){
  "use strict";

  document.addEventListener("click",function(event){
    var add=event.target.closest("[data-product-add], .product-detail__buy");
    if(!add||add.disabled)return;
    add.classList.add("is-adding");
    window.setTimeout(function(){add.classList.remove("is-adding");},220);
  });

  document.addEventListener("pagosya:ready",function(){
    document.documentElement.classList.add("commerce-ready");
    var sheets=document.querySelectorAll(".sample-sheet");
    sheets.forEach(function(sheet,index){
      sheet.setAttribute("data-sheet",String(index+1).padStart(2,"0"));
    });
  });
})();
