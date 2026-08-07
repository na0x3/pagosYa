// Shared between CreatePaymentLinkDto.imageUrl and CreateStoreDto.logoUrl — both
// accept only a path this API just handed back from POST /v1/uploads, never an
// arbitrary client-supplied URL.
export const UPLOADED_FILE_URL_PATTERN = /^\/v1\/uploads\/[A-Za-z0-9._-]+$/;
export const MAX_UPLOADED_FILE_URL_LENGTH = 200;
