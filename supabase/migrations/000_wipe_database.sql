-- ==========================================
-- FILE: 000_wipe_database.sql
-- Description: Wipe app-owned objects, then rebuild the canonical Chito Mitho schema
-- ==========================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS private;

DROP POLICY IF EXISTS "Public Read Access" ON storage.objects;
DROP POLICY IF EXISTS "Owner Insert Access" ON storage.objects;
DROP POLICY IF EXISTS "Owner Update Access" ON storage.objects;
DROP POLICY IF EXISTS "Owner Delete Access" ON storage.objects;

DROP TABLE IF EXISTS public.contact_submissions CASCADE;
DROP TABLE IF EXISTS public.user_notifications CASCADE;
DROP TABLE IF EXISTS public.order_line_items CASCADE;
DROP TABLE IF EXISTS public.rider_locations CASCADE;
DROP TABLE IF EXISTS public.customer_orders CASCADE;
DROP TABLE IF EXISTS public.restaurant_menu_items CASCADE;
DROP TABLE IF EXISTS public.restaurants CASCADE;
DROP TABLE IF EXISTS public.user_profiles CASCADE;

DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.order_items CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.menu_items CASCADE;
DROP TABLE IF EXISTS public.food_places CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

DROP FUNCTION IF EXISTS public.admin_delete_profile(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.admin_set_profile_status(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.admin_verify_rider_application(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.admin_verify_restaurant_application(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.current_user_is_admin() CASCADE;
DROP FUNCTION IF EXISTS public.current_user_is_verified_rider() CASCADE;
DROP FUNCTION IF EXISTS public.sync_login_profile() CASCADE;
DROP FUNCTION IF EXISTS private.sync_login_profile() CASCADE;
DROP FUNCTION IF EXISTS private.can_view_profile(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.update_rider_location(UUID, FLOAT8, FLOAT8, FLOAT8, FLOAT8, FLOAT8) CASCADE;
DROP FUNCTION IF EXISTS public.create_order_notifications() CASCADE;
DROP FUNCTION IF EXISTS public.protect_customer_order_customer_fields() CASCADE;
DROP FUNCTION IF EXISTS public.protect_restaurant_owner_fields() CASCADE;
DROP FUNCTION IF EXISTS public.protect_profile_admin_fields() CASCADE;
DROP FUNCTION IF EXISTS public.set_updated_at() CASCADE;

DROP TYPE IF EXISTS public.payment_method CASCADE;
DROP TYPE IF EXISTS public.payment_status CASCADE;
DROP TYPE IF EXISTS public.order_status CASCADE;
DROP TYPE IF EXISTS public.verification_status CASCADE;
DROP TYPE IF EXISTS public.user_role CASCADE;

CREATE TYPE public.user_role AS ENUM ('customer', 'restaurant_owner', 'rider', 'admin');
CREATE TYPE public.verification_status AS ENUM ('pending', 'verified', 'suspended', 'rejected');
CREATE TYPE public.order_status AS ENUM (
  'placed',
  'accepted',
  'cooking',
  'ready_for_pickup',
  'picked_up',
  'arrived',
  'delivered',
  'cancelled'
);
CREATE TYPE public.payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded');
CREATE TYPE public.payment_method AS ENUM ('cash', 'esewa');

CREATE TABLE public.user_profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  role public.user_role NOT NULL DEFAULT 'customer',
  avatar_url TEXT,
  verification_status public.verification_status NOT NULL DEFAULT 'verified',
  is_online BOOLEAN NOT NULL DEFAULT FALSE,
  vehicle_details TEXT,
  bike_model TEXT,
  bike_condition TEXT,
  license_front_url TEXT,
  license_back_url TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.restaurants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  banner_url TEXT,
  profile_image_url TEXT,
  address TEXT NOT NULL,
  formatted_address TEXT NOT NULL,
  google_place_id TEXT,
  latitude FLOAT8 CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude FLOAT8 CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  contact_phone TEXT,
  contact_email TEXT,
  operating_hours JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(operating_hours) = 'array'),
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  verification_status public.verification_status NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id)
);

CREATE TABLE public.restaurant_menu_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL CHECK (price > 0),
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  category TEXT NOT NULL DEFAULT 'Specials',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.customer_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES public.user_profiles(id) NOT NULL,
  restaurant_id UUID REFERENCES public.restaurants(id) NOT NULL,
  rider_id UUID REFERENCES public.user_profiles(id),
  subtotal NUMERIC NOT NULL CHECK (subtotal >= 0),
  delivery_fee NUMERIC NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  total_amount NUMERIC NOT NULL CHECK (total_amount >= 0),
  status public.order_status NOT NULL DEFAULT 'placed',
  delivery_address TEXT NOT NULL,
  delivery_place_id TEXT,
  delivery_lat FLOAT8 CHECK (delivery_lat IS NULL OR delivery_lat BETWEEN -90 AND 90),
  delivery_lng FLOAT8 CHECK (delivery_lng IS NULL OR delivery_lng BETWEEN -180 AND 180),
  rider_lat FLOAT8 CHECK (rider_lat IS NULL OR rider_lat BETWEEN -90 AND 90),
  rider_lng FLOAT8 CHECK (rider_lng IS NULL OR rider_lng BETWEEN -180 AND 180),
  rider_heading FLOAT8 CHECK (rider_heading IS NULL OR rider_heading >= 0),
  rider_speed_mps FLOAT8 CHECK (rider_speed_mps IS NULL OR rider_speed_mps >= 0),
  rider_accuracy_m FLOAT8 CHECK (rider_accuracy_m IS NULL OR rider_accuracy_m >= 0),
  rider_location_updated_at TIMESTAMPTZ,
  estimated_arrival_minutes INT CHECK (estimated_arrival_minutes IS NULL OR estimated_arrival_minutes >= 0),
  payment_status public.payment_status NOT NULL DEFAULT 'pending',
  payment_method public.payment_method NOT NULL DEFAULT 'cash',
  payment_provider TEXT,
  payment_reference TEXT,
  payment_intent_id TEXT,
  payment_amount NUMERIC CHECK (payment_amount IS NULL OR payment_amount >= 0),
  payment_currency TEXT NOT NULL DEFAULT 'NPR',
  payment_metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(payment_metadata) = 'object'),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.rider_locations (
  rider_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE PRIMARY KEY,
  active_order_id UUID REFERENCES public.customer_orders(id) ON DELETE SET NULL,
  latitude FLOAT8 NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude FLOAT8 NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  heading FLOAT8 CHECK (heading IS NULL OR heading >= 0),
  speed_mps FLOAT8 CHECK (speed_mps IS NULL OR speed_mps >= 0),
  accuracy_m FLOAT8 CHECK (accuracy_m IS NULL OR accuracy_m >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.order_line_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES public.customer_orders(id) ON DELETE CASCADE NOT NULL,
  menu_item_id UUID REFERENCES public.restaurant_menu_items(id) NOT NULL,
  item_name TEXT NOT NULL,
  item_price NUMERIC NOT NULL CHECK (item_price >= 0),
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.user_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX user_profiles_role_idx ON public.user_profiles(role);
CREATE INDEX user_profiles_verification_status_idx ON public.user_profiles(verification_status);
CREATE INDEX restaurants_owner_id_idx ON public.restaurants(owner_id);
CREATE INDEX restaurants_location_idx ON public.restaurants(latitude, longitude);
CREATE INDEX restaurants_active_status_idx ON public.restaurants(is_active, verification_status);
CREATE INDEX restaurant_menu_items_restaurant_id_idx ON public.restaurant_menu_items(restaurant_id);
CREATE INDEX customer_orders_customer_id_idx ON public.customer_orders(customer_id);
CREATE INDEX customer_orders_restaurant_id_idx ON public.customer_orders(restaurant_id);
CREATE INDEX customer_orders_rider_id_status_idx ON public.customer_orders(rider_id, status);
CREATE INDEX customer_orders_rider_location_updated_at_idx ON public.customer_orders(rider_location_updated_at);
CREATE INDEX order_line_items_order_id_idx ON public.order_line_items(order_id);
CREATE INDEX user_notifications_user_id_idx ON public.user_notifications(user_id);
CREATE INDEX rider_locations_active_order_id_idx ON public.rider_locations(active_order_id);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_profiles_set_updated_at
BEFORE UPDATE ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER restaurants_set_updated_at
BEFORE UPDATE ON public.restaurants
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER restaurant_menu_items_set_updated_at
BEFORE UPDATE ON public.restaurant_menu_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER customer_orders_set_updated_at
BEFORE UPDATE ON public.customer_orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.protect_profile_admin_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  is_rider_application BOOLEAN;
BEGIN
  IF auth.uid() = NEW.id AND NOT public.current_user_is_admin() THEN
    is_rider_application :=
      OLD.role IN ('customer', 'rider')
      AND OLD.verification_status IN ('verified', 'pending', 'rejected')
      AND NEW.role = 'rider'
      AND NEW.verification_status = 'pending'
      AND COALESCE(NULLIF(NEW.bike_model, ''), '') <> ''
      AND COALESCE(NULLIF(NEW.bike_condition, ''), '') <> ''
      AND COALESCE(NULLIF(NEW.license_front_url, ''), '') <> ''
      AND COALESCE(NULLIF(NEW.license_back_url, ''), '') <> '';

    IF is_rider_application THEN
      NEW.is_online = FALSE;
      NEW.rejection_reason = NULL;
    ELSE
      NEW.role = OLD.role;
      NEW.verification_status = OLD.verification_status;
      NEW.rejection_reason = OLD.rejection_reason;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_restaurant_owner_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = NEW.owner_id AND NOT public.current_user_is_admin() THEN
    IF OLD.verification_status = 'rejected' AND NEW.verification_status = 'pending' THEN
      NEW.rejection_reason = NULL;
    ELSE
      NEW.verification_status = OLD.verification_status;
      NEW.rejection_reason = OLD.rejection_reason;
    END IF;

    IF OLD.verification_status <> 'verified' THEN
      NEW.is_active = FALSE;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_customer_order_customer_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = OLD.customer_id
     AND NOT public.current_user_is_admin()
     AND NOT EXISTS (
       SELECT 1
       FROM public.restaurants
       WHERE restaurants.id = OLD.restaurant_id
         AND restaurants.owner_id = auth.uid()
     )
     AND COALESCE(OLD.rider_id, '00000000-0000-0000-0000-000000000000'::UUID) <> auth.uid()
  THEN
    NEW.customer_id = OLD.customer_id;
    NEW.restaurant_id = OLD.restaurant_id;
    NEW.rider_id = OLD.rider_id;
    NEW.subtotal = OLD.subtotal;
    NEW.delivery_fee = OLD.delivery_fee;
    NEW.total_amount = OLD.total_amount;
    NEW.status = OLD.status;
    NEW.delivery_address = OLD.delivery_address;
    NEW.delivery_place_id = OLD.delivery_place_id;
    NEW.delivery_lat = OLD.delivery_lat;
    NEW.delivery_lng = OLD.delivery_lng;
    NEW.rider_lat = OLD.rider_lat;
    NEW.rider_lng = OLD.rider_lng;
    NEW.rider_heading = OLD.rider_heading;
    NEW.rider_speed_mps = OLD.rider_speed_mps;
    NEW.rider_accuracy_m = OLD.rider_accuracy_m;
    NEW.rider_location_updated_at = OLD.rider_location_updated_at;
    NEW.estimated_arrival_minutes = OLD.estimated_arrival_minutes;
    NEW.created_at = OLD.created_at;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER user_profiles_protect_admin_fields
BEFORE UPDATE ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_admin_fields();

CREATE TRIGGER restaurants_protect_owner_fields
BEFORE UPDATE ON public.restaurants
FOR EACH ROW EXECUTE FUNCTION public.protect_restaurant_owner_fields();

CREATE TRIGGER customer_orders_protect_customer_fields
BEFORE UPDATE ON public.customer_orders
FOR EACH ROW EXECUTE FUNCTION public.protect_customer_order_customer_fields();

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rider_locations ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

GRANT SELECT ON TABLE
  public.restaurants,
  public.restaurant_menu_items
TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.user_profiles,
  public.restaurants,
  public.restaurant_menu_items,
  public.customer_orders,
  public.order_line_items,
  public.user_notifications,
  public.rider_locations
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.user_profiles,
  public.restaurants,
  public.restaurant_menu_items,
  public.customer_orders,
  public.order_line_items,
  public.user_notifications,
  public.rider_locations
TO service_role;

CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
    AND COALESCE(auth.jwt() -> 'app_metadata' ->> 'verification_status', 'verified') = 'verified';
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_verified_rider()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'rider'
    AND COALESCE(auth.jwt() -> 'app_metadata' ->> 'verification_status', '') = 'verified';
$$;

CREATE OR REPLACE FUNCTION private.can_view_profile(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.customer_orders co
    WHERE co.customer_id = p_profile_id
      AND (
        co.customer_id = auth.uid()
        OR co.rider_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.restaurants r
          WHERE r.id = co.restaurant_id
            AND r.owner_id = auth.uid()
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_is_verified_rider() TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_view_profile(UUID) TO authenticated;

CREATE POLICY "Users view connected profiles"
ON public.user_profiles FOR SELECT
USING (
  auth.uid() = id
  OR public.current_user_is_admin()
  OR private.can_view_profile(user_profiles.id)
);

CREATE POLICY "Admins manage profiles"
ON public.user_profiles FOR ALL
USING (public.current_user_is_admin())
WITH CHECK (public.current_user_is_admin());

CREATE POLICY "Users insert own profile"
ON public.user_profiles FOR INSERT
WITH CHECK (
  auth.uid() = id
  AND role <> 'admin'
  AND (
    verification_status = 'verified'
    OR (
      role = 'rider'
      AND verification_status = 'pending'
      AND COALESCE(NULLIF(bike_model, ''), '') <> ''
      AND COALESCE(NULLIF(bike_condition, ''), '') <> ''
      AND COALESCE(NULLIF(license_front_url, ''), '') <> ''
      AND COALESCE(NULLIF(license_back_url, ''), '') <> ''
    )
  )
);

CREATE POLICY "Users update own profile"
ON public.user_profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Visible restaurants are readable"
ON public.restaurants FOR SELECT
USING (
  (restaurants.is_active = TRUE AND restaurants.verification_status = 'verified')
  OR restaurants.owner_id = auth.uid()
  OR public.current_user_is_admin()
);

CREATE POLICY "Admins manage restaurants"
ON public.restaurants FOR ALL
USING (public.current_user_is_admin())
WITH CHECK (public.current_user_is_admin());

CREATE POLICY "Owners insert their restaurant"
ON public.restaurants FOR INSERT
WITH CHECK (
  auth.uid() = owner_id
  AND is_active = FALSE
  AND verification_status = 'pending'
);

CREATE POLICY "Owners update their restaurant"
ON public.restaurants FOR UPDATE
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Visible menu items are readable"
ON public.restaurant_menu_items FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.restaurants
    WHERE restaurants.id = restaurant_menu_items.restaurant_id
      AND (
        (is_active = TRUE AND verification_status = 'verified' AND restaurant_menu_items.is_available = TRUE)
        OR restaurants.owner_id = auth.uid()
        OR public.current_user_is_admin()
      )
  )
);

CREATE POLICY "Owners manage their menu"
ON public.restaurant_menu_items FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.restaurants
    WHERE restaurants.id = restaurant_menu_items.restaurant_id
      AND restaurants.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.restaurants
    WHERE restaurants.id = restaurant_menu_items.restaurant_id
      AND restaurants.owner_id = auth.uid()
  )
);

CREATE POLICY "Admins manage menu"
ON public.restaurant_menu_items FOR ALL
USING (public.current_user_is_admin())
WITH CHECK (public.current_user_is_admin());

CREATE POLICY "Customers view own orders"
ON public.customer_orders FOR SELECT
USING (auth.uid() = customer_id);

CREATE POLICY "Customers create placed orders"
ON public.customer_orders FOR INSERT
WITH CHECK (auth.uid() = customer_id AND status = 'placed');

CREATE POLICY "Customers update own payment fields"
ON public.customer_orders FOR UPDATE
USING (auth.uid() = customer_id)
WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Restaurants view their orders"
ON public.customer_orders FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.restaurants
    WHERE restaurants.id = customer_orders.restaurant_id
      AND restaurants.owner_id = auth.uid()
  )
);

