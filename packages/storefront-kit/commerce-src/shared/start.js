  // «Pide una cotización» in the header, and any call to action marked data-pagosya-contact-open, opens the platform contact
  // form; a store without the form keeps the link, which goes to its Contacto page.
  document.addEventListener('click', event => {
    const trigger = event.target.closest && event.target.closest('[data-pagosya-contact-open]');
    // A form shown inline on this page (the store assistant owns the corner): go to it instead of opening a panel.
    const inlineForm = trigger && document.querySelector('[data-pagosya-contact][data-contact-inline]:not([hidden])');
    if (inlineForm) {
      event.preventDefault();
      inlineForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const field = inlineForm.querySelector('input:not([type=hidden]), textarea');
      if (field) field.focus({ preventScroll: true });
      return;
    }
    const launcher = trigger && document.querySelector('[data-pagosya-contact]:not([hidden]) [data-contact-toggle]');
    if (!launcher) return;
    event.preventDefault();
    if (launcher.getAttribute('aria-expanded') !== 'true') launcher.click();
  });

  void loadCommerceContent();
  void load();
})();
