/** Renders a storefront source snapshot into a sandboxed iframe document, for Studio previews and checkout-hosted source stores. */
export { sourcePreviewDocument, uploadImageSource, receivePreviewNavigation, receivePreviewSelection, type SourceFile, type SourceSnapshot, type PreviewNavigation, type PreviewSelection } from './source-preview';
export { compactPreviewImageData, createPreviewImageLoader, hostedImageUrls, hostedCatalogImages } from './source-preview-media';
export * from './source-location';

export { mountSourceAccountHost, ACCOUNT_SOURCE_PAGES } from './source-account-host';
