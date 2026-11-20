-- Table de suivi GPS en temps réel des véhicules VIP Connect
CREATE TABLE IF NOT EXISTS public.vip_vehicle_locations (
    vehicle_id INTEGER PRIMARY KEY,
    vehicle_name TEXT DEFAULT 'Changan VIP #1',
    route TEXT DEFAULT 'Douala - Yaoundé',
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    speed_kmh NUMERIC DEFAULT 0,
    heading NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'en_attente',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.vip_vehicle_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access on vip_vehicle_locations" ON public.vip_vehicle_locations;
CREATE POLICY "Public full access on vip_vehicle_locations" ON public.vip_vehicle_locations FOR ALL TO anon USING (true) WITH CHECK (true);

-- Position initiale par défaut à l'agence de Douala (Bonamoussadi / KEVAS SARL)
INSERT INTO public.vip_vehicle_locations (vehicle_id, vehicle_name, route, lat, lng, speed_kmh, status)
VALUES (1, 'Changan VIP #1', 'Douala - Yaoundé', 4.0910, 9.7405, 0, 'en_attente')
ON CONFLICT (vehicle_id) DO NOTHING;
