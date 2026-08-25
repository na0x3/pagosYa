PRAGMA foreign_keys = ON;

CREATE TABLE store (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BOB',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
  sku TEXT PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES store(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price_centavos INTEGER NOT NULL CHECK (price_centavos >= 0),
  stock INTEGER NOT NULL CHECK (stock >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL REFERENCES products(sku),
  previous_stock INTEGER NOT NULL,
  new_stock INTEGER NOT NULL CHECK (new_stock >= 0),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customers (
  external_customer_id TEXT PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES store(id),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE subscription_plans (
  code TEXT PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES store(id),
  name TEXT NOT NULL,
  amount_centavos INTEGER NOT NULL CHECK (amount_centavos > 0),
  interval TEXT NOT NULL DEFAULT 'MONTHLY' CHECK (interval IN ('WEEKLY', 'MONTHLY', 'YEARLY')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE subscriptions (
  external_subscription_id TEXT PRIMARY KEY,
  external_customer_id TEXT NOT NULL REFERENCES customers(external_customer_id),
  plan_code TEXT NOT NULL REFERENCES subscription_plans(code),
  amount_override_centavos INTEGER CHECK (amount_override_centavos IS NULL OR amount_override_centavos > 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'CANCELED')),
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  next_billing_at TEXT NOT NULL,
  canceled_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO store (id, name) VALUES (1, 'Café Aroma');

INSERT INTO products (sku, store_id, name, category, price_centavos, stock) VALUES
  ('CAF-001', 1, 'Café americano', 'Cafés', 1500, 24),
  ('CAF-002', 1, 'Café con leche', 'Cafés', 1800, 18),
  ('CAF-003', 1, 'Cappuccino', 'Cafés', 2200, 15),
  ('TE-001', 1, 'Té de coca', 'Infusiones', 1200, 20),
  ('FRI-001', 1, 'Limonada', 'Bebidas frías', 1400, 12),
  ('PAN-001', 1, 'Croissant', 'Panadería', 1000, 10),
  ('PAN-002', 1, 'Cuñapé', 'Panadería', 800, 16),
  ('COM-001', 1, 'Combo desayuno', 'Combos', 2500, 8);

INSERT INTO customers (external_customer_id, store_id, name, email, phone) VALUES
  ('CLI-001', 1, 'María López', 'maria.cafe@example.com', '+591 71234567'),
  ('CLI-002', 1, 'Diego Flores', 'diego.cafe@example.com', '+591 76543210'),
  ('CLI-003', 1, 'Sofía Rojas', 'sofia.cafe@example.com', '+591 70112233');

INSERT INTO subscription_plans (code, store_id, name, amount_centavos, interval) VALUES
  ('CAFE-MENSUAL', 1, 'Club Café mensual', 15000, 'MONTHLY'),
  ('DESAYUNO-MENSUAL', 1, 'Desayunos del mes', 24000, 'MONTHLY');

INSERT INTO subscriptions (external_subscription_id, external_customer_id, plan_code, amount_override_centavos, status, started_at, next_billing_at) VALUES
  ('SUB-1001', 'CLI-001', 'CAFE-MENSUAL', NULL, 'ACTIVE', datetime('now', '-2 months'), datetime('now', '-1 day')),
  ('SUB-1002', 'CLI-002', 'DESAYUNO-MENSUAL', NULL, 'ACTIVE', datetime('now', '-1 month'), datetime('now', '+7 days')),
  ('SUB-1003', 'CLI-003', 'CAFE-MENSUAL', 13500, 'PAUSED', datetime('now', '-3 months'), datetime('now', '+14 days'));
