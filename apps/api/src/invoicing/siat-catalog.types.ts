export const SIAT_CATALOGS = {
  activities: {
    method: "sincronizarActividades",
    itemTag: "listaActividades",
    fields: ["codigoCaeb", "descripcion", "tipoActividad"],
  },
  products: {
    method: "sincronizarListaProductosServicios",
    itemTag: "listaCodigos",
    fields: ["codigoActividad", "codigoProducto", "descripcionProducto"],
  },
  units: {
    method: "sincronizarParametricaUnidadMedida",
    itemTag: "listaCodigos",
    fields: ["codigoClasificador", "descripcion"],
  },
  "payment-methods": {
    method: "sincronizarParametricaTipoMetodoPago",
    itemTag: "listaCodigos",
    fields: ["codigoClasificador", "descripcion"],
  },
  currencies: {
    method: "sincronizarParametricaTipoMoneda",
    itemTag: "listaCodigos",
    fields: ["codigoClasificador", "descripcion"],
  },
  "document-sectors": {
    method: "sincronizarParametricaTipoDocumentoSector",
    itemTag: "listaCodigos",
    fields: ["codigoClasificador", "descripcion"],
  },
  "activity-document-sectors": {
    method: "sincronizarListaActividadesDocumentoSector",
    itemTag: "listaActividadesDocumentoSector",
    fields: ["codigoActividad", "codigoDocumentoSector", "tipoDocumentoSector"],
  },
} as const;

export type SiatCatalogName = keyof typeof SIAT_CATALOGS;
export type SiatCatalogEntry = Record<string, string | number>;

export function isSiatCatalogName(value: string): value is SiatCatalogName {
  return Object.prototype.hasOwnProperty.call(SIAT_CATALOGS, value);
}
