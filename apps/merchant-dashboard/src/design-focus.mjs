/** YAPI in design mode (spec 2026-10-22 v2 §6): the Studio asks for the whole screen while the merchant designs. */
export function designFocus(event, frameId) {
  if (frameId !== "merchantStudioFrame" || event?.data?.type !== "pagosya:design-focus") return null;
  return Boolean(event.data.open);
}
