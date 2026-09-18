-- Local mirror of Awin datafeed rows.
--
-- Awin has no live, cross-advertiser product search API - publishers can
-- only download bulk CSV/XML datafeeds per advertiser program they've
-- been accepted into (see src/lib/awin-feed-sync.ts). This table is that
-- local, searchable copy; the AwinProvider queries it instead of calling
-- Awin per-request.

CREATE TABLE IF NOT EXISTS awin_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feed_id TEXT NOT NULL,
    merchant_id TEXT NOT NULL,
    merchant_name TEXT NOT NULL,
    aw_product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    description TEXT,
    brand_name TEXT,
    category_name TEXT,
    ean TEXT,
    mpn TEXT,
    currency TEXT NOT NULL DEFAULT 'EUR',
    price_amount NUMERIC(12, 2) NOT NULL,
    delivery_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
    -- Awin's own tracked deep link for this product - already carries the
    -- publisher's affiliate tracking, so it is used as-is rather than
    -- rebuilt via the generic cread.php click-through format.
    aw_deep_link TEXT NOT NULL,
    merchant_product_url TEXT,
    image_url TEXT,
    in_stock BOOLEAN NOT NULL DEFAULT true,
    last_updated TIMESTAMPTZ,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Precomputed full-text search vector over the fields a shopper's
    -- query is matched against, kept in sync by the trigger below.
    search_vector tsvector,
    UNIQUE (feed_id, aw_product_id)
);

CREATE INDEX IF NOT EXISTS idx_awin_products_search_vector
    ON awin_products USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_awin_products_ean ON awin_products (ean) WHERE ean IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_awin_products_merchant_id ON awin_products (merchant_id);

CREATE OR REPLACE FUNCTION awin_products_search_vector_update() RETURNS trigger AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('german', coalesce(NEW.product_name, '')), 'A') ||
        setweight(to_tsvector('german', coalesce(NEW.brand_name, '')), 'B') ||
        setweight(to_tsvector('german', coalesce(NEW.category_name, '')), 'C');
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_awin_products_search_vector ON awin_products;
CREATE TRIGGER trg_awin_products_search_vector
    BEFORE INSERT OR UPDATE ON awin_products
    FOR EACH ROW EXECUTE FUNCTION awin_products_search_vector_update();

-- Bookkeeping for the feed-sync job: which feeds have been imported and when.
CREATE TABLE IF NOT EXISTS awin_feed_syncs (
    feed_id TEXT PRIMARY KEY,
    merchant_name TEXT,
    row_count INTEGER NOT NULL DEFAULT 0,
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_error TEXT
);
