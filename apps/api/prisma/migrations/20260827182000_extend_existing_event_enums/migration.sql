-- PostgreSQL requires newly-added values on existing enums to commit before a
-- later migration can use them as defaults. These additions preserve every
-- legacy PagosYa ticketing state and only extend the vocabulary.
ALTER TYPE "EventOrderStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';
ALTER TYPE "EventOrderStatus" ADD VALUE IF NOT EXISTS 'VOID';
ALTER TYPE "EventStatus" ADD VALUE IF NOT EXISTS 'ACTIVE';
ALTER TYPE "EventStatus" ADD VALUE IF NOT EXISTS 'ENDED';
ALTER TYPE "EventStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "EventTicketStatus" ADD VALUE IF NOT EXISTS 'ACTIVE';
ALTER TYPE "EventTicketStatus" ADD VALUE IF NOT EXISTS 'REVOKED';
ALTER TYPE "EventTicketStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
