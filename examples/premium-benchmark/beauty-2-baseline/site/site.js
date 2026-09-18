(function(){
  var toggle=document.querySelector('.nav-toggle');
  var nav=document.querySelector('.site-nav');
  if(toggle&&nav){
    toggle.addEventListener('click',function(){
      var open=toggle.getAttribute('aria-expanded')==='true';
      toggle.setAttribute('aria-expanded',String(!open));
      nav.classList.toggle('is-open',!open);
    });
    nav.addEventListener('click',function(e){if(e.target.closest('a')){toggle.setAttribute('aria-expanded','false');nav.classList.remove('is-open')}});
  }
  document.addEventListener('pagosya:ready',function(){document.documentElement.classList.add('commerce-ready')});
  document.addEventListener('click',function(e){
    var add=e.target.closest('[data-product-add],.product-detail__buy');
    if(!add||add.disabled)return;
    add.classList.remove('added');
    window.setTimeout(function(){add.classList.add('added')},40);
    window.setTimeout(function(){add.classList.remove('added')},1100);
  });
}());
