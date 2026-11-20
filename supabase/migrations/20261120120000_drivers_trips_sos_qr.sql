-- Migration complète : Espace Chauffeurs, Historique Voyages, Code PIN Embarquement & Alertes SOS
-- À exécuter dans le SQL Editor de Supabase

-- 1. Colonnes de suivi d'embarquement (QR Code) et bagages sur vip_reservations
ALTER TABLE public.vip_reservations ADD COLUMN IF NOT EXISTS boarded BOOLEAN DEFAULT FALSE;
ALTER TABLE public.vip_reservations ADD COLUMN IF NOT EXISTS boarded_at TIMESTAMPTZ;
ALTER TABLE public.vip_reservations ADD COLUMN IF NOT EXISTS driver_name TEXT;
ALTER TABLE public.vip_reservations ADD COLUMN IF NOT EXISTS baggage_allowance TEXT DEFAULT '23 kg (malle arrière) + 7 kg (bagage à main)';

-- 2. Table des chauffeurs VIP Connect (créés par l'administrateur)
CREATE TABLE IF NOT EXISTS public.vip_drivers (
    id TEXT PRIMARY KEY,
    firstname TEXT NOT NULL,
    lastname TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    vehicle_name TEXT DEFAULT 'Changan VIP #1',
    vehicle_plate TEXT DEFAULT '',
    password TEXT DEFAULT '',
    password_set BOOLEAN DEFAULT FALSE,
    invite_token TEXT,
    status TEXT DEFAULT 'actif',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Table des voyages effectués (quel chauffeur a roulé, avec quelle voiture, à quelle date)
CREATE TABLE IF NOT EXISTS public.vip_trips (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    route TEXT NOT NULL,
    driver_id TEXT,
    driver_name TEXT,
    driver_phone TEXT,
    vehicle_id INTEGER DEFAULT 1,
    vehicle_name TEXT DEFAULT 'Changan VIP #1',
    status TEXT DEFAULT 'en_cours',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ
);

-- 4. Table des alertes SOS clients (bouton maintenu 3 secondes)
CREATE TABLE IF NOT EXISTS public.vip_sos_alerts (
    id TEXT PRIMARY KEY,
    user_name TEXT,
    user_phone TEXT,
    user_email TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    message TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Table des paramètres globaux (notamment le code PIN de vérification QR, par défaut 2846)
CREATE TABLE IF NOT EXISTS public.vip_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.vip_settings (key, value)
VALUES ('qr_verification_pin', '2846')
ON CONFLICT (key) DO NOTHING;

-- 6. Ajout de driver_name sur vip_vehicle_locations pour savoir quel chauffeur conduit en direct
ALTER TABLE public.vip_vehicle_locations ADD COLUMN IF NOT EXISTS driver_name TEXT DEFAULT '';
ALTER TABLE public.vip_vehicle_locations ADD COLUMN IF NOT EXISTS driver_phone TEXT DEFAULT '';

-- Politiques RLS (accès public anon pour l'application)
ALTER TABLE public.vip_drivers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access on vip_drivers" ON public.vip_drivers;
CREATE POLICY "Public full access on vip_drivers" ON public.vip_drivers FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE public.vip_trips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access on vip_trips" ON public.vip_trips;
CREATE POLICY "Public full access on vip_trips" ON public.vip_trips FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE public.vip_sos_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access on vip_sos_alerts" ON public.vip_sos_alerts;
CREATE POLICY "Public full access on vip_sos_alerts" ON public.vip_sos_alerts FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE public.vip_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access on vip_settings" ON public.vip_settings;
CREATE POLICY "Public full access on vip_settings" ON public.vip_settings FOR ALL TO anon USING (true) WITH CHECK (true);
