(function(){
  var menuButton=document.querySelector('.menu-toggle');
  var menu=document.querySelector('.site-nav');
  if(menuButton&&menu){
    menuButton.addEventListener('click',function(){
      var open=menuButton.getAttribute('aria-expanded')==='true';
      menuButton.setAttribute('aria-expanded',String(!open));
      menu.classList.toggle('is-open',!open);
    });
    menu.addEventListener('click',function(event){
      if(event.target.closest('a')){menu.classList.remove('is-open');menuButton.setAttribute('aria-expanded','false');}
    });
  }

  var pendingButton=null;
  document.addEventListener('click',function(event){
    var add=event.target.closest('[data-product-add]');
    if(add){pendingButton=add;add.dataset.originalLabel=add.textContent.trim();}
  });

  var counts=document.querySelectorAll('[data-cart-count]');
  if(counts.length&&window.MutationObserver){
    var last=counts[0].textContent;
    new MutationObserver(function(){
      var next=counts[0].textContent;
      if(next!==last&&pendingButton){
        var button=pendingButton;
        button.textContent='Añadido';button.classList.add('is-added');
        window.setTimeout(function(){button.textContent=button.dataset.originalLabel||'Añadir';button.classList.remove('is-added');},1100);
        pendingButton=null;
      }
      last=next;
    }).observe(counts[0],{childList:true,characterData:true,subtree:true});
  }

  function decorateCatalog(){
    document.querySelectorAll('.volume-product').forEach(function(card){
      var values=[];
      card.querySelectorAll('[data-product-option],.product-options button').forEach(function(button){
        var text=button.textContent.trim();
        if(text&&values.indexOf(text)<0)values.push(text);
      });
      if(values.length)card.setAttribute('data-volume-figures',values.join(' / '));
    });
  }
  document.addEventListener('pagosya:ready',function(){window.requestAnimationFrame(decorateCatalog);});
})();