-- ==========================================
-- FILE: 001_insert_mock_data.sql
-- Description: Admin account and mock app data for local/demo setup
-- Test OTP for all seeded phone accounts: 123456
-- Admin phone: 9800000000
-- Restaurant phone: 9800000001
-- Customer phone: 9800000100
-- Rider phone: 9800000200
-- ==========================================

CREATE SCHEMA IF NOT EXISTS private;

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
  vehicle_type TEXT,
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
        vehicle_type,
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
        matched_profile.vehicle_type,
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
        'email', synced_profile.email,
        'vehicle_type', synced_profile.vehicle_type,
        'vehicle_details', synced_profile.vehicle_details,
        'bike_model', synced_profile.bike_model,
        'bike_condition', synced_profile.bike_condition,
        'license_front_url', synced_profile.license_front_url,
        'license_back_url', synced_profile.license_back_url
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
      synced_profile.vehicle_type,
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
  vehicle_type TEXT,
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

GRANT USAGE ON SCHEMA private TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.sync_login_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_login_profile() TO authenticated;

DROP TABLE IF EXISTS pg_temp.seeded_profile_map;

CREATE TEMP TABLE seeded_profile_map ON COMMIT DROP AS
WITH seeded_profiles(seed_profile_id, seed_email, seed_phone) AS (
  VALUES
    ('00000000-0000-4000-8000-000000000001'::uuid, 'admin@chitomitho.local', '+9779800000000'),
    ('0b2f6b3e-6ce1-4e41-9eb5-1b7f0f11a111'::uuid, 'demo.restaurant1@chitomitho.local', '+9779800000001'),
    ('1c3a7d4f-8df2-4b52-aec6-2c8a1a22b222'::uuid, 'demo.restaurant2@chitomitho.local', '+9779800000002'),
    ('2d4b8e50-9ef3-4c63-bfd7-3d9b2b33c333'::uuid, 'demo.restaurant3@chitomitho.local', '+9779800000003'),
    ('33333333-3333-4333-8333-333333333333'::uuid, 'demo.customer@chitomitho.local', '+9779800000100'),
    ('44444444-4444-4444-8444-444444444444'::uuid, 'demo.rider@chitomitho.local', '+9779800000200')
)
SELECT
  p.id AS stale_id,
  s.seed_profile_id AS canonical_id
FROM public.user_profiles p
JOIN seeded_profiles s
  ON p.id <> s.seed_profile_id
  AND (
    LOWER(p.email) = LOWER(s.seed_email)
    OR RIGHT(REGEXP_REPLACE(COALESCE(p.phone, ''), '\D', '', 'g'), 10)
       = RIGHT(REGEXP_REPLACE(s.seed_phone, '\D', '', 'g'), 10)
  );

UPDATE public.user_profiles p
SET
  email = 'archived-' || p.id::TEXT || '@chitomitho.local',
  phone = 'archived-' || p.id::TEXT,
  verification_status = 'suspended',
  is_online = FALSE
FROM pg_temp.seeded_profile_map m
WHERE p.id = m.stale_id;

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  phone,
  phone_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'admin@chitomitho.local',
    NULL,
    NOW(),
    '+9779800000000',
    NOW(),
    '{"provider":"phone","providers":["phone"],"role":"admin","verification_status":"verified"}'::jsonb,
    '{"full_name":"Chito Mitho Admin","phone":"+9779800000000","email":"admin@chitomitho.local"}'::jsonb,
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '0b2f6b3e-6ce1-4e41-9eb5-1b7f0f11a111',
    'authenticated',
    'authenticated',
    'demo.restaurant1@chitomitho.local',
    NULL,
    NOW(),
    '+9779800000001',
    NOW(),
    '{"provider":"phone","providers":["phone"],"role":"restaurant_owner","verification_status":"verified"}'::jsonb,
    '{"full_name":"Himalayan Momo House","phone":"+9779800000001","email":"demo.restaurant1@chitomitho.local"}'::jsonb,
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '1c3a7d4f-8df2-4b52-aec6-2c8a1a22b222',
    'authenticated',
    'authenticated',
    'demo.restaurant2@chitomitho.local',
    NULL,
    NOW(),
    '+9779800000002',
    NOW(),
    '{"provider":"phone","providers":["phone"],"role":"restaurant_owner","verification_status":"verified"}'::jsonb,
    '{"full_name":"Kathmandu Spice Kitchen","phone":"+9779800000002","email":"demo.restaurant2@chitomitho.local"}'::jsonb,
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '2d4b8e50-9ef3-4c63-bfd7-3d9b2b33c333',
    'authenticated',
    'authenticated',
    'demo.restaurant3@chitomitho.local',
    NULL,
    NOW(),
    '+9779800000003',
    NOW(),
    '{"provider":"phone","providers":["phone"],"role":"restaurant_owner","verification_status":"verified"}'::jsonb,
    '{"full_name":"Newa Khaja Corner","phone":"+9779800000003","email":"demo.restaurant3@chitomitho.local"}'::jsonb,
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '33333333-3333-4333-8333-333333333333',
    'authenticated',
    'authenticated',
    'demo.customer@chitomitho.local',
    NULL,
    NOW(),
    '+9779800000100',
    NOW(),
    '{"provider":"phone","providers":["phone"],"role":"customer","verification_status":"verified"}'::jsonb,
    '{"full_name":"Demo Customer","phone":"+9779800000100","email":"demo.customer@chitomitho.local","address":"Herald College, Bhagwati marg, Sano Gaucharan","default_address_id":"address-home","saved_addresses":[{"id":"address-home","label":"College","address":"Herald College, Bhagwati marg, Sano Gaucharan","formattedAddress":"Herald College, Bhagwati marg, Sano Gaucharan, Kathmandu-01, Kathmandu Metropolitan City, Kathmandu, Bagamati Province, 44600, Nepal","coordinates":{"latitude":27.7106,"longitude":85.3239},"placeId":"demo-herald-college"}]}'::jsonb,
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '44444444-4444-4444-8444-444444444444',
    'authenticated',
    'authenticated',
    'demo.rider@chitomitho.local',
    NULL,
    NOW(),
    '+9779800000200',
    NOW(),
    '{"provider":"phone","providers":["phone"],"role":"rider","verification_status":"verified"}'::jsonb,
    '{"full_name":"Demo Rider","phone":"+9779800000200","email":"demo.rider@chitomitho.local","vehicle_type":"motorbike"}'::jsonb,
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  )
ON CONFLICT (id) DO UPDATE
SET
  email = EXCLUDED.email,
  encrypted_password = EXCLUDED.encrypted_password,
  email_confirmed_at = EXCLUDED.email_confirmed_at,
  phone = EXCLUDED.phone,
  phone_confirmed_at = EXCLUDED.phone_confirmed_at,
  raw_app_meta_data = EXCLUDED.raw_app_meta_data,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  updated_at = NOW();

INSERT INTO auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT
  u.id::TEXT,
  u.id,
  jsonb_build_object(
    'sub', u.id::TEXT,
    'phone', u.phone,
    'phone_verified', TRUE
  ),
  'phone',
  NOW(),
  NOW(),
  NOW()
FROM auth.users u
WHERE u.email IN (
  'admin@chitomitho.local',
  'demo.restaurant1@chitomitho.local',
  'demo.restaurant2@chitomitho.local',
  'demo.restaurant3@chitomitho.local',
  'demo.customer@chitomitho.local',
  'demo.rider@chitomitho.local'
)
ON CONFLICT (provider_id, provider) DO UPDATE
SET
  user_id = EXCLUDED.user_id,
  identity_data = EXCLUDED.identity_data,
  updated_at = NOW();

INSERT INTO public.user_profiles (
  id,
  full_name,
  email,
  phone,
  role,
  avatar_url,
  verification_status,
  is_online,
  vehicle_type,
  vehicle_details
)
VALUES
  (
    '00000000-0000-4000-8000-000000000001',
    'Chito Mitho Admin',
    'admin@chitomitho.local',
    '+9779800000000',
    'admin',
    NULL,
    'verified',
    FALSE,
    NULL,
    NULL
  ),
  (
    '0b2f6b3e-6ce1-4e41-9eb5-1b7f0f11a111',
    'Himalayan Momo House',
    'demo.restaurant1@chitomitho.local',
    '+9779800000001',
    'restaurant_owner',
    NULL,
    'verified',
    TRUE,
    NULL,
    NULL
  ),
  (
    '1c3a7d4f-8df2-4b52-aec6-2c8a1a22b222',
    'Kathmandu Spice Kitchen',
    'demo.restaurant2@chitomitho.local',
    '+9779800000002',
    'restaurant_owner',
    NULL,
    'verified',
    TRUE,
    NULL,
    NULL
  ),
  (
    '2d4b8e50-9ef3-4c63-bfd7-3d9b2b33c333',
    'Newa Khaja Corner',
    'demo.restaurant3@chitomitho.local',
    '+9779800000003',
    'restaurant_owner',
    NULL,
    'verified',
    TRUE,
    NULL,
    NULL
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'Demo Customer',
    'demo.customer@chitomitho.local',
    '+9779800000100',
    'customer',
    NULL,
    'verified',
    FALSE,
    NULL,
    NULL
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    'Demo Rider',
    'demo.rider@chitomitho.local',
    '+9779800000200',
    'rider',
    NULL,
    'verified',
    TRUE,
    'motorbike',
    'Vehicle: Motorbike. Model: Bike - BA 99 PA 1234'
  )
