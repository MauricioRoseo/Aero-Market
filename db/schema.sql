CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email_lookup CHAR(64) NOT NULL UNIQUE,
  email_encrypted TEXT NOT NULL,
  full_name_encrypted TEXT NOT NULL,
  cpf_encrypted TEXT NOT NULL,
  phone_encrypted TEXT NOT NULL,
  address_encrypted TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  category TEXT NOT NULL,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_cards (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cardholder_encrypted TEXT NOT NULL,
  brand TEXT NOT NULL CHECK (brand IN ('Visa', 'Mastercard', 'Amex', 'Elo', 'Hipercard')),
  last4 CHAR(4) NOT NULL CHECK (last4 ~ '^[0-9]{4}$'),
  expiry_month SMALLINT NOT NULL CHECK (expiry_month BETWEEN 1 AND 12),
  expiry_year SMALLINT NOT NULL CHECK (expiry_year BETWEEN 2020 AND 2100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  payment_card_id BIGINT REFERENCES payment_cards(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'shipped', 'delivered')),
  total_cents INTEGER NOT NULL CHECK (total_cents > 0),
  shipping_address_encrypted TEXT NOT NULL,
  payment_brand TEXT NOT NULL CHECK (payment_brand IN ('Visa', 'Mastercard', 'Amex', 'Elo', 'Hipercard')),
  payment_last4 CHAR(4) NOT NULL CHECK (payment_last4 ~ '^[0-9]{4}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_card_id BIGINT REFERENCES payment_cards(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents > 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS orders_user_created_idx ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_cards_user_created_idx ON payment_cards(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id);
