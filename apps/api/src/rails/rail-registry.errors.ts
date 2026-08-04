export class UnsupportedPaymentMethodError extends Error {
  constructor(methodType: string) {
    super(`No rail adapter supports payment method type "${methodType}"`);
    this.name = "UnsupportedPaymentMethodError";
  }
}

export class UnknownRailError extends Error {
  constructor(railId: string) {
    super(`No rail adapter registered with id "${railId}"`);
    this.name = "UnknownRailError";
  }
}
