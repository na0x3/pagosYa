/** Keep a merchant's draft available when a save fails and the dialog rerenders. */
export function preserveDialogForms(root: HTMLElement) {
  const forms = [...root.querySelectorAll('form')].map(form => [...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input,textarea,select')].map(input => ({ value: input.value, checked: input instanceof HTMLInputElement ? input.checked : false })));
  return () => [...root.querySelectorAll('form')].forEach((form, i) => {
    [...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input,textarea,select')].forEach((input, j) => {
      const saved = forms[i]?.[j]; if (!saved || input instanceof HTMLInputElement && input.type === 'file') return;
      input.value = saved.value; if (input instanceof HTMLInputElement) input.checked = saved.checked;
    });
  });
}
