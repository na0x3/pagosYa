import { ConflictException } from '@nestjs/common';
/** Admission/serialization conflict: safe to retry without changing the pinned input. */
export class DesignRetryableConflict extends ConflictException {}
