export enum SettlementMode {
  AGGREGATOR = "AGGREGATOR",
  FACILITATOR = "FACILITATOR",
}

export enum MerchantStatus {
  PENDING = "PENDING",
  ACTIVE = "ACTIVE",
  SUSPENDED = "SUSPENDED",
}

export enum ApiKeyMode {
  TEST = "TEST",
  LIVE = "LIVE",
}

export enum ApiKeyType {
  PUBLISHABLE = "PUBLISHABLE",
  SECRET = "SECRET",
}

export enum PaymentMethodType {
  CARD = "CARD",
  TIGO_MONEY = "TIGO_MONEY",
  BANK_TRANSFER = "BANK_TRANSFER",
  QR = "QR",
}

export enum PaymentIntentStatus {
  REQUIRES_PAYMENT_METHOD = "REQUIRES_PAYMENT_METHOD",
  REQUIRES_CONFIRMATION = "REQUIRES_CONFIRMATION",
  PROCESSING = "PROCESSING",
  REQUIRES_ACTION = "REQUIRES_ACTION",
  SUCCEEDED = "SUCCEEDED",
  FAILED = "FAILED",
  CANCELED = "CANCELED",
}

export enum TransactionType {
  AUTHORIZATION = "AUTHORIZATION",
  CAPTURE = "CAPTURE",
  REFUND = "REFUND",
  PAYOUT = "PAYOUT",
}

export enum TransactionStatus {
  PENDING = "PENDING",
  SUCCEEDED = "SUCCEEDED",
  FAILED = "FAILED",
}

export enum LedgerAccount {
  RAIL_CLEARING = "RAIL_CLEARING",
  MERCHANT_PAYABLE = "MERCHANT_PAYABLE",
  PAGOSYA_FEE_REVENUE = "PAGOSYA_FEE_REVENUE",
  RESERVE = "RESERVE",
}

export enum LedgerDirection {
  DEBIT = "DEBIT",
  CREDIT = "CREDIT",
}

export enum WebhookEventStatus {
  PENDING = "PENDING",
  DELIVERED = "DELIVERED",
  FAILED = "FAILED",
}

export type RailId = "mock_card" | "mock_tigo_money" | "mock_bank_transfer" | "mock_qr" | "baneco_qr";
