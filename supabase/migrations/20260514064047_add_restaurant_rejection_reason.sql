ALTER TABLE public.restaurants
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

DROP TABLE IF EXISTS pg_temp.seeded_orphan_phone_auth_map;

CREATE TEMP TABLE seeded_orphan_phone_auth_map AS
SELECT
  stale.id AS stale_id,
  canonical.id AS canonical_id
FROM auth.users stale
JOIN auth.users canonical
  ON canonical.id <> stale.id
  AND REGEXP_REPLACE(COALESCE(canonical.phone, ''), '\D', '', 'g') = stale.phone
WHERE stale.phone ~ '^977[0-9]{10}$'
  AND COALESCE(stale.raw_app_meta_data ->> 'role', '') = ''
  AND COALESCE(canonical.raw_app_meta_data ->> 'role', '') IN ('admin', 'restaurant_owner', 'rider', 'customer')
  AND COALESCE(canonical.raw_app_meta_data ->> 'verification_status', '') = 'verified';

DELETE FROM auth.identities i
USING seeded_orphan_phone_auth_map m
WHERE i.user_id = m.stale_id
  OR i.provider_id = m.stale_id::TEXT;

DELETE FROM auth.users u
USING seeded_orphan_phone_auth_map m
WHERE u.id = m.stale_id;

UPDATE auth.users
SET
  phone = REGEXP_REPLACE(phone, '\D', '', 'g'),
  raw_user_meta_data = jsonb_set(
    COALESCE(raw_user_meta_data, '{}'::jsonb),
    '{phone}',
    to_jsonb('+' || REGEXP_REPLACE(phone, '\D', '', 'g')),
    TRUE
  ),
  updated_at = NOW()
WHERE phone ~ '^\+977[0-9]{10}$'
  AND NOT EXISTS (
    SELECT 1
    FROM auth.users existing
    WHERE existing.id <> auth.users.id
      AND existing.phone = REGEXP_REPLACE(auth.users.phone, '\D', '', 'g')
  );

UPDATE public.user_profiles
SET
  phone = '+' || phone,
  updated_at = NOW()
WHERE phone ~ '^977[0-9]{10}$'
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_profiles existing
    WHERE existing.id <> user_profiles.id
      AND existing.phone = '+' || user_profiles.phone
  );

UPDATE auth.identities
SET
  identity_data = jsonb_set(
    COALESCE(identity_data, '{}'::jsonb),
    '{phone}',
    to_jsonb(REGEXP_REPLACE(identity_data ->> 'phone', '\D', '', 'g')),
    TRUE
  ),
  updated_at = NOW()
WHERE provider = 'phone'
  AND identity_data ->> 'phone' ~ '^\+977[0-9]{10}$';

DROP TABLE IF EXISTS pg_temp.seeded_owner_profile_map;

CREATE TEMP TABLE seeded_owner_profile_map AS
SELECT
  p.id AS stale_id,
  u.id AS canonical_id,
  CASE
    WHEN REGEXP_REPLACE(COALESCE(u.phone, ''), '\D', '', 'g') ~ '^977[0-9]{10}$'
      THEN '+' || REGEXP_REPLACE(u.phone, '\D', '', 'g')
    ELSE u.phone
  END AS canonical_phone,
  COALESCE(NULLIF(u.email, ''), p.email) AS canonical_email
FROM public.user_profiles p
JOIN auth.users u
  ON u.id <> p.id
  AND LOWER(COALESCE(u.email, '')) = LOWER(COALESCE(p.email, ''))
  AND REGEXP_REPLACE(COALESCE(u.phone, ''), '\D', '', 'g')
      = REGEXP_REPLACE(COALESCE(p.phone, ''), '\D', '', 'g')
LEFT JOIN public.user_profiles existing
  ON existing.id = u.id
WHERE existing.id IS NULL
  AND p.role = 'restaurant_owner'
  AND COALESCE(u.raw_app_meta_data ->> 'role', '') = 'restaurant_owner'
  AND COALESCE(u.raw_app_meta_data ->> 'verification_status', '') = 'verified';

