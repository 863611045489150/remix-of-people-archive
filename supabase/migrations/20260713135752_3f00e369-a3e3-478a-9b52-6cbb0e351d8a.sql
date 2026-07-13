-- Recreate schema in the newly connected Supabase project

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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.friends TO authenticated;
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read site settings" ON public.site_settings FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.site_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Role system
CREATE TYPE public.app_role AS ENUM ('admin');

CREATE TABLE public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.bootstrap_first_admin()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE admin_count int;
BEGIN
  SELECT count(*) INTO admin_count FROM public.user_roles WHERE role = 'admin';
  IF admin_count > 0 THEN RETURN false; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), 'admin');
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bootstrap_first_admin() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_admin() TO authenticated;

-- Admin write policies
CREATE POLICY "Admins can manage friends" ON public.friends
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage site settings" ON public.site_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Storage policies for friend-photos bucket (bucket created separately)
CREATE POLICY "Public read friend photos" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'friend-photos');

CREATE POLICY "Admins can upload friend photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'friend-photos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update friend photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'friend-photos' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'friend-photos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete friend photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'friend-photos' AND public.has_role(auth.uid(), 'admin'));