CREATE POLICY "Restaurants update their orders"
ON public.customer_orders FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.restaurants
    WHERE restaurants.id = customer_orders.restaurant_id
      AND restaurants.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.restaurants
    WHERE restaurants.id = customer_orders.restaurant_id
      AND restaurants.owner_id = auth.uid()
  )
);

CREATE POLICY "Customers delete own placed orders"
ON public.customer_orders FOR DELETE
USING (auth.uid() = customer_id AND status = 'placed');

CREATE POLICY "Riders view ready or own orders"
ON public.customer_orders FOR SELECT
USING (
  public.current_user_is_verified_rider()
  AND (status = 'ready_for_pickup' OR rider_id = auth.uid())
);

CREATE POLICY "Riders update claimed orders"
ON public.customer_orders FOR UPDATE
USING (
  public.current_user_is_verified_rider()
  AND (customer_orders.rider_id = auth.uid() OR customer_orders.rider_id IS NULL)
)
WITH CHECK (
  public.current_user_is_verified_rider()
  AND customer_orders.rider_id = auth.uid()
);

CREATE POLICY "Admins view all orders"
ON public.customer_orders FOR SELECT
USING (public.current_user_is_admin());

CREATE POLICY "Order items viewable by participants"
ON public.order_line_items FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.customer_orders
    WHERE customer_orders.id = order_line_items.order_id
      AND (
        customer_orders.customer_id = auth.uid()
        OR customer_orders.rider_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.restaurants
          WHERE restaurants.id = customer_orders.restaurant_id
            AND restaurants.owner_id = auth.uid()
        )
        OR public.current_user_is_admin()
      )
  )
);

