// The create-store dialog: a logo is optional and a failed upload never blocks creating the store.
export const MAX_CREATE_LOGO_BYTES = 8_000_000;

export async function createStoreBody(name, file, uploadFile) {
  if (!file || !file.size) return { body: { name }, warning: null };
  if (file.size > MAX_CREATE_LOGO_BYTES) return { body: { name }, warning: "El logo pesa más de 8 MB. La tienda se creó sin logo; súbelo luego en Ajustes de la tienda." };
  try {
    return { body: { name, logoUrl: await uploadFile(file) }, warning: null };
  } catch (error) {
    return { body: { name }, warning: `No pudimos subir el logo (${error?.message || "error desconocido"}). La tienda se creó sin logo; súbelo luego en Ajustes de la tienda.` };
  }
}
