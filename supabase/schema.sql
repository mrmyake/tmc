-- The Movement Club — Crowdfunding schema
-- Run once in your Supabase SQL editor (https://supabase.com/dashboard/project/_/sql)
--
-- All *content* stays in Sanity. This database only tracks money + backers.

-- 1. Backers: one row per payment attempt
CREATE TABLE IF NOT EXISTS crowdfunding_backers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  tier_id TEXT NOT NULL,         -- koppelt aan Sanity crowdfundingTier.tierId
  tier_name TEXT NOT NULL,
  amount INTEGER NOT NULL,        -- in euro's (hele getallen)
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  mollie_payment_id TEXT UNIQUE,
  payment_status TEXT DEFAULT 'pending', -- pending | paid | failed | refunded | canceled | expired
  show_on_wall BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_backers_tier ON crowdfunding_backers (tier_id);
CREATE INDEX IF NOT EXISTS idx_backers_status ON crowdfunding_backers (payment_status);
CREATE INDEX IF NOT EXISTS idx_backers_created ON crowdfunding_backers (created_at DESC);

-- 2. Stats: single row (id=1), updated via webhook
CREATE TABLE IF NOT EXISTS crowdfunding_stats (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  total_raised INTEGER DEFAULT 0,
  total_backers INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO crowdfunding_stats (id, total_raised, total_backers)
VALUES (1, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- 3. Tier inventory: one row per tier, slots_claimed bumped via webhook
CREATE TABLE IF NOT EXISTS crowdfunding_tiers (
  id TEXT PRIMARY KEY,           -- moet matchen met Sanity crowdfundingTier.tierId
  slots_claimed INTEGER DEFAULT 0
);

-- 4. Row Level Security
ALTER TABLE crowdfunding_backers ENABLE ROW LEVEL SECURITY;
ALTER TABLE crowdfunding_stats   ENABLE ROW LEVEL SECURITY;
ALTER TABLE crowdfunding_tiers   ENABLE ROW LEVEL SECURITY;

-- Public reads: anon kan de live tellers + recente paid backers zien (voor social proof / progress bar)
DROP POLICY IF EXISTS "Public read stats" ON crowdfunding_stats;
CREATE POLICY "Public read stats" ON crowdfunding_stats
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Public read tier slots" ON crowdfunding_tiers;
CREATE POLICY "Public read tier slots" ON crowdfunding_tiers
  FOR SELECT USING (TRUE);

-- Alleen paid+zichtbare backers zijn publiek leesbaar (voor "recente backers" feed)
DROP POLICY IF EXISTS "Public read paid backers" ON crowdfunding_backers;
CREATE POLICY "Public read paid backers" ON crowdfunding_backers
  FOR SELECT USING (payment_status = 'paid' AND show_on_wall = TRUE);

-- Alle writes gaan via de service role key (server-side), geen anon insert/update/delete.

-- 5. Atomic increment helpers (voor webhook — voorkomt race conditions)
CREATE OR REPLACE FUNCTION increment_cf_tier_slot(p_tier_id TEXT)
RETURNS VOID AS $$
BEGIN
  INSERT INTO crowdfunding_tiers (id, slots_claimed)
  VALUES (p_tier_id, 1)
  ON CONFLICT (id) DO UPDATE
    SET slots_claimed = crowdfunding_tiers.slots_claimed + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_cf_stats(p_amount INTEGER)
RETURNS VOID AS $$
BEGIN
  INSERT INTO crowdfunding_stats (id, total_raised, total_backers, updated_at)
  VALUES (1, p_amount, 1, NOW())
  ON CONFLICT (id) DO UPDATE
    SET
      total_raised  = crowdfunding_stats.total_raised + p_amount,
      total_backers = crowdfunding_stats.total_backers + 1,
      updated_at    = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Realtime publicatie voor stats + backers (voor live updates)
ALTER PUBLICATION supabase_realtime ADD TABLE crowdfunding_stats;
ALTER PUBLICATION supabase_realtime ADD TABLE crowdfunding_backers;
ALTER PUBLICATION supabase_realtime ADD TABLE crowdfunding_tiers;