CREATE POLICY "Customers insert order items"
ON public.order_line_items FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.customer_orders
    WHERE customer_orders.id = order_line_items.order_id
      AND customer_orders.customer_id = auth.uid()
  )
);

CREATE POLICY "Users manage own notifications"
ON public.user_notifications FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view notifications"
ON public.user_notifications FOR SELECT
USING (public.current_user_is_admin());

CREATE POLICY "Riders manage own location"
ON public.rider_locations FOR ALL
USING (auth.uid() = rider_id)
WITH CHECK (auth.uid() = rider_id);

CREATE POLICY "Customers view active rider locations"
ON public.rider_locations FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.customer_orders
    WHERE customer_orders.rider_id = rider_locations.rider_id
      AND customer_orders.customer_id = auth.uid()
      AND customer_orders.status IN ('ready_for_pickup', 'picked_up', 'arrived')
  )
);

CREATE POLICY "Restaurants view active rider locations"
ON public.rider_locations FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.customer_orders
    JOIN public.restaurants ON restaurants.id = customer_orders.restaurant_id
    WHERE customer_orders.rider_id = rider_locations.rider_id
      AND restaurants.owner_id = auth.uid()
      AND customer_orders.status IN ('ready_for_pickup', 'picked_up', 'arrived')
  )
);