UPDATE public.user_profiles p
SET
  email = 'archived-' || p.id::TEXT || '@chitomitho.local',
  phone = COALESCE(p.phone, '') || '#archived-' || SUBSTRING(p.id::TEXT FROM 1 FOR 8),
  updated_at = NOW()
FROM seeded_owner_profile_map m
WHERE p.id = m.stale_id;

INSERT INTO public.user_profiles (
  id,
  full_name,
  email,
  phone,
  role,
  avatar_url,
  verification_status,
  is_online,
  rejection_reason,
  created_at,
  updated_at
)
SELECT
  m.canonical_id,
  p.full_name,
  m.canonical_email,
  m.canonical_phone,
  p.role,
  p.avatar_url,
  p.verification_status,
  p.is_online,
  p.rejection_reason,
  p.created_at,
  NOW()
FROM public.user_profiles p
JOIN seeded_owner_profile_map m
  ON p.id = m.stale_id
ON CONFLICT (id) DO NOTHING;

UPDATE public.restaurants
SET owner_id = m.canonical_id
FROM seeded_owner_profile_map m
WHERE restaurants.owner_id = m.stale_id;

UPDATE public.customer_orders
SET customer_id = m.canonical_id
FROM seeded_owner_profile_map m
WHERE customer_orders.customer_id = m.stale_id;

UPDATE public.customer_orders
SET rider_id = m.canonical_id
FROM seeded_owner_profile_map m
WHERE customer_orders.rider_id = m.stale_id;

UPDATE public.rider_locations
SET rider_id = m.canonical_id
FROM seeded_owner_profile_map m
WHERE rider_locations.rider_id = m.stale_id;

UPDATE public.user_notifications
SET user_id = m.canonical_id
FROM seeded_owner_profile_map m
WHERE user_notifications.user_id = m.stale_id;

UPDATE auth.users u
SET
  email = m.canonical_email,
  phone = REGEXP_REPLACE(m.canonical_phone, '\D', '', 'g'),
  phone_confirmed_at = COALESCE(u.phone_confirmed_at, NOW()),
  raw_app_meta_data = COALESCE(u.raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', p.role, 'verification_status', p.verification_status),
  raw_user_meta_data = COALESCE(u.raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object('full_name', p.full_name, 'phone', m.canonical_phone, 'email', p.email),
  updated_at = NOW()
FROM seeded_owner_profile_map m
JOIN public.user_profiles p
  ON p.id = m.canonical_id
WHERE u.id = m.canonical_id;

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
JOIN seeded_owner_profile_map m
  ON m.canonical_id = u.id
ON CONFLICT (provider_id, provider) DO UPDATE
SET
  user_id = EXCLUDED.user_id,
  identity_data = EXCLUDED.identity_data,
  updated_at = NOW();

DELETE FROM public.user_profiles p
USING seeded_owner_profile_map m
WHERE p.id = m.stale_id;

DELETE FROM auth.users u
USING seeded_owner_profile_map m
WHERE u.id = m.stale_id;

DROP TABLE IF EXISTS pg_temp.seeded_orphan_phone_auth_map;

CREATE TEMP TABLE seeded_orphan_phone_auth_map AS
SELECT
  stale.id AS stale_id,
  canonical.id AS canonical_id
FROM auth.users stale
JOIN auth.users canonical
  ON canonical.id <> stale.id
  AND REGEXP_REPLACE(COALESCE(canonical.phone, ''), '\D', '', 'g')
      = REGEXP_REPLACE(COALESCE(stale.phone, ''), '\D', '', 'g')
WHERE stale.phone ~ '^977[0-9]{10}$'
  AND COALESCE(stale.raw_app_meta_data ->> 'role', '') = ''
  AND COALESCE(canonical.raw_app_meta_data ->> 'role', '') IN ('admin', 'restaurant_owner', 'rider', 'customer')
  AND COALESCE(canonical.raw_app_meta_data ->> 'verification_status', '') = 'verified';

DELETE FROM auth.identities i
USING seeded_orphan_phone_auth_map m
WHERE i.user_id = m.stale_id
  OR i.provider_id = m.stale_id::TEXT;

DELETE FROM auth.users u
USING seeded_orphan_phone_auth_map m
WHERE u.id = m.stale_id;
