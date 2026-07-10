
CREATE TABLE public.friends (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Best Friend','Close Female Friends','Close Male Friends','Just Friends','Inspirational Friends')),
  photo_url TEXT NOT NULL,
  quote TEXT,
  instagram_url TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.friends TO anon;
GRANT SELECT ON public.friends TO authenticated;
GRANT ALL ON public.friends TO service_role;

ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read friends" ON public.friends FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.site_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  hero_name TEXT NOT NULL DEFAULT 'Aarush''s special mentions',
  hero_tagline TEXT NOT NULL DEFAULT 'Not everyone stays close. These did.',
  hero_photo_url TEXT,
  stat_label TEXT NOT NULL DEFAULT 'People Who Made the Cut',
  profile_url TEXT NOT NULL DEFAULT '#',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.site_settings TO anon;
GRANT SELECT ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read site settings" ON public.site_settings FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.site_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
