-- PricePilot initial schema
-- Conventions: UUID primary keys, snake_case, created_at/updated_at on every table.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    normalized_title TEXT NOT NULL,
    brand TEXT,
    manufacturer TEXT,
    category TEXT,
    model TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_normalized_title ON products (normalized_title);
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);

-- One row per identifier value per product, so a product can carry
-- multiple identifiers (GTIN, EAN, ASIN, MPN, SKU, ...) without sparse columns.
CREATE TABLE IF NOT EXISTS product_identifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    identifier_type TEXT NOT NULL CHECK (
        identifier_type IN ('GTIN', 'EAN', 'UPC', 'ASIN', 'MPN', 'SKU')
    ),
    identifier_value TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (identifier_type, identifier_value)
);

CREATE INDEX IF NOT EXISTS idx_product_identifiers_product_id ON product_identifiers (product_id);
CREATE INDEX IF NOT EXISTS idx_product_identifiers_value ON product_identifiers (identifier_value);

CREATE TABLE IF NOT EXISTS merchants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    country TEXT NOT NULL DEFAULT 'DE',
    website_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A "provider" is a code-level integration (demo, amazon, awin, ...).
-- Distinct from "merchants", which are the retailers whose offers a
-- provider surfaces (e.g. the Awin provider surfaces many merchants).
CREATE TABLE IF NOT EXISTS providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_key TEXT NOT NULL UNIQUE, -- matches PriceProvider.providerId in code
    display_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'CONFIGURATION_REQUIRED' CHECK (
        status IN ('OK', 'CONFIGURATION_REQUIRED', 'ERROR', 'RATE_LIMITED')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS affiliate_programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES providers (id) ON DELETE CASCADE,
    merchant_id UUID REFERENCES merchants (id) ON DELETE SET NULL,
    program_name TEXT NOT NULL,
    commission_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_key TEXT NOT NULL UNIQUE, -- matches Offer.offerId in code (may be provider-namespaced)
    product_id UUID REFERENCES products (id) ON DELETE SET NULL,
    provider_id UUID NOT NULL REFERENCES providers (id) ON DELETE CASCADE,
    merchant_id UUID REFERENCES merchants (id) ON DELETE SET NULL,
    product_title TEXT NOT NULL,
    product_url TEXT NOT NULL,
    image_url TEXT,
    currency TEXT NOT NULL DEFAULT 'EUR',
    price_amount NUMERIC(12, 2) NOT NULL,
    shipping_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(12, 2) GENERATED ALWAYS AS (price_amount + shipping_amount) STORED,
    in_stock BOOLEAN NOT NULL DEFAULT true,
    match_confidence NUMERIC(4, 3) NOT NULL DEFAULT 0,
    match_tier TEXT,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offers_product_id ON offers (product_id);
CREATE INDEX IF NOT EXISTS idx_offers_provider_id ON offers (provider_id);
CREATE INDEX IF NOT EXISTS idx_offers_total_amount ON offers (total_amount);

-- Historical price points, one row per observed price for an offer, used
-- for price-history charts and drop alerts in later phases.
CREATE TABLE IF NOT EXISTS price_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_id UUID NOT NULL REFERENCES offers (id) ON DELETE CASCADE,
    price_amount NUMERIC(12, 2) NOT NULL,
    shipping_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    in_stock BOOLEAN NOT NULL DEFAULT true,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_offer_id_observed_at
    ON price_snapshots (offer_id, observed_at DESC);

-- Anonymous by design: no user_id required. If a user account exists at
-- click time, user_id may be set, but core comparison never requires login.
CREATE TABLE IF NOT EXISTS click_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_id UUID NOT NULL REFERENCES offers (id) ON DELETE CASCADE,
    user_id UUID REFERENCES users (id) ON DELETE SET NULL,
    session_hash TEXT, -- salted, non-reversible session identifier, not PII
    referrer_host TEXT,
    user_agent TEXT,
    clicked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_click_events_offer_id ON click_events (offer_id);
CREATE INDEX IF NOT EXISTS idx_click_events_clicked_at ON click_events (clicked_at);

CREATE TABLE IF NOT EXISTS provider_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES providers (id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    message TEXT,
    context JSONB,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_errors_provider_id ON provider_errors (provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_errors_occurred_at ON provider_errors (occurred_at);
