ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS vehicle_type TEXT,
ADD COLUMN IF NOT EXISTS vehicle_details TEXT,
ADD COLUMN IF NOT EXISTS bike_model TEXT,
ADD COLUMN IF NOT EXISTS bike_condition TEXT,
ADD COLUMN IF NOT EXISTS license_front_url TEXT,
ADD COLUMN IF NOT EXISTS license_back_url TEXT,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

ALTER TABLE public.user_profiles
DROP CONSTRAINT IF EXISTS user_profiles_vehicle_type_check;

ALTER TABLE public.user_profiles
ADD CONSTRAINT user_profiles_vehicle_type_check
CHECK (vehicle_type IS NULL OR vehicle_type IN ('bicycle', 'motorbike', 'scooter'));

UPDATE public.user_profiles
SET vehicle_type = 'motorbike'
WHERE vehicle_type IS NULL
  AND role = 'rider'
  AND (
    COALESCE(NULLIF(vehicle_details, ''), '') <> ''
    OR COALESCE(NULLIF(bike_model, ''), '') <> ''
    OR COALESCE(NULLIF(license_front_url, ''), '') <> ''
    OR COALESCE(NULLIF(license_back_url, ''), '') <> ''
  );

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
      AND NEW.vehicle_type IN ('bicycle', 'motorbike', 'scooter')
      AND (
        NEW.vehicle_type = 'bicycle'
        OR (
          COALESCE(NULLIF(NEW.bike_model, ''), '') <> ''
          AND COALESCE(NULLIF(NEW.bike_condition, ''), '') <> ''
          AND COALESCE(NULLIF(NEW.license_front_url, ''), '') <> ''
          AND COALESCE(NULLIF(NEW.license_back_url, ''), '') <> ''
        )
      );

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

DROP POLICY IF EXISTS "Users insert own profile" ON public.user_profiles;

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
      AND vehicle_type IN ('bicycle', 'motorbike', 'scooter')
      AND (
        vehicle_type = 'bicycle'
        OR (
          COALESCE(NULLIF(bike_model, ''), '') <> ''
          AND COALESCE(NULLIF(bike_condition, ''), '') <> ''
          AND COALESCE(NULLIF(license_front_url, ''), '') <> ''
          AND COALESCE(NULLIF(license_back_url, ''), '') <> ''
        )
      )
    )
  )
);

DROP FUNCTION IF EXISTS public.admin_verify_rider_application(UUID);

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
    p.vehicle_type,
    p.vehicle_details,
    p.bike_model,
    p.bike_condition,
    p.license_front_url,
    p.license_back_url,
    p.rejection_reason,
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

GRANT EXECUTE ON FUNCTION public.admin_verify_rider_application(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
