-- Migration d'initialisation VIP KEVAS dans Supabase
-- Généré le 15 Octobre 2026

-- 1. Table users (Clients et Administrateurs)
CREATE TABLE IF NOT EXISTS public.vip_users (
    phone TEXT PRIMARY KEY,
    firstname TEXT NOT NULL,
    lastname TEXT NOT NULL,
    email TEXT,
    password TEXT NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    kyc JSONB DEFAULT '{"status": "none"}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Table reservations (Réservations de sièges)
CREATE TABLE IF NOT EXISTS public.vip_reservations (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    route TEXT NOT NULL,
    phone TEXT NOT NULL,
    passenger_name TEXT,
    tx_id TEXT,
    amount NUMERIC DEFAULT 20000,
    vehicle_id INTEGER DEFAULT 1,
    seat_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Table payments (Transactions Mobile Money)
CREATE TABLE IF NOT EXISTS public.vip_payments (
    tx_id TEXT PRIMARY KEY,
    passenger_name TEXT,
    phone TEXT NOT NULL,
    provider TEXT,
    amount NUMERIC DEFAULT 20000,
    date TEXT,
    status TEXT DEFAULT 'success',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Table reviews (Avis clients)
CREATE TABLE IF NOT EXISTS public.vip_reviews (
    id BIGINT PRIMARY KEY,
    author TEXT NOT NULL,
    role TEXT,
    stars INTEGER DEFAULT 5,
    text TEXT,
    date TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sécurité RLS et politiques d'accès
ALTER TABLE public.vip_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access on vip_users" ON public.vip_users;
CREATE POLICY "Public full access on vip_users" ON public.vip_users FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE public.vip_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access on vip_reservations" ON public.vip_reservations;
CREATE POLICY "Public full access on vip_reservations" ON public.vip_reservations FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE public.vip_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access on vip_payments" ON public.vip_payments;
CREATE POLICY "Public full access on vip_payments" ON public.vip_payments FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE public.vip_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access on vip_reviews" ON public.vip_reviews;
CREATE POLICY "Public full access on vip_reviews" ON public.vip_reviews FOR ALL TO anon USING (true) WITH CHECK (true);