ON CONFLICT (id) DO UPDATE
SET
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  role = EXCLUDED.role,
  avatar_url = EXCLUDED.avatar_url,
  verification_status = EXCLUDED.verification_status,
  is_online = EXCLUDED.is_online,
  vehicle_type = EXCLUDED.vehicle_type,
  vehicle_details = EXCLUDED.vehicle_details;

INSERT INTO public.restaurants (
  id,
  owner_id,
  name,
  description,
  image_url,
  banner_url,
  profile_image_url,
  address,
  formatted_address,
  google_place_id,
  latitude,
  longitude,
  contact_phone,
  contact_email,
  is_active,
  verification_status
)
VALUES
  (
    '3e5c9f61-af04-4d74-c0e8-4eac3c44d444',
    '0b2f6b3e-6ce1-4e41-9eb5-1b7f0f11a111',
    'Himalayan Momo House',
    'Steamed and fried momo with fresh chutneys.',
    'https://images.unsplash.com/photo-1496116218417-1a781b1c416c?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1496116218417-1a781b1c416c?auto=format&fit=crop&w=1600&q=80',
    'https://images.unsplash.com/photo-1496116218417-1a781b1c416c?auto=format&fit=crop&w=600&q=80',
    'Lazimpat, Kathmandu',
    'Lazimpat, Kathmandu 44600, Nepal',
    'demo-lazimpat-kathmandu',
    27.7215,
    85.3188,
    '+9779800000001',
    'demo.restaurant1@chitomitho.local',
    TRUE,
    'verified'
  ),
  (
    '4f6da072-b105-4e85-d1f9-5fbd4d55e555',
    '1c3a7d4f-8df2-4b52-aec6-2c8a1a22b222',
    'Kathmandu Spice Kitchen',
    'Comfort meals with Nepali and Indo-fusion flavors.',
    'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=1600&q=80',
    'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=600&q=80',
    'Thamel, Kathmandu',
    'Thamel, Kathmandu 44600, Nepal',
    'demo-thamel-kathmandu',
    27.7154,
    85.3123,
    '+9779800000002',
    'demo.restaurant2@chitomitho.local',
    TRUE,
    'verified'
  ),
  (
    '607eb183-c216-4f96-e20a-60ce5e66f666',
    '2d4b8e50-9ef3-4c63-bfd7-3d9b2b33c333',
    'Newa Khaja Corner',
    'Traditional Newari snacks and evening sets.',
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1600&q=80',
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=600&q=80',
    'Patan Durbar Square, Lalitpur',
    'Patan Durbar Square, Lalitpur 44700, Nepal',
    'demo-patan-durbar-square',
    27.6727,
    85.3253,
    '+9779800000003',
    'demo.restaurant3@chitomitho.local',
    TRUE,
    'verified'
  )
ON CONFLICT (id) DO UPDATE
SET
  owner_id = EXCLUDED.owner_id,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  image_url = EXCLUDED.image_url,
  banner_url = EXCLUDED.banner_url,
  profile_image_url = EXCLUDED.profile_image_url,
  address = EXCLUDED.address,
  formatted_address = EXCLUDED.formatted_address,
  google_place_id = EXCLUDED.google_place_id,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  contact_phone = EXCLUDED.contact_phone,
  contact_email = EXCLUDED.contact_email,
  is_active = EXCLUDED.is_active,
  verification_status = EXCLUDED.verification_status;

INSERT INTO public.restaurant_menu_items (
  id,
  restaurant_id,
  name,
  description,
  price,
  is_available,
  category
)
VALUES
  ('718fc294-d327-4aa7-831b-71df6f77a777', '3e5c9f61-af04-4d74-c0e8-4eac3c44d444', 'Chicken Steam Momo', '10 pieces with tomato-sesame achar.', 220, TRUE, 'Momo'),
  ('a4b2f5c7-065a-4dda-a64e-a4f29210d101', '3e5c9f61-af04-4d74-c0e8-4eac3c44d444', 'Buff C-Momo', 'Pan-fried chili momo with onions and peppers.', 280, TRUE, 'Momo'),
  ('b5c3a6d8-176b-4eeb-b75f-b503a321e202', '3e5c9f61-af04-4d74-c0e8-4eac3c44d444', 'Jhol Momo', 'Steamed momo in spiced sesame broth.', 260, TRUE, 'Momo'),
  ('8290d3a5-e438-4bb8-942c-82e07088b888', '4f6da072-b105-4e85-d1f9-5fbd4d55e555', 'Paneer Butter Masala Set', 'Paneer curry with jeera rice and salad.', 360, TRUE, 'Rice Meals'),
  ('c6d4b7e9-287c-4ffc-c860-c614b432f303', '4f6da072-b105-4e85-d1f9-5fbd4d55e555', 'Chicken Biryani', 'Fragrant rice with spiced chicken and raita.', 390, TRUE, 'Rice Meals'),
  ('d7e5c8fa-398d-401d-d971-d725c543a404', '4f6da072-b105-4e85-d1f9-5fbd4d55e555', 'Butter Naan Basket', 'Set of 3 soft butter naan breads.', 140, TRUE, 'Breads'),
  ('93a1e4b6-f549-4cc9-a53d-93f18199c999', '607eb183-c216-4f96-e20a-60ce5e66f666', 'Newari Khaja Set', 'Beaten rice, choila, aloo achar, and egg.', 420, TRUE, 'Newari'),
  ('e8f6d90b-4a9e-412e-ea82-e836d654b505', '607eb183-c216-4f96-e20a-60ce5e66f666', 'Choila Platter', 'Smoky grilled buff choila with mustard oil.', 340, TRUE, 'Newari'),
  ('f907ea1c-5baf-423f-fb93-f947e765c606', '607eb183-c216-4f96-e20a-60ce5e66f666', 'Yomari Trio', 'Three yomari with chaku and khuwa filling.', 210, TRUE, 'Sweets')
ON CONFLICT (id) DO UPDATE
SET
  restaurant_id = EXCLUDED.restaurant_id,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  is_available = EXCLUDED.is_available,
  category = EXCLUDED.category;

INSERT INTO public.customer_orders (
  id,
  customer_id,
  restaurant_id,
  rider_id,
  subtotal,
  delivery_fee,
  total_amount,
  status,
  delivery_address,
  delivery_place_id,
  delivery_lat,
  delivery_lng,
  estimated_arrival_minutes,
  payment_status,
  payment_method,
  payment_amount,
  paid_at
)
VALUES
  (
    '55555555-5555-4555-8555-555555555555',
    '33333333-3333-4333-8333-333333333333',
    '3e5c9f61-af04-4d74-c0e8-4eac3c44d444',
    NULL,
    500,
    45,
    545,
    'placed',
    'Herald College, Bhagwati marg, Sano Gaucharan, Kathmandu-01, Kathmandu Metropolitan City, Kathmandu, Bagamati Province, 44600, Nepal',
    'demo-herald-college',
    27.7106,
    85.3239,
    NULL,
    'pending',
    'cash',
    545,
    NULL
  ),
  (
    '66666666-6666-4666-8666-666666666666',
    '33333333-3333-4333-8333-333333333333',
    '4f6da072-b105-4e85-d1f9-5fbd4d55e555',
    '44444444-4444-4444-8444-444444444444',
    390,
    60,
    450,
    'picked_up',
    'Herald College, Bhagwati marg, Sano Gaucharan, Kathmandu-01, Kathmandu Metropolitan City, Kathmandu, Bagamati Province, 44600, Nepal',
    'demo-herald-college',
    27.7106,
    85.3239,
    12,
    'paid',
    'esewa',
    450,
    NOW()
  )
ON CONFLICT (id) DO UPDATE
SET
  customer_id = EXCLUDED.customer_id,
  restaurant_id = EXCLUDED.restaurant_id,
  rider_id = EXCLUDED.rider_id,
  subtotal = EXCLUDED.subtotal,
  delivery_fee = EXCLUDED.delivery_fee,
  total_amount = EXCLUDED.total_amount,
  status = EXCLUDED.status,
  delivery_address = EXCLUDED.delivery_address,
  delivery_place_id = EXCLUDED.delivery_place_id,
  delivery_lat = EXCLUDED.delivery_lat,
  delivery_lng = EXCLUDED.delivery_lng,
  estimated_arrival_minutes = EXCLUDED.estimated_arrival_minutes,
  payment_status = EXCLUDED.payment_status,
  payment_method = EXCLUDED.payment_method,
  payment_amount = EXCLUDED.payment_amount,
  paid_at = EXCLUDED.paid_at;