CREATE POLICY "Admins view rider locations"
ON public.rider_locations FOR SELECT
USING (public.current_user_is_admin());

-- ==========================================
-- Contact submissions (landing page form)
-- ==========================================
CREATE TABLE public.contact_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;

GRANT INSERT ON TABLE public.contact_submissions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contact_submissions TO authenticated, service_role;

CREATE POLICY "Anyone can submit contact form"
ON public.contact_submissions FOR INSERT
WITH CHECK (TRUE);

CREATE POLICY "Admins can read contact submissions"
ON public.contact_submissions FOR SELECT
USING (public.current_user_is_admin());

CREATE POLICY "Admins can update contact submissions"
ON public.contact_submissions FOR UPDATE
USING (public.current_user_is_admin())
WITH CHECK (public.current_user_is_admin());

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('avatars', 'avatars', true),
  ('restaurant_images', 'restaurant_images', true),
  ('rider_documents', 'rider_documents', true)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;

CREATE POLICY "Public Read Access"
ON storage.objects FOR SELECT
USING (bucket_id IN ('avatars', 'restaurant_images', 'rider_documents'));

CREATE POLICY "Owner Insert Access"
ON storage.objects FOR INSERT
WITH CHECK (
  auth.role() = 'authenticated'
  AND bucket_id IN ('avatars', 'restaurant_images', 'rider_documents')
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Owner Update Access"
ON storage.objects FOR UPDATE
USING (
  auth.role() = 'authenticated'
  AND bucket_id IN ('avatars', 'restaurant_images', 'rider_documents')
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  auth.role() = 'authenticated'
  AND bucket_id IN ('avatars', 'restaurant_images', 'rider_documents')
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Owner Delete Access"
ON storage.objects FOR DELETE
USING (
  auth.role() = 'authenticated'
  AND bucket_id IN ('avatars', 'restaurant_images', 'rider_documents')
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE OR REPLACE FUNCTION private.sync_login_profile()
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  role public.user_role,
  avatar_url TEXT,
  verification_status public.verification_status,
  is_online BOOLEAN,
  vehicle_details TEXT,
  bike_model TEXT,
  bike_condition TEXT,
  license_front_url TEXT,
  license_back_url TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  current_phone TEXT;
  current_phone_digits TEXT;
  current_phone_national_digits TEXT;
  current_email TEXT;
  matched_profile public.user_profiles%ROWTYPE;
  synced_profile public.user_profiles%ROWTYPE;
  archived_email TEXT;
  archived_phone TEXT;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT u.phone, u.email
  INTO current_phone, current_email
  FROM auth.users u
  WHERE u.id = current_user_id;

  current_phone := COALESCE(NULLIF(current_phone, ''), auth.jwt() ->> 'phone');
  current_phone_digits := REGEXP_REPLACE(COALESCE(current_phone, ''), '\D', '', 'g');
  current_phone_national_digits := RIGHT(current_phone_digits, 10);

  SELECT *
  INTO synced_profile
  FROM public.user_profiles p
  WHERE p.id = current_user_id;

  IF synced_profile.id IS NULL AND current_phone IS NOT NULL AND current_phone <> '' THEN
    SELECT *
    INTO matched_profile
    FROM public.user_profiles p
    WHERE p.phone = current_phone
      OR REGEXP_REPLACE(COALESCE(p.phone, ''), '\D', '', 'g') = current_phone_digits
      OR REGEXP_REPLACE(COALESCE(p.phone, ''), '\D', '', 'g') = current_phone_national_digits
    ORDER BY p.created_at ASC
    LIMIT 1;

    IF matched_profile.id IS NOT NULL THEN
      archived_email := 'archived-' || matched_profile.id::TEXT || '@chitomitho.local';
      archived_phone := matched_profile.phone || '#archived-' || SUBSTRING(matched_profile.id::TEXT FROM 1 FOR 8);

      UPDATE public.user_profiles p
      SET email = archived_email,
          phone = archived_phone,
          updated_at = NOW()
      WHERE p.id = matched_profile.id;

      INSERT INTO public.user_profiles (
        id,
        full_name,
        email,
        phone,
        role,
        avatar_url,
        verification_status,
        is_online,
        vehicle_details,
        bike_model,
        bike_condition,
        license_front_url,
        license_back_url,
        rejection_reason,
        created_at,
        updated_at
      )
      VALUES (
        current_user_id,
        matched_profile.full_name,
        COALESCE(NULLIF(current_email, ''), matched_profile.email),
        current_phone,
        matched_profile.role,
        matched_profile.avatar_url,
        matched_profile.verification_status,
        matched_profile.is_online,
        matched_profile.vehicle_details,
        matched_profile.bike_model,
        matched_profile.bike_condition,
        matched_profile.license_front_url,
        matched_profile.license_back_url,
        matched_profile.rejection_reason,
        matched_profile.created_at,
        NOW()
      )
      RETURNING * INTO synced_profile;

      UPDATE public.restaurants
      SET owner_id = current_user_id
      WHERE restaurants.owner_id = matched_profile.id;

      UPDATE public.customer_orders
      SET customer_id = current_user_id
      WHERE customer_orders.customer_id = matched_profile.id;

      UPDATE public.customer_orders
      SET rider_id = current_user_id
      WHERE customer_orders.rider_id = matched_profile.id;

      UPDATE public.rider_locations
      SET rider_id = current_user_id
      WHERE rider_locations.rider_id = matched_profile.id;

      UPDATE public.user_notifications
      SET user_id = current_user_id
      WHERE user_notifications.user_id = matched_profile.id;

      DELETE FROM public.user_profiles
      WHERE user_profiles.id = matched_profile.id;
    END IF;
  END IF;

  IF synced_profile.id IS NOT NULL THEN
    UPDATE public.user_profiles p
    SET verification_status = CASE
          WHEN p.role = 'customer' AND p.verification_status = 'pending' THEN 'verified'::public.verification_status
          ELSE p.verification_status
        END,
        updated_at = NOW()
    WHERE p.id = synced_profile.id
    RETURNING * INTO synced_profile;

    UPDATE auth.users u
    SET raw_app_meta_data = COALESCE(u.raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object(
        'role', synced_profile.role,
        'verification_status', synced_profile.verification_status
      ),
      raw_user_meta_data = COALESCE(u.raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object(
        'full_name', synced_profile.full_name,
        'phone', synced_profile.phone,
        'email', synced_profile.email
      )
    WHERE u.id = current_user_id;

    RETURN QUERY
    SELECT
      synced_profile.id,
      synced_profile.full_name,
      synced_profile.email,
      synced_profile.phone,
      synced_profile.role,
      synced_profile.avatar_url,
      synced_profile.verification_status,
      synced_profile.is_online,
      synced_profile.vehicle_details,
      synced_profile.bike_model,
      synced_profile.bike_condition,
      synced_profile.license_front_url,
      synced_profile.license_back_url,
      synced_profile.rejection_reason,
      synced_profile.created_at;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_login_profile()
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  role public.user_role,
  avatar_url TEXT,
  verification_status public.verification_status,
  is_online BOOLEAN,
  vehicle_details TEXT,
  bike_model TEXT,
  bike_condition TEXT,
  license_front_url TEXT,
  license_back_url TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE SQL
SET search_path = public
AS $$
  SELECT * FROM private.sync_login_profile();
$$;

CREATE OR REPLACE FUNCTION public.admin_verify_restaurant_application(p_restaurant_id UUID)
RETURNS TABLE (
  id UUID,
  owner_id UUID,
  name TEXT,
  description TEXT,
  image_url TEXT,
  banner_url TEXT,
  profile_image_url TEXT,
  address TEXT,
  formatted_address TEXT,
  google_place_id TEXT,
  latitude FLOAT8,
  longitude FLOAT8,
  contact_phone TEXT,
  contact_email TEXT,
  is_active BOOLEAN,
  verification_status public.verification_status,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_owner_id UUID;
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  SELECT r.owner_id
  INTO target_owner_id
  FROM public.restaurants r
  WHERE r.id = p_restaurant_id;

  IF target_owner_id IS NULL THEN
    RAISE EXCEPTION 'Restaurant application not found.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.restaurants r
  SET verification_status = 'verified',
      is_active = TRUE,
      rejection_reason = NULL
  WHERE r.id = p_restaurant_id;

  UPDATE public.user_profiles p
  SET role = 'restaurant_owner',
      verification_status = 'verified',
      rejection_reason = NULL
  WHERE p.id = target_owner_id;

  UPDATE auth.users u
  SET raw_app_meta_data = COALESCE(u.raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', 'restaurant_owner', 'verification_status', 'verified')
  WHERE u.id = target_owner_id;

  RETURN QUERY
  SELECT
    r.id,
    r.owner_id,
    r.name,
    r.description,
    r.image_url,
    r.banner_url,
    r.profile_image_url,
    r.address,
    r.formatted_address,
    r.google_place_id,
    r.latitude,
    r.longitude,
    r.contact_phone,
    r.contact_email,
    r.is_active,
    r.verification_status,
    r.created_at
  FROM public.restaurants r
  WHERE r.id = p_restaurant_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_verify_rider_application(p_profile_id UUID)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  role public.user_role,
  avatar_url TEXT,
  verification_status public.verification_status,
  is_online BOOLEAN,
  vehicle_details TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  UPDATE public.user_profiles p
  SET role = 'rider',
      verification_status = 'verified',
      is_online = FALSE,
      rejection_reason = NULL
  WHERE p.id = p_profile_id
  RETURNING
    p.id,
    p.full_name,
    p.email,
    p.phone,
    p.role,
    p.avatar_url,
    p.verification_status,
    p.is_online,
    p.vehicle_details,
    p.created_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rider application not found.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE auth.users u
  SET raw_app_meta_data = COALESCE(u.raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', 'rider', 'verification_status', 'verified')
  WHERE u.id = p_profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_profile_status(p_profile_id UUID, p_status TEXT)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  role public.user_role,
  avatar_url TEXT,
  verification_status public.verification_status,
  is_online BOOLEAN,
  vehicle_details TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_status TEXT := LOWER(TRIM(COALESCE(p_status, '')));
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  IF normalized_status NOT IN ('pending', 'verified', 'suspended') THEN
    RAISE EXCEPTION 'Unsupported account status.' USING ERRCODE = '22023';
  END IF;

  IF p_profile_id = auth.uid() AND normalized_status = 'suspended' THEN
    RAISE EXCEPTION 'Admins cannot suspend their own account.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  UPDATE public.user_profiles p
  SET verification_status = normalized_status::public.verification_status,
      is_online = CASE WHEN normalized_status = 'suspended' THEN FALSE ELSE p.is_online END
  WHERE p.id = p_profile_id
  RETURNING
    p.id,
    p.full_name,
    p.email,
    p.phone,
    p.role,
    p.avatar_url,
    p.verification_status,
    p.is_online,
    p.vehicle_details,
    p.created_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE auth.users u
  SET raw_app_meta_data = COALESCE(u.raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('verification_status', normalized_status)
  WHERE u.id = p_profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_profile(p_profile_id UUID)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  role public.user_role,
  avatar_url TEXT,
  verification_status public.verification_status,
  is_online BOOLEAN,
  vehicle_details TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  IF p_profile_id = auth.uid() THEN
    RAISE EXCEPTION 'Admins cannot delete their own account.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  DELETE FROM public.user_profiles p
  WHERE p.id = p_profile_id
  RETURNING
    p.id,
    p.full_name,
    p.email,
    p.phone,
    p.role,
    p.avatar_url,
    p.verification_status,
    p.is_online,
    p.vehicle_details,
    p.created_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found.' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_rider_location(
  p_order_id UUID,
  p_latitude FLOAT8,
  p_longitude FLOAT8,
  p_heading FLOAT8 DEFAULT NULL,
  p_speed_mps FLOAT8 DEFAULT NULL,
  p_accuracy_m FLOAT8 DEFAULT NULL
)
RETURNS TABLE (
  order_id UUID,
  rider_id UUID,
  latitude FLOAT8,
  longitude FLOAT8,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_order public.customer_orders%ROWTYPE;
  current_rider_id UUID := auth.uid();
  location_time TIMESTAMPTZ := NOW();
BEGIN
  IF current_rider_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  IF p_latitude IS NULL OR p_latitude < -90 OR p_latitude > 90 THEN
    RAISE EXCEPTION 'Invalid latitude.' USING ERRCODE = '22023';
  END IF;

  IF p_longitude IS NULL OR p_longitude < -180 OR p_longitude > 180 THEN
    RAISE EXCEPTION 'Invalid longitude.' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO target_order
  FROM public.customer_orders
  WHERE customer_orders.id = p_order_id
    AND customer_orders.rider_id = current_rider_id
    AND customer_orders.status IN ('ready_for_pickup', 'picked_up', 'arrived');

  IF target_order.id IS NULL THEN
    RAISE EXCEPTION 'Active rider order not found.' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.rider_locations (
    rider_id,
    active_order_id,
    latitude,
    longitude,
    heading,
    speed_mps,
    accuracy_m,
    updated_at
  )
  VALUES (
    current_rider_id,
    p_order_id,
    p_latitude,
    p_longitude,
    p_heading,
    p_speed_mps,
    p_accuracy_m,
    location_time
  )
  ON CONFLICT ON CONSTRAINT rider_locations_pkey DO UPDATE
  SET
    active_order_id = EXCLUDED.active_order_id,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    heading = EXCLUDED.heading,
    speed_mps = EXCLUDED.speed_mps,
    accuracy_m = EXCLUDED.accuracy_m,
    updated_at = EXCLUDED.updated_at;

  UPDATE public.customer_orders
  SET
    rider_lat = p_latitude,
    rider_lng = p_longitude,
    rider_heading = p_heading,
    rider_speed_mps = p_speed_mps,
    rider_accuracy_m = p_accuracy_m,
    rider_location_updated_at = location_time,
    updated_at = location_time
  WHERE customer_orders.id = p_order_id
    AND customer_orders.rider_id = current_rider_id;

  RETURN QUERY
  SELECT
    p_order_id,
    current_rider_id,
    p_latitude,
    p_longitude,
    location_time;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_order_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_owner_id UUID;
  order_label TEXT;
BEGIN
  SELECT owner_id
  INTO target_owner_id
  FROM public.restaurants
  WHERE restaurants.id = NEW.restaurant_id;

  order_label := '#' || UPPER(SUBSTRING(REPLACE(NEW.id::TEXT, '-', '') FROM 1 FOR 8));

  IF TG_OP = 'INSERT' THEN
    IF target_owner_id IS NOT NULL THEN
      INSERT INTO public.user_notifications (user_id, title, message, type)
      VALUES (
        target_owner_id,
        'New order',
        'Order ' || order_label || ' is waiting in your kitchen queue.',
        'order_created'
      );
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.user_notifications (user_id, title, message, type)
    VALUES (
      NEW.customer_id,
      'Order update',
      'Order ' || order_label || ' is now ' || REPLACE(NEW.status::TEXT, '_', ' ') || '.',
      'order_status'
    );

    IF target_owner_id IS NOT NULL AND NEW.status IN ('picked_up', 'arrived', 'delivered', 'cancelled') THEN
      INSERT INTO public.user_notifications (user_id, title, message, type)
      VALUES (
        target_owner_id,
        'Delivery update',
        'Order ' || order_label || ' is now ' || REPLACE(NEW.status::TEXT, '_', ' ') || '.',
        'delivery_status'
      );
    END IF;

    IF NEW.status = 'ready_for_pickup' AND NEW.rider_id IS NULL THEN
      INSERT INTO public.user_notifications (user_id, title, message, type)
      SELECT
        p.id,
        'Pickup available',
        'Order ' || order_label || ' is ready for pickup.',
        'rider_job'
      FROM public.user_profiles p
      WHERE p.role = 'rider'
        AND p.verification_status = 'verified'
        AND p.is_online = TRUE;
    END IF;
  END IF;

  IF NEW.rider_id IS DISTINCT FROM OLD.rider_id AND NEW.rider_id IS NOT NULL THEN
    INSERT INTO public.user_notifications (user_id, title, message, type)
    VALUES (
      NEW.customer_id,
      'Rider assigned',
      'A rider accepted order ' || order_label || '.',
      'rider_assigned'
    );

    IF target_owner_id IS NOT NULL THEN
      INSERT INTO public.user_notifications (user_id, title, message, type)
      VALUES (
        target_owner_id,
        'Rider assigned',
        'A rider accepted order ' || order_label || '.',
        'rider_assigned'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER customer_orders_create_notifications
AFTER INSERT OR UPDATE ON public.customer_orders
FOR EACH ROW EXECUTE FUNCTION public.create_order_notifications();

GRANT EXECUTE ON FUNCTION public.admin_verify_restaurant_application(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_verify_rider_application(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_profile_status(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_rider_location(UUID, FLOAT8, FLOAT8, FLOAT8, FLOAT8, FLOAT8) TO authenticated;
GRANT EXECUTE ON FUNCTION private.sync_login_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_login_profile() TO authenticated;

DO $$
DECLARE
  realtime_table TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH realtime_table IN ARRAY ARRAY[
      'customer_orders',
      'rider_locations',
      'restaurants',
      'restaurant_menu_items',
      'user_notifications'
    ]
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = realtime_table
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', realtime_table);
      END IF;
    END LOOP;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