INSERT INTO public.order_line_items (
  order_id,
  menu_item_id,
  item_name,
  item_price,
  quantity
)
VALUES
  ('55555555-5555-4555-8555-555555555555', '718fc294-d327-4aa7-831b-71df6f77a777', 'Chicken Steam Momo', 220, 1),
  ('55555555-5555-4555-8555-555555555555', 'b5c3a6d8-176b-4eeb-b75f-b503a321e202', 'Jhol Momo', 260, 1),
  ('66666666-6666-4666-8666-666666666666', 'c6d4b7e9-287c-4ffc-c860-c614b432f303', 'Chicken Biryani', 390, 1);

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
  '44444444-4444-4444-8444-444444444444',
  '66666666-6666-4666-8666-666666666666',
  27.7141,
  85.3188,
  80,
  6,
  12,
  NOW()
)
ON CONFLICT (rider_id) DO UPDATE
SET
  active_order_id = EXCLUDED.active_order_id,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  heading = EXCLUDED.heading,
  speed_mps = EXCLUDED.speed_mps,
  accuracy_m = EXCLUDED.accuracy_m,
  updated_at = EXCLUDED.updated_at;

-- Real Kathmandu restaurant seed data sourced from current Pathao Food listings.
-- These accounts are content owners only; demo login numbers above stay reserved for QA.
WITH real_restaurants (
  owner_id,
  restaurant_id,
  name,
  description,
  image_url,
  banner_url,
  profile_image_url,
  address,
  formatted_address,
  google_place_id,
  latitude,
  longitude,
  contact_phone,
  contact_email
) AS (
  VALUES
    ('00000000-0000-4000-9000-000000001001'::uuid, '00000000-0000-4000-9000-000000002001'::uuid, 'Dumdaar Momo', 'Momo shop with buff, pork, and chicken combos listed on Pathao Food.', 'https://storage.pathaofood.live/food/51755_banner.webp?ts=1757997466', 'https://storage.pathaofood.live/food/51755_banner.webp?ts=1757997466', 'https://storage.pathaofood.live/food/51755_logo.webp?ts=1743592185', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytonjv-dumdaar-momo', 27.7172, 85.3240, '+9779811001001', 'dumdaar.momo@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001002'::uuid, '00000000-0000-4000-9000-000000002002'::uuid, 'Marco''s Pizza', 'Small pizza and quick-bite counter listed on Pathao Food.', 'https://storage.pathaofood.live/food/51789_banner.webp?ts=1745403074', 'https://storage.pathaofood.live/food/51789_banner.webp?ts=1745403074', 'https://storage.pathaofood.live/food/51789_logo.webp?ts=1745403074', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytoobz-marcos-pizza', 27.7167, 85.3206, '+9779811001002', 'marcos.pizza@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001003'::uuid, '00000000-0000-4000-9000-000000002003'::uuid, 'Melung Thakali', 'Thakali meals and Nepali sets listed on Pathao Food.', 'https://storage.pathaofood.live/food/51836_banner.webp?ts=1752064978', 'https://storage.pathaofood.live/food/51836_banner.webp?ts=1752064978', 'https://storage.pathaofood.live/food/51836_logo.webp?ts=1747652361', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytqmzw-melung-thakali', 27.7135, 85.3187, '+9779811001003', 'melung.thakali@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001004'::uuid, '00000000-0000-4000-9000-000000002004'::uuid, 'Wow Burger and KFC', 'Burger, wings, sausage, and noodle combos listed on Pathao Food.', 'https://storage.pathaofood.live/food/51502_banner.webp?ts=1777782692', 'https://storage.pathaofood.live/food/51502_banner.webp?ts=1777782692', 'https://storage.pathaofood.live/food/51502_logo.webp?ts=1716200860', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytkmbs-wow-burger-and-kfc', 27.7109, 85.3271, '+9779811001004', 'wow.burger@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001005'::uuid, '00000000-0000-4000-9000-000000002005'::uuid, 'Himalayan Thakali', 'Thakali sets, choila, drumsticks, and Nepali snacks listed on Pathao Food.', 'https://storage.pathaofood.live/food/50272_banner.webp?ts=1778041491', 'https://storage.pathaofood.live/food/50272_banner.webp?ts=1778041491', 'https://storage.pathaofood.live/food/50272_logo.webp?ts=1744280255', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guydenzs-himalayan-thakali', 27.7204, 85.3157, '+9779811001005', 'himalayan.thakali@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001006'::uuid, '00000000-0000-4000-9000-000000002006'::uuid, 'Mustang Thakali by State III', 'Mustang-style Thakali curries, dhido, and khana sets listed on Pathao Food.', 'https://storage.pathaofood.live/food/50799_banner.webp?ts=1669886335', 'https://storage.pathaofood.live/food/50799_banner.webp?ts=1669886335', 'https://storage.pathaofood.live/food/50799_banner.webp?ts=1669886335', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guydoojz-mustang-thakali', 27.7097, 85.3147, '+9779811001006', 'mustang.thakali@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001007'::uuid, '00000000-0000-4000-9000-000000002007'::uuid, 'Thela by Chicken Station', 'Burgers and biryani from Chicken Station''s Thela listing.', 'https://storage.pathaofood.live/food/51781_logo.webp?ts=1746449178', 'https://storage.pathaofood.live/food/51781_logo.webp?ts=1746449178', 'https://storage.pathaofood.live/food/51781_logo.webp?ts=1746449178', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytqmjs-thela-by-chicken-station', 27.7066, 85.3222, '+9779811001007', 'thela.chickenstation@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001008'::uuid, '00000000-0000-4000-9000-000000002008'::uuid, 'Diyalo Restaurant', 'Pizza-focused restaurant listed on Pathao Food.', 'https://storage.pathaofood.live/food/70087_banner.webp?ts=1776661050', 'https://storage.pathaofood.live/food/70087_banner.webp?ts=1776661050', 'https://storage.pathaofood.live/food/70087_banner.webp?ts=1776661050', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-g4ydaobx-diyalo-restaurant', 27.7039, 85.3086, '+9779811001008', 'diyalo.restaurant@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001009'::uuid, '00000000-0000-4000-9000-000000002009'::uuid, 'Kachilaz', 'Newari restaurant listed on Pathao Food.', 'https://storage.pathaofood.live/food/175008_banner.webp?ts=1727152615', 'https://storage.pathaofood.live/food/175008_banner.webp?ts=1727152615', 'https://storage.pathaofood.live/food/175001_logo.webp?ts=1727065445', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-ge3tkmbqha-kachilaz', 27.7018, 85.3112, '+9779811001009', 'kachilaz@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001010'::uuid, '00000000-0000-4000-9000-000000002010'::uuid, 'KTM Hunger Station', 'Biryani and sharing meals listed on Pathao Food.', 'https://storage.pathaofood.live/food/50774_banner.webp?ts=1752730024', 'https://storage.pathaofood.live/food/50774_banner.webp?ts=1752730024', 'https://storage.pathaofood.live/food/50774_banner.webp?ts=1752730024', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guydonzu-ktm-hunger-station', 27.6956, 85.3186, '+9779811001010', 'ktm.hunger@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001011'::uuid, '00000000-0000-4000-9000-000000002011'::uuid, 'The Kwality Cafe - Lazimpat', 'Lazimpat cafe with momo, biryani, breakfast, and tandoori menu listed on Pathao Food.', 'https://storage.pathaofood.live/food/50332_banner.webp?ts=1770266453', 'https://storage.pathaofood.live/food/50332_banner.webp?ts=1770266453', 'https://storage.pathaofood.live/food/50332_logo.webp?ts=1686893664', 'Lazimpat, Kathmandu', 'Lazimpat, Kathmandu, Nepal', 'pathao-guydgmzs-the-kwality-cafe', 27.7263, 85.3233, '+9779811001011', 'kwality.lazimpat@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001012'::uuid, '00000000-0000-4000-9000-000000002012'::uuid, 'The Little Kathmandu Stick Food', 'Stick-food counter with sausage, meatball, and drumstick portions listed on Pathao Food.', 'https://storage.pathaofood.live/food/51004_banner.webp?ts=1774872435', 'https://storage.pathaofood.live/food/51004_banner.webp?ts=1774872435', 'https://storage.pathaofood.live/food/51004_banner.webp?ts=1774872435', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guydmmrw-little-kathmandu-stick-food', 27.7183, 85.3312, '+9779811001012', 'little.kathmandu@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001013'::uuid, '00000000-0000-4000-9000-000000002013'::uuid, 'Burger and Pizza', 'Burger, pizza, momo, and fast-food listing on Pathao Food.', 'https://storage.pathaofood.live/food/51237_banner.webp?ts=1776315087', 'https://storage.pathaofood.live/food/51237_banner.webp?ts=1776315087', 'https://storage.pathaofood.live/food/51236_logo.webp?ts=1700826883', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytemzx-burger-and-pizza', 27.7122, 85.3350, '+9779811001013', 'burger.pizza@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001014'::uuid, '00000000-0000-4000-9000-000000002014'::uuid, 'Myth Cafe', 'Cafe snacks and wings listed on Pathao Food.', 'https://storage.pathaofood.live/food/51308_banner.webp?ts=1728970939', 'https://storage.pathaofood.live/food/51308_banner.webp?ts=1728970939', 'https://storage.pathaofood.live/food/51308_logo.webp?ts=1706009863', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytgmby-myth-cafe', 27.7212, 85.3091, '+9779811001014', 'myth.cafe@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001015'::uuid, '00000000-0000-4000-9000-000000002015'::uuid, 'Monster Meal', 'Wings and loaded burgers listed on Pathao Food.', 'https://storage.pathaofood.live/food/50739_banner.webp?ts=1752214922', 'https://storage.pathaofood.live/food/50739_banner.webp?ts=1752214922', 'https://storage.pathaofood.live/food/51191_logo.webp?ts=1699441584', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytcojr-monster-meal', 27.7151, 85.3049, '+9779811001015', 'monster.meal@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001016'::uuid, '00000000-0000-4000-9000-000000002016'::uuid, 'NPP Food Services', 'Rice, fried rice, tofu, and momo items listed on Pathao Food.', 'https://storage.pathaofood.live/food/51176_banner.webp?ts=1752485408', 'https://storage.pathaofood.live/food/51176_banner.webp?ts=1752485408', 'https://storage.pathaofood.live/food/51177_logo.webp?ts=1699005545', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytcnzx-npp-food-services', 27.7218, 85.3368, '+9779811001016', 'npp.food@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001017'::uuid, '00000000-0000-4000-9000-000000002017'::uuid, 'Korean Street Food', 'Korean fried chicken pieces listed on Pathao Food.', 'https://storage.pathaofood.live/food/51079_logo.webp?ts=1750842836', 'https://storage.pathaofood.live/food/51079_logo.webp?ts=1750842836', 'https://storage.pathaofood.live/food/51079_logo.webp?ts=1750842836', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytanzz-korean-street-food', 27.7180, 85.3470, '+9779811001017', 'korean.street@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001018'::uuid, '00000000-0000-4000-9000-000000002018'::uuid, 'Crunch In', 'Crunchy fast-food restaurant listed on Pathao Food.', 'https://storage.pathaofood.live/food/51473_banner.webp?ts=1775535660', 'https://storage.pathaofood.live/food/51473_banner.webp?ts=1775535660', 'https://storage.pathaofood.live/food/51473_logo.webp?ts=1714997797', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytinzt-crunch-in', 27.7067, 85.3421, '+9779811001018', 'crunch.in@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001019'::uuid, '00000000-0000-4000-9000-000000002019'::uuid, 'Darjeeling Ko Swad', 'Darjeeling-style momo and burger listing on Pathao Food.', 'https://storage.pathaofood.live/food/51099_banner.webp?ts=1738644790', 'https://storage.pathaofood.live/food/51099_banner.webp?ts=1738644790', 'https://storage.pathaofood.live/food/51099_logo.webp?ts=1693295445', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytaojz-darjeeling-ko-swad', 27.7243, 85.3415, '+9779811001019', 'darjeeling.swad@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001020'::uuid, '00000000-0000-4000-9000-000000002020'::uuid, 'Filipino Bakeshop', 'Bakery with patties, cakes, and pastries listed on Pathao Food.', 'https://storage.pathaofood.live/food/50898_banner.webp?ts=1753950914', 'https://storage.pathaofood.live/food/50898_banner.webp?ts=1753950914', 'https://storage.pathaofood.live/food/50898_logo.webp?ts=1669630609', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guydqojy-filipino-bakeshop', 27.7131, 85.3500, '+9779811001020', 'filipino.bakeshop@chitomitho.local')
)
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  phone,
  phone_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  rr.owner_id,
  'authenticated',
  'authenticated',
  rr.contact_email,
  NULL,
  NOW(),
  rr.contact_phone,
  NOW(),
  jsonb_build_object('provider', 'phone', 'providers', jsonb_build_array('phone'), 'role', 'restaurant_owner', 'verification_status', 'verified'),
  jsonb_build_object('full_name', rr.name, 'phone', rr.contact_phone, 'email', rr.contact_email),
  NOW(),
  NOW(),
  '',
  '',
  '',
  ''
FROM real_restaurants rr
ON CONFLICT (id) DO UPDATE
SET
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  phone_confirmed_at = EXCLUDED.phone_confirmed_at,
  raw_app_meta_data = EXCLUDED.raw_app_meta_data,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  updated_at = NOW();

WITH real_restaurants (
  owner_id,
  restaurant_id,
  name,
  description,
  image_url,
  banner_url,
  profile_image_url,
  address,
  formatted_address,
  google_place_id,
  latitude,
  longitude,
  contact_phone,
  contact_email
) AS (
  VALUES
    ('00000000-0000-4000-9000-000000001001'::uuid, '00000000-0000-4000-9000-000000002001'::uuid, 'Dumdaar Momo', 'Momo shop with buff, pork, and chicken combos listed on Pathao Food.', 'https://storage.pathaofood.live/food/51755_banner.webp?ts=1757997466', 'https://storage.pathaofood.live/food/51755_banner.webp?ts=1757997466', 'https://storage.pathaofood.live/food/51755_logo.webp?ts=1743592185', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytonjv-dumdaar-momo', 27.7172, 85.3240, '+9779811001001', 'dumdaar.momo@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001002'::uuid, '00000000-0000-4000-9000-000000002002'::uuid, 'Marco''s Pizza', 'Small pizza and quick-bite counter listed on Pathao Food.', 'https://storage.pathaofood.live/food/51789_banner.webp?ts=1745403074', 'https://storage.pathaofood.live/food/51789_banner.webp?ts=1745403074', 'https://storage.pathaofood.live/food/51789_logo.webp?ts=1745403074', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytoobz-marcos-pizza', 27.7167, 85.3206, '+9779811001002', 'marcos.pizza@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001003'::uuid, '00000000-0000-4000-9000-000000002003'::uuid, 'Melung Thakali', 'Thakali meals and Nepali sets listed on Pathao Food.', 'https://storage.pathaofood.live/food/51836_banner.webp?ts=1752064978', 'https://storage.pathaofood.live/food/51836_banner.webp?ts=1752064978', 'https://storage.pathaofood.live/food/51836_logo.webp?ts=1747652361', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytqmzw-melung-thakali', 27.7135, 85.3187, '+9779811001003', 'melung.thakali@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001004'::uuid, '00000000-0000-4000-9000-000000002004'::uuid, 'Wow Burger and KFC', 'Burger, wings, sausage, and noodle combos listed on Pathao Food.', 'https://storage.pathaofood.live/food/51502_banner.webp?ts=1777782692', 'https://storage.pathaofood.live/food/51502_banner.webp?ts=1777782692', 'https://storage.pathaofood.live/food/51502_logo.webp?ts=1716200860', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytkmbs-wow-burger-and-kfc', 27.7109, 85.3271, '+9779811001004', 'wow.burger@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001005'::uuid, '00000000-0000-4000-9000-000000002005'::uuid, 'Himalayan Thakali', 'Thakali sets, choila, drumsticks, and Nepali snacks listed on Pathao Food.', 'https://storage.pathaofood.live/food/50272_banner.webp?ts=1778041491', 'https://storage.pathaofood.live/food/50272_banner.webp?ts=1778041491', 'https://storage.pathaofood.live/food/50272_logo.webp?ts=1744280255', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guydenzs-himalayan-thakali', 27.7204, 85.3157, '+9779811001005', 'himalayan.thakali@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001006'::uuid, '00000000-0000-4000-9000-000000002006'::uuid, 'Mustang Thakali by State III', 'Mustang-style Thakali curries, dhido, and khana sets listed on Pathao Food.', 'https://storage.pathaofood.live/food/50799_banner.webp?ts=1669886335', 'https://storage.pathaofood.live/food/50799_banner.webp?ts=1669886335', 'https://storage.pathaofood.live/food/50799_banner.webp?ts=1669886335', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guydoojz-mustang-thakali', 27.7097, 85.3147, '+9779811001006', 'mustang.thakali@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001007'::uuid, '00000000-0000-4000-9000-000000002007'::uuid, 'Thela by Chicken Station', 'Burgers and biryani from Chicken Station''s Thela listing.', 'https://storage.pathaofood.live/food/51781_logo.webp?ts=1746449178', 'https://storage.pathaofood.live/food/51781_logo.webp?ts=1746449178', 'https://storage.pathaofood.live/food/51781_logo.webp?ts=1746449178', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytqmjs-thela-by-chicken-station', 27.7066, 85.3222, '+9779811001007', 'thela.chickenstation@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001008'::uuid, '00000000-0000-4000-9000-000000002008'::uuid, 'Diyalo Restaurant', 'Pizza-focused restaurant listed on Pathao Food.', 'https://storage.pathaofood.live/food/70087_banner.webp?ts=1776661050', 'https://storage.pathaofood.live/food/70087_banner.webp?ts=1776661050', 'https://storage.pathaofood.live/food/70087_banner.webp?ts=1776661050', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-g4ydaobx-diyalo-restaurant', 27.7039, 85.3086, '+9779811001008', 'diyalo.restaurant@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001009'::uuid, '00000000-0000-4000-9000-000000002009'::uuid, 'Kachilaz', 'Newari restaurant listed on Pathao Food.', 'https://storage.pathaofood.live/food/175008_banner.webp?ts=1727152615', 'https://storage.pathaofood.live/food/175008_banner.webp?ts=1727152615', 'https://storage.pathaofood.live/food/175001_logo.webp?ts=1727065445', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-ge3tkmbqha-kachilaz', 27.7018, 85.3112, '+9779811001009', 'kachilaz@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001010'::uuid, '00000000-0000-4000-9000-000000002010'::uuid, 'KTM Hunger Station', 'Biryani and sharing meals listed on Pathao Food.', 'https://storage.pathaofood.live/food/50774_banner.webp?ts=1752730024', 'https://storage.pathaofood.live/food/50774_banner.webp?ts=1752730024', 'https://storage.pathaofood.live/food/50774_banner.webp?ts=1752730024', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guydonzu-ktm-hunger-station', 27.6956, 85.3186, '+9779811001010', 'ktm.hunger@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001011'::uuid, '00000000-0000-4000-9000-000000002011'::uuid, 'The Kwality Cafe - Lazimpat', 'Lazimpat cafe with momo, biryani, breakfast, and tandoori menu listed on Pathao Food.', 'https://storage.pathaofood.live/food/50332_banner.webp?ts=1770266453', 'https://storage.pathaofood.live/food/50332_banner.webp?ts=1770266453', 'https://storage.pathaofood.live/food/50332_logo.webp?ts=1686893664', 'Lazimpat, Kathmandu', 'Lazimpat, Kathmandu, Nepal', 'pathao-guydgmzs-the-kwality-cafe', 27.7263, 85.3233, '+9779811001011', 'kwality.lazimpat@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001012'::uuid, '00000000-0000-4000-9000-000000002012'::uuid, 'The Little Kathmandu Stick Food', 'Stick-food counter with sausage, meatball, and drumstick portions listed on Pathao Food.', 'https://storage.pathaofood.live/food/51004_banner.webp?ts=1774872435', 'https://storage.pathaofood.live/food/51004_banner.webp?ts=1774872435', 'https://storage.pathaofood.live/food/51004_banner.webp?ts=1774872435', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guydmmrw-little-kathmandu-stick-food', 27.7183, 85.3312, '+9779811001012', 'little.kathmandu@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001013'::uuid, '00000000-0000-4000-9000-000000002013'::uuid, 'Burger and Pizza', 'Burger, pizza, momo, and fast-food listing on Pathao Food.', 'https://storage.pathaofood.live/food/51237_banner.webp?ts=1776315087', 'https://storage.pathaofood.live/food/51237_banner.webp?ts=1776315087', 'https://storage.pathaofood.live/food/51236_logo.webp?ts=1700826883', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytemzx-burger-and-pizza', 27.7122, 85.3350, '+9779811001013', 'burger.pizza@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001014'::uuid, '00000000-0000-4000-9000-000000002014'::uuid, 'Myth Cafe', 'Cafe snacks and wings listed on Pathao Food.', 'https://storage.pathaofood.live/food/51308_banner.webp?ts=1728970939', 'https://storage.pathaofood.live/food/51308_banner.webp?ts=1728970939', 'https://storage.pathaofood.live/food/51308_logo.webp?ts=1706009863', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytgmby-myth-cafe', 27.7212, 85.3091, '+9779811001014', 'myth.cafe@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001015'::uuid, '00000000-0000-4000-9000-000000002015'::uuid, 'Monster Meal', 'Wings and loaded burgers listed on Pathao Food.', 'https://storage.pathaofood.live/food/50739_banner.webp?ts=1752214922', 'https://storage.pathaofood.live/food/50739_banner.webp?ts=1752214922', 'https://storage.pathaofood.live/food/51191_logo.webp?ts=1699441584', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytcojr-monster-meal', 27.7151, 85.3049, '+9779811001015', 'monster.meal@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001016'::uuid, '00000000-0000-4000-9000-000000002016'::uuid, 'NPP Food Services', 'Rice, fried rice, tofu, and momo items listed on Pathao Food.', 'https://storage.pathaofood.live/food/51176_banner.webp?ts=1752485408', 'https://storage.pathaofood.live/food/51176_banner.webp?ts=1752485408', 'https://storage.pathaofood.live/food/51177_logo.webp?ts=1699005545', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytcnzx-npp-food-services', 27.7218, 85.3368, '+9779811001016', 'npp.food@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001017'::uuid, '00000000-0000-4000-9000-000000002017'::uuid, 'Korean Street Food', 'Korean fried chicken pieces listed on Pathao Food.', 'https://storage.pathaofood.live/food/51079_logo.webp?ts=1750842836', 'https://storage.pathaofood.live/food/51079_logo.webp?ts=1750842836', 'https://storage.pathaofood.live/food/51079_logo.webp?ts=1750842836', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytanzz-korean-street-food', 27.7180, 85.3470, '+9779811001017', 'korean.street@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001018'::uuid, '00000000-0000-4000-9000-000000002018'::uuid, 'Crunch In', 'Crunchy fast-food restaurant listed on Pathao Food.', 'https://storage.pathaofood.live/food/51473_banner.webp?ts=1775535660', 'https://storage.pathaofood.live/food/51473_banner.webp?ts=1775535660', 'https://storage.pathaofood.live/food/51473_logo.webp?ts=1714997797', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytinzt-crunch-in', 27.7067, 85.3421, '+9779811001018', 'crunch.in@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001019'::uuid, '00000000-0000-4000-9000-000000002019'::uuid, 'Darjeeling Ko Swad', 'Darjeeling-style momo and burger listing on Pathao Food.', 'https://storage.pathaofood.live/food/51099_banner.webp?ts=1738644790', 'https://storage.pathaofood.live/food/51099_banner.webp?ts=1738644790', 'https://storage.pathaofood.live/food/51099_logo.webp?ts=1693295445', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytaojz-darjeeling-ko-swad', 27.7243, 85.3415, '+9779811001019', 'darjeeling.swad@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001020'::uuid, '00000000-0000-4000-9000-000000002020'::uuid, 'Filipino Bakeshop', 'Bakery with patties, cakes, and pastries listed on Pathao Food.', 'https://storage.pathaofood.live/food/50898_banner.webp?ts=1753950914', 'https://storage.pathaofood.live/food/50898_banner.webp?ts=1753950914', 'https://storage.pathaofood.live/food/50898_logo.webp?ts=1669630609', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guydqojy-filipino-bakeshop', 27.7131, 85.3500, '+9779811001020', 'filipino.bakeshop@chitomitho.local')
)
INSERT INTO public.user_profiles (
  id,
  full_name,
  email,
  phone,
  role,
  avatar_url,
  verification_status,
  is_online,
  vehicle_type,
  vehicle_details
)
SELECT
  rr.owner_id,
  rr.name,
  rr.contact_email,
  rr.contact_phone,
  'restaurant_owner',
  rr.profile_image_url,
  'verified',
  TRUE,
  NULL,
  NULL
FROM real_restaurants rr
ON CONFLICT (id) DO UPDATE
SET
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  role = EXCLUDED.role,
  avatar_url = EXCLUDED.avatar_url,
  verification_status = EXCLUDED.verification_status,
  is_online = EXCLUDED.is_online,
  vehicle_type = EXCLUDED.vehicle_type,
  vehicle_details = EXCLUDED.vehicle_details;

WITH real_restaurants (
  owner_id,
  restaurant_id,
  name,
  description,
  image_url,
  banner_url,
  profile_image_url,
  address,
  formatted_address,
  google_place_id,
  latitude,
  longitude,
  contact_phone,
  contact_email
) AS (
  VALUES
    ('00000000-0000-4000-9000-000000001001'::uuid, '00000000-0000-4000-9000-000000002001'::uuid, 'Dumdaar Momo', 'Momo shop with buff, pork, and chicken combos listed on Pathao Food.', 'https://storage.pathaofood.live/food/51755_banner.webp?ts=1757997466', 'https://storage.pathaofood.live/food/51755_banner.webp?ts=1757997466', 'https://storage.pathaofood.live/food/51755_logo.webp?ts=1743592185', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytonjv-dumdaar-momo', 27.7172, 85.3240, '+9779811001001', 'dumdaar.momo@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001002'::uuid, '00000000-0000-4000-9000-000000002002'::uuid, 'Marco''s Pizza', 'Small pizza and quick-bite counter listed on Pathao Food.', 'https://storage.pathaofood.live/food/51789_banner.webp?ts=1745403074', 'https://storage.pathaofood.live/food/51789_banner.webp?ts=1745403074', 'https://storage.pathaofood.live/food/51789_logo.webp?ts=1745403074', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytoobz-marcos-pizza', 27.7167, 85.3206, '+9779811001002', 'marcos.pizza@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001003'::uuid, '00000000-0000-4000-9000-000000002003'::uuid, 'Melung Thakali', 'Thakali meals and Nepali sets listed on Pathao Food.', 'https://storage.pathaofood.live/food/51836_banner.webp?ts=1752064978', 'https://storage.pathaofood.live/food/51836_banner.webp?ts=1752064978', 'https://storage.pathaofood.live/food/51836_logo.webp?ts=1747652361', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytqmzw-melung-thakali', 27.7135, 85.3187, '+9779811001003', 'melung.thakali@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001004'::uuid, '00000000-0000-4000-9000-000000002004'::uuid, 'Wow Burger and KFC', 'Burger, wings, sausage, and noodle combos listed on Pathao Food.', 'https://storage.pathaofood.live/food/51502_banner.webp?ts=1777782692', 'https://storage.pathaofood.live/food/51502_banner.webp?ts=1777782692', 'https://storage.pathaofood.live/food/51502_logo.webp?ts=1716200860', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytkmbs-wow-burger-and-kfc', 27.7109, 85.3271, '+9779811001004', 'wow.burger@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001005'::uuid, '00000000-0000-4000-9000-000000002005'::uuid, 'Himalayan Thakali', 'Thakali sets, choila, drumsticks, and Nepali snacks listed on Pathao Food.', 'https://storage.pathaofood.live/food/50272_banner.webp?ts=1778041491', 'https://storage.pathaofood.live/food/50272_banner.webp?ts=1778041491', 'https://storage.pathaofood.live/food/50272_logo.webp?ts=1744280255', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guydenzs-himalayan-thakali', 27.7204, 85.3157, '+9779811001005', 'himalayan.thakali@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001006'::uuid, '00000000-0000-4000-9000-000000002006'::uuid, 'Mustang Thakali by State III', 'Mustang-style Thakali curries, dhido, and khana sets listed on Pathao Food.', 'https://storage.pathaofood.live/food/50799_banner.webp?ts=1669886335', 'https://storage.pathaofood.live/food/50799_banner.webp?ts=1669886335', 'https://storage.pathaofood.live/food/50799_banner.webp?ts=1669886335', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guydoojz-mustang-thakali', 27.7097, 85.3147, '+9779811001006', 'mustang.thakali@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001007'::uuid, '00000000-0000-4000-9000-000000002007'::uuid, 'Thela by Chicken Station', 'Burgers and biryani from Chicken Station''s Thela listing.', 'https://storage.pathaofood.live/food/51781_logo.webp?ts=1746449178', 'https://storage.pathaofood.live/food/51781_logo.webp?ts=1746449178', 'https://storage.pathaofood.live/food/51781_logo.webp?ts=1746449178', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytqmjs-thela-by-chicken-station', 27.7066, 85.3222, '+9779811001007', 'thela.chickenstation@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001008'::uuid, '00000000-0000-4000-9000-000000002008'::uuid, 'Diyalo Restaurant', 'Pizza-focused restaurant listed on Pathao Food.', 'https://storage.pathaofood.live/food/70087_banner.webp?ts=1776661050', 'https://storage.pathaofood.live/food/70087_banner.webp?ts=1776661050', 'https://storage.pathaofood.live/food/70087_banner.webp?ts=1776661050', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-g4ydaobx-diyalo-restaurant', 27.7039, 85.3086, '+9779811001008', 'diyalo.restaurant@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001009'::uuid, '00000000-0000-4000-9000-000000002009'::uuid, 'Kachilaz', 'Newari restaurant listed on Pathao Food.', 'https://storage.pathaofood.live/food/175008_banner.webp?ts=1727152615', 'https://storage.pathaofood.live/food/175008_banner.webp?ts=1727152615', 'https://storage.pathaofood.live/food/175001_logo.webp?ts=1727065445', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-ge3tkmbqha-kachilaz', 27.7018, 85.3112, '+9779811001009', 'kachilaz@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001010'::uuid, '00000000-0000-4000-9000-000000002010'::uuid, 'KTM Hunger Station', 'Biryani and sharing meals listed on Pathao Food.', 'https://storage.pathaofood.live/food/50774_banner.webp?ts=1752730024', 'https://storage.pathaofood.live/food/50774_banner.webp?ts=1752730024', 'https://storage.pathaofood.live/food/50774_banner.webp?ts=1752730024', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guydonzu-ktm-hunger-station', 27.6956, 85.3186, '+9779811001010', 'ktm.hunger@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001011'::uuid, '00000000-0000-4000-9000-000000002011'::uuid, 'The Kwality Cafe - Lazimpat', 'Lazimpat cafe with momo, biryani, breakfast, and tandoori menu listed on Pathao Food.', 'https://storage.pathaofood.live/food/50332_banner.webp?ts=1770266453', 'https://storage.pathaofood.live/food/50332_banner.webp?ts=1770266453', 'https://storage.pathaofood.live/food/50332_logo.webp?ts=1686893664', 'Lazimpat, Kathmandu', 'Lazimpat, Kathmandu, Nepal', 'pathao-guydgmzs-the-kwality-cafe', 27.7263, 85.3233, '+9779811001011', 'kwality.lazimpat@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001012'::uuid, '00000000-0000-4000-9000-000000002012'::uuid, 'The Little Kathmandu Stick Food', 'Stick-food counter with sausage, meatball, and drumstick portions listed on Pathao Food.', 'https://storage.pathaofood.live/food/51004_banner.webp?ts=1774872435', 'https://storage.pathaofood.live/food/51004_banner.webp?ts=1774872435', 'https://storage.pathaofood.live/food/51004_banner.webp?ts=1774872435', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guydmmrw-little-kathmandu-stick-food', 27.7183, 85.3312, '+9779811001012', 'little.kathmandu@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001013'::uuid, '00000000-0000-4000-9000-000000002013'::uuid, 'Burger and Pizza', 'Burger, pizza, momo, and fast-food listing on Pathao Food.', 'https://storage.pathaofood.live/food/51237_banner.webp?ts=1776315087', 'https://storage.pathaofood.live/food/51237_banner.webp?ts=1776315087', 'https://storage.pathaofood.live/food/51236_logo.webp?ts=1700826883', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytemzx-burger-and-pizza', 27.7122, 85.3350, '+9779811001013', 'burger.pizza@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001014'::uuid, '00000000-0000-4000-9000-000000002014'::uuid, 'Myth Cafe', 'Cafe snacks and wings listed on Pathao Food.', 'https://storage.pathaofood.live/food/51308_banner.webp?ts=1728970939', 'https://storage.pathaofood.live/food/51308_banner.webp?ts=1728970939', 'https://storage.pathaofood.live/food/51308_logo.webp?ts=1706009863', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytgmby-myth-cafe', 27.7212, 85.3091, '+9779811001014', 'myth.cafe@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001015'::uuid, '00000000-0000-4000-9000-000000002015'::uuid, 'Monster Meal', 'Wings and loaded burgers listed on Pathao Food.', 'https://storage.pathaofood.live/food/50739_banner.webp?ts=1752214922', 'https://storage.pathaofood.live/food/50739_banner.webp?ts=1752214922', 'https://storage.pathaofood.live/food/51191_logo.webp?ts=1699441584', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytcojr-monster-meal', 27.7151, 85.3049, '+9779811001015', 'monster.meal@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001016'::uuid, '00000000-0000-4000-9000-000000002016'::uuid, 'NPP Food Services', 'Rice, fried rice, tofu, and momo items listed on Pathao Food.', 'https://storage.pathaofood.live/food/51176_banner.webp?ts=1752485408', 'https://storage.pathaofood.live/food/51176_banner.webp?ts=1752485408', 'https://storage.pathaofood.live/food/51177_logo.webp?ts=1699005545', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytcnzx-npp-food-services', 27.7218, 85.3368, '+9779811001016', 'npp.food@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001017'::uuid, '00000000-0000-4000-9000-000000002017'::uuid, 'Korean Street Food', 'Korean fried chicken pieces listed on Pathao Food.', 'https://storage.pathaofood.live/food/51079_logo.webp?ts=1750842836', 'https://storage.pathaofood.live/food/51079_logo.webp?ts=1750842836', 'https://storage.pathaofood.live/food/51079_logo.webp?ts=1750842836', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytanzz-korean-street-food', 27.7180, 85.3470, '+9779811001017', 'korean.street@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001018'::uuid, '00000000-0000-4000-9000-000000002018'::uuid, 'Crunch In', 'Crunchy fast-food restaurant listed on Pathao Food.', 'https://storage.pathaofood.live/food/51473_banner.webp?ts=1775535660', 'https://storage.pathaofood.live/food/51473_banner.webp?ts=1775535660', 'https://storage.pathaofood.live/food/51473_logo.webp?ts=1714997797', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytinzt-crunch-in', 27.7067, 85.3421, '+9779811001018', 'crunch.in@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001019'::uuid, '00000000-0000-4000-9000-000000002019'::uuid, 'Darjeeling Ko Swad', 'Darjeeling-style momo and burger listing on Pathao Food.', 'https://storage.pathaofood.live/food/51099_banner.webp?ts=1738644790', 'https://storage.pathaofood.live/food/51099_banner.webp?ts=1738644790', 'https://storage.pathaofood.live/food/51099_logo.webp?ts=1693295445', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guytaojz-darjeeling-ko-swad', 27.7243, 85.3415, '+9779811001019', 'darjeeling.swad@chitomitho.local'),
    ('00000000-0000-4000-9000-000000001020'::uuid, '00000000-0000-4000-9000-000000002020'::uuid, 'Filipino Bakeshop', 'Bakery with patties, cakes, and pastries listed on Pathao Food.', 'https://storage.pathaofood.live/food/50898_banner.webp?ts=1753950914', 'https://storage.pathaofood.live/food/50898_banner.webp?ts=1753950914', 'https://storage.pathaofood.live/food/50898_logo.webp?ts=1669630609', 'Kathmandu, Nepal', 'Kathmandu, Nepal', 'pathao-guydqojy-filipino-bakeshop', 27.7131, 85.3500, '+9779811001020', 'filipino.bakeshop@chitomitho.local')
)
INSERT INTO public.restaurants (
  id,
  owner_id,
  name,
  description,
  image_url,
  banner_url,
  profile_image_url,
  address,
  formatted_address,
  google_place_id,
  latitude,
  longitude,
  contact_phone,
  contact_email,
  is_active,
  verification_status
)
SELECT
  rr.restaurant_id,
  rr.owner_id,
  rr.name,
  rr.description,
  rr.image_url,
  rr.banner_url,
  rr.profile_image_url,
  rr.address,
  rr.formatted_address,
  rr.google_place_id,
  rr.latitude,
  rr.longitude,
  rr.contact_phone,
  rr.contact_email,
  TRUE,
  'verified'
FROM real_restaurants rr
ON CONFLICT (id) DO UPDATE
SET
  owner_id = EXCLUDED.owner_id,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  image_url = EXCLUDED.image_url,
  banner_url = EXCLUDED.banner_url,
  profile_image_url = EXCLUDED.profile_image_url,
  address = EXCLUDED.address,
  formatted_address = EXCLUDED.formatted_address,
  google_place_id = EXCLUDED.google_place_id,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  contact_phone = EXCLUDED.contact_phone,
  contact_email = EXCLUDED.contact_email,
  is_active = EXCLUDED.is_active,
  verification_status = EXCLUDED.verification_status;

INSERT INTO public.restaurant_menu_items (
  id,
  restaurant_id,
  name,
  description,
  price,
  is_available,
  category
)
VALUES
  ('00000000-0000-4000-9000-000000003001', '00000000-0000-4000-9000-000000002001', 'Chicken Fry Momo', 'Fried chicken momo listed on Pathao Food.', 160, TRUE, 'Momo'),
  ('00000000-0000-4000-9000-000000003002', '00000000-0000-4000-9000-000000002001', 'Pork Steam Momo', 'Steamed pork momo listed on Pathao Food.', 160, TRUE, 'Momo'),
  ('00000000-0000-4000-9000-000000003003', '00000000-0000-4000-9000-000000002001', 'Buff Kothey Momo', 'Pan-fried buff kothey momo listed on Pathao Food.', 160, TRUE, 'Momo'),
  ('00000000-0000-4000-9000-000000003004', '00000000-0000-4000-9000-000000002002', 'Pineapple Chili Chicken Pizza', 'Small pizza listed on Pathao Food.', 145, TRUE, 'Pizza'),
  ('00000000-0000-4000-9000-000000003005', '00000000-0000-4000-9000-000000002002', 'Double Cheese Margherita Pizza', 'Small pizza listed on Pathao Food.', 120, TRUE, 'Pizza'),
  ('00000000-0000-4000-9000-000000003006', '00000000-0000-4000-9000-000000002002', 'Chicken Sausage Pizza', 'Small pizza listed on Pathao Food.', 145, TRUE, 'Pizza'),
  ('00000000-0000-4000-9000-000000003007', '00000000-0000-4000-9000-000000002003', 'Chicken Thali Set', 'Thakali-style chicken thali set.', 650, TRUE, 'Thakali'),
  ('00000000-0000-4000-9000-000000003008', '00000000-0000-4000-9000-000000002003', 'Veg Thali Set', 'Vegetarian Thakali set.', 550, TRUE, 'Thakali'),
  ('00000000-0000-4000-9000-000000003009', '00000000-0000-4000-9000-000000002003', 'Buff Choila', 'Spiced buff choila.', 360, TRUE, 'Newari'),
  ('00000000-0000-4000-9000-000000003010', '00000000-0000-4000-9000-000000002004', 'Crunchy Chicken Burger', 'Crunchy chicken burger listed on Pathao Food.', 325, TRUE, 'Burgers'),
  ('00000000-0000-4000-9000-000000003011', '00000000-0000-4000-9000-000000002004', 'Cheese Burger', 'Cheese burger listed on Pathao Food.', 245, TRUE, 'Burgers'),
  ('00000000-0000-4000-9000-000000003012', '00000000-0000-4000-9000-000000002004', 'Spicy Hot Wings Combo', 'Hot wings, sausage, and drink combo listed on Pathao Food.', 555, TRUE, 'Street Snacks'),
  ('00000000-0000-4000-9000-000000003013', '00000000-0000-4000-9000-000000002005', 'Chicken Drumsticks (6 pcs)', 'Chicken drumsticks listed on Pathao Food.', 450, TRUE, 'Street Snacks'),
  ('00000000-0000-4000-9000-000000003014', '00000000-0000-4000-9000-000000002005', 'Chicken Thali Set', 'Chicken thali set listed on Pathao Food.', 650, TRUE, 'Thakali'),
  ('00000000-0000-4000-9000-000000003015', '00000000-0000-4000-9000-000000002005', 'Veg Thali Set', 'Vegetarian thali set listed on Pathao Food.', 550, TRUE, 'Thakali'),
  ('00000000-0000-4000-9000-000000003016', '00000000-0000-4000-9000-000000002006', 'Boiler Chicken Khana Set', 'Chicken khana set listed on Pathao Food.', 590, TRUE, 'Thakali'),
  ('00000000-0000-4000-9000-000000003017', '00000000-0000-4000-9000-000000002006', 'Boiler Chicken Dhido Set', 'Chicken dhido set listed on Pathao Food.', 660, TRUE, 'Thakali'),
  ('00000000-0000-4000-9000-000000003018', '00000000-0000-4000-9000-000000002006', 'Alu Jimbu', 'Mustang-style potato jimbu listed on Pathao Food.', 300, TRUE, 'Street Snacks'),
  ('00000000-0000-4000-9000-000000003019', '00000000-0000-4000-9000-000000002007', 'Chicken Burger', 'Chicken burger listed on Pathao Food.', 192, TRUE, 'Burgers'),
  ('00000000-0000-4000-9000-000000003020', '00000000-0000-4000-9000-000000002007', 'Crunchy Chicken Burger', 'Crunchy burger listed on Pathao Food.', 310, TRUE, 'Burgers'),
  ('00000000-0000-4000-9000-000000003021', '00000000-0000-4000-9000-000000002007', 'Chicken Biryani', 'Chicken biryani listed on Pathao Food.', 440, TRUE, 'Rice Meals'),
  ('00000000-0000-4000-9000-000000003022', '00000000-0000-4000-9000-000000002008', 'Cheese Pizza', 'Cheese pizza listed on Pathao Food.', 450, TRUE, 'Pizza'),
  ('00000000-0000-4000-9000-000000003023', '00000000-0000-4000-9000-000000002008', 'Chicken Pizza', 'Chicken pizza listed on Pathao Food.', 500, TRUE, 'Pizza'),
  ('00000000-0000-4000-9000-000000003024', '00000000-0000-4000-9000-000000002008', 'Diyalo Special Pizza', 'House special pizza listed on Pathao Food.', 600, TRUE, 'Pizza'),
  ('00000000-0000-4000-9000-000000003025', '00000000-0000-4000-9000-000000002009', 'Newari Khaja Set', 'Classic Newari khaja set.', 420, TRUE, 'Newari'),
  ('00000000-0000-4000-9000-000000003026', '00000000-0000-4000-9000-000000002009', 'Buff Choila', 'Newari buff choila.', 360, TRUE, 'Newari'),
  ('00000000-0000-4000-9000-000000003027', '00000000-0000-4000-9000-000000002009', 'Aloo Tama', 'Nepali bamboo shoot curry.', 280, TRUE, 'Newari'),
  ('00000000-0000-4000-9000-000000003028', '00000000-0000-4000-9000-000000002010', 'Chicken Dum Biryani', 'Chicken dum biryani listed on Pathao Food.', 561, TRUE, 'Rice Meals'),
  ('00000000-0000-4000-9000-000000003029', '00000000-0000-4000-9000-000000002010', 'Chicken 65 Biryani', 'Chicken 65 biryani listed on Pathao Food.', 550, TRUE, 'Rice Meals'),
  ('00000000-0000-4000-9000-000000003030', '00000000-0000-4000-9000-000000002010', 'Veg Biryani', 'Veg biryani listed on Pathao Food.', 462, TRUE, 'Rice Meals'),
  ('00000000-0000-4000-9000-000000003031', '00000000-0000-4000-9000-000000002011', 'Chicken Steam Momo', 'Chicken steam momo listed on Pathao Food.', 280, TRUE, 'Momo'),
  ('00000000-0000-4000-9000-000000003032', '00000000-0000-4000-9000-000000002011', 'Chicken Biryani', 'Chicken biryani listed on Pathao Food.', 460, TRUE, 'Rice Meals'),
  ('00000000-0000-4000-9000-000000003033', '00000000-0000-4000-9000-000000002011', 'Chicken Tikka Kebab', 'Chicken tikka kebab listed on Pathao Food.', 455, TRUE, 'Street Snacks'),
  ('00000000-0000-4000-9000-000000003034', '00000000-0000-4000-9000-000000002012', 'Buff Meatball (5 pcs)', 'Buff meatballs listed on Pathao Food.', 480, TRUE, 'Street Snacks'),
  ('00000000-0000-4000-9000-000000003035', '00000000-0000-4000-9000-000000002012', 'Buff Sausage (5 pcs)', 'Buff sausages listed on Pathao Food.', 290, TRUE, 'Street Snacks'),
  ('00000000-0000-4000-9000-000000003036', '00000000-0000-4000-9000-000000002012', 'Chicken Drumstick (10 pcs)', 'Chicken drumsticks listed on Pathao Food.', 640, TRUE, 'Street Snacks'),
  ('00000000-0000-4000-9000-000000003037', '00000000-0000-4000-9000-000000002013', 'Buff C Momo', 'Buff C momo listed on Pathao Food.', 175, TRUE, 'Momo'),
  ('00000000-0000-4000-9000-000000003038', '00000000-0000-4000-9000-000000002013', 'Buff Fried Momo', 'Buff fried momo listed on Pathao Food.', 140, TRUE, 'Momo'),
  ('00000000-0000-4000-9000-000000003039', '00000000-0000-4000-9000-000000002013', 'Chicken Burger', 'Chicken burger listed on Pathao Food.', 295, TRUE, 'Burgers'),
  ('00000000-0000-4000-9000-000000003040', '00000000-0000-4000-9000-000000002014', 'Buffalo Chicken Wings', 'Buffalo chicken wings listed on Pathao Food.', 360, TRUE, 'Street Snacks'),
  ('00000000-0000-4000-9000-000000003041', '00000000-0000-4000-9000-000000002014', 'Chicken Chilli', 'Chicken chilli listed on Pathao Food.', 370, TRUE, 'Street Snacks'),
  ('00000000-0000-4000-9000-000000003042', '00000000-0000-4000-9000-000000002014', 'Chilli Potato', 'Chilli potato listed on Pathao Food.', 220, TRUE, 'Street Snacks'),
  ('00000000-0000-4000-9000-000000003043', '00000000-0000-4000-9000-000000002015', 'BBQ Wings (6 pcs)', 'BBQ wings listed on Pathao Food.', 580, TRUE, 'Street Snacks'),
  ('00000000-0000-4000-9000-000000003044', '00000000-0000-4000-9000-000000002015', 'BBQ Wings (9 pcs)', 'BBQ wings listed on Pathao Food.', 865, TRUE, 'Street Snacks'),
  ('00000000-0000-4000-9000-000000003045', '00000000-0000-4000-9000-000000002015', 'Smoked Yak Cheese Buff Burger', 'Buff burger with smoked yak cheese listed on Pathao Food.', 635, TRUE, 'Burgers'),
  ('00000000-0000-4000-9000-000000003046', '00000000-0000-4000-9000-000000002016', 'Buff Fried Rice', 'Buff fried rice listed on Pathao Food.', 223, TRUE, 'Rice Meals'),
  ('00000000-0000-4000-9000-000000003047', '00000000-0000-4000-9000-000000002016', 'Chicken Fried Rice', 'Chicken fried rice listed on Pathao Food.', 220, TRUE, 'Rice Meals'),
  ('00000000-0000-4000-9000-000000003048', '00000000-0000-4000-9000-000000002016', 'Chicken Steam Momo', 'Chicken steam momo listed on Pathao Food.', 250, TRUE, 'Momo'),
  ('00000000-0000-4000-9000-000000003049', '00000000-0000-4000-9000-000000002017', 'Chicken Breast (1 pc)', 'Korean-style chicken breast listed on Pathao Food.', 290, TRUE, 'Korean'),
  ('00000000-0000-4000-9000-000000003050', '00000000-0000-4000-9000-000000002017', 'Chicken Leg (1 pc)', 'Korean-style chicken leg listed on Pathao Food.', 290, TRUE, 'Korean'),
  ('00000000-0000-4000-9000-000000003051', '00000000-0000-4000-9000-000000002017', 'Chicken Wings (2 pcs)', 'Korean-style chicken wings listed on Pathao Food.', 370, TRUE, 'Korean'),
  ('00000000-0000-4000-9000-000000003052', '00000000-0000-4000-9000-000000002018', 'Crispy Chicken Burger', 'Crispy chicken burger.', 250, TRUE, 'Burgers'),
  ('00000000-0000-4000-9000-000000003053', '00000000-0000-4000-9000-000000002018', 'Crunchy Chicken Burger', 'Crunchy chicken burger.', 300, TRUE, 'Burgers'),
  ('00000000-0000-4000-9000-000000003054', '00000000-0000-4000-9000-000000002018', 'Chicken Wings', 'Crispy chicken wings.', 420, TRUE, 'Street Snacks'),
  ('00000000-0000-4000-9000-000000003055', '00000000-0000-4000-9000-000000002019', 'Chicken Burger', 'Chicken burger listed on Pathao Food.', 310, TRUE, 'Burgers'),
  ('00000000-0000-4000-9000-000000003056', '00000000-0000-4000-9000-000000002019', 'Buff Jhol Momo', 'Buff jhol momo listed on Pathao Food.', 220, TRUE, 'Momo'),
  ('00000000-0000-4000-9000-000000003057', '00000000-0000-4000-9000-000000002019', 'Chicken Chilly Momo', 'Chicken chilly momo listed on Pathao Food.', 250, TRUE, 'Momo'),
  ('00000000-0000-4000-9000-000000003058', '00000000-0000-4000-9000-000000002020', 'Chicken Patties', 'Chicken patties listed on Pathao Food.', 170, TRUE, 'Bakery'),
  ('00000000-0000-4000-9000-000000003059', '00000000-0000-4000-9000-000000002020', 'Chocolate Pastry', 'Chocolate pastry listed on Pathao Food.', 120, TRUE, 'Bakery'),
  ('00000000-0000-4000-9000-000000003060', '00000000-0000-4000-9000-000000002020', 'Black Forest Sponge Cake (1 pound)', 'Black forest cake listed on Pathao Food.', 1300, TRUE, 'Bakery')
ON CONFLICT (id) DO UPDATE
SET
  restaurant_id = EXCLUDED.restaurant_id,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  is_available = EXCLUDED.is_available,
  category = EXCLUDED.category;

UPDATE public.customer_orders o
SET customer_id = m.canonical_id
FROM pg_temp.seeded_profile_map m
WHERE o.customer_id = m.stale_id;

UPDATE public.customer_orders o
SET rider_id = m.canonical_id
FROM pg_temp.seeded_profile_map m
WHERE o.rider_id = m.stale_id;

UPDATE public.user_notifications n
SET user_id = m.canonical_id
FROM pg_temp.seeded_profile_map m
WHERE n.user_id = m.stale_id;

DELETE FROM public.rider_locations rl
USING pg_temp.seeded_profile_map m
WHERE rl.rider_id = m.stale_id
  AND EXISTS (
    SELECT 1
    FROM public.rider_locations existing
    WHERE existing.rider_id = m.canonical_id
  );

UPDATE public.rider_locations rl
SET rider_id = m.canonical_id
FROM pg_temp.seeded_profile_map m
WHERE rl.rider_id = m.stale_id;

DELETE FROM auth.users u
USING pg_temp.seeded_profile_map m
WHERE u.id = m.stale_id
  AND NOT EXISTS (
    SELECT 1 FROM public.restaurants r WHERE r.owner_id = m.stale_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.customer_orders o
    WHERE o.customer_id = m.stale_id OR o.rider_id = m.stale_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.rider_locations rl WHERE rl.rider_id = m.stale_id
  );

DROP TABLE IF EXISTS pg_temp.seeded_profile_map;

NOTIFY pgrst, 'reload schema';
