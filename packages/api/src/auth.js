import {
  TABLES,
  USER_ROLES,
  getDefaultSavedAddress,
  normalizeSavedAddresses,
  onlyDigits,
  resolveDefaultSavedAddressId,
} from '@repo/utils';

function fallbackEmail(phone, userId) {
  const phoneDigits = onlyDigits(phone);
  const seed = phoneDigits || userId?.slice(0, 10) || Date.now();
  return `phone-${seed}@chitomitho.local`;
}

function fallbackName(phone) {
  const phoneDigits = onlyDigits(phone);
  const suffix = phoneDigits.slice(-4);
  return suffix ? `User ${suffix}` : 'Customer';
}

const SEEDED_LOGIN_PHONE_DIGITS = new Set([
  '9800000000',
  '9800000001',
  '9800000002',
  '9800000003',
  '9800000100',
  '9800000200',
]);
const CUSTOMER_SETTINGS_SELECT =
  'id, full_name, email, phone, role, avatar_url, verification_status, is_online, vehicle_type, vehicle_details, bike_model, bike_condition, license_front_url, license_back_url, rejection_reason';
const CUSTOMER_SETTINGS_LEGACY_RIDER_SELECT =
  'id, full_name, email, phone, role, avatar_url, verification_status, is_online, vehicle_details, bike_model, bike_condition, license_front_url, license_back_url, rejection_reason';
const CUSTOMER_SETTINGS_BASE_SELECT =
  'id, full_name, email, phone, role, avatar_url, verification_status, is_online, vehicle_details, rejection_reason';

function isSeededLoginPhone(phone) {
  const phoneDigits = onlyDigits(phone).slice(-10);
  return SEEDED_LOGIN_PHONE_DIGITS.has(phoneDigits);
}

function getAuthUser(authData) {
  return authData?.user || authData?.session?.user || null;
}

function getTrustedAuthProfile(authData, phone) {
  const user = getAuthUser(authData);
  const appMetadata = user?.app_metadata || {};
  const userMetadata = user?.user_metadata || {};
  const role = appMetadata.role;

  if (!role || !Object.values(USER_ROLES).includes(role)) {
    return null;
  }

  return {
    id: user.id,
    full_name: userMetadata.full_name || fallbackName(phone || user.phone),
    email: user.email || userMetadata.email || fallbackEmail(phone || user.phone, user.id),
    phone: user.phone || userMetadata.phone || phone,
    role,
    avatar_url: userMetadata.avatar_url || null,
    verification_status: appMetadata.verification_status || 'verified',
    is_online: false,
    vehicle_details: null,
  };
}

async function findExistingProfile(client, phone, userId) {
  if (userId) {
    const { data: byId, error: byIdError } = await client
      .from(TABLES.USER_PROFILES)
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (byIdError) {
      return { data: null, error: byIdError };
    }

    if (byId) {
      return { data: byId, error: null };
    }
  }

  if (phone) {
    const { data: byPhone, error: byPhoneError } = await client
      .from(TABLES.USER_PROFILES)
      .select('*')
      .eq('phone', phone)
      .maybeSingle();

    if (byPhoneError) {
      return { data: null, error: byPhoneError };
    }

    if (byPhone) {
      return { data: byPhone, error: null };
    }
  }

  return { data: null, error: null };
}

function isMissingRpcError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.code === 'PGRST202' ||
    error?.code === '42883' ||
    message.includes('could not find the function') ||
    message.includes('function public.sync_login_profile') ||
    message.includes('function sync_login_profile')
  );
}

function isMissingProfileColumnError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.code === '42703' ||
    (message.includes('column') && message.includes('does not exist'))
  );
}

async function fetchProfileSettingsRecord(client, userId) {
  const runQuery = (columns) => client
    .from(TABLES.USER_PROFILES)
    .select(columns)
    .eq('id', userId)
    .maybeSingle();

  const currentResult = await runQuery(CUSTOMER_SETTINGS_SELECT);
  if (!currentResult.error || !isMissingProfileColumnError(currentResult.error)) {
    return currentResult;
  }

  const missingMessage = String(currentResult.error?.message || '').toLowerCase();
  const fallbackSelect = missingMessage.includes('vehicle_type')
    ? CUSTOMER_SETTINGS_LEGACY_RIDER_SELECT
    : CUSTOMER_SETTINGS_BASE_SELECT;
  const fallbackResult = await runQuery(fallbackSelect);

  if (
    fallbackResult.error &&
    fallbackSelect !== CUSTOMER_SETTINGS_BASE_SELECT &&
    isMissingProfileColumnError(fallbackResult.error)
  ) {
    return runQuery(CUSTOMER_SETTINGS_BASE_SELECT);
  }

  return fallbackResult;
}

function normalizeRpcProfile(data) {
  if (Array.isArray(data)) {
    return data[0] || null;
  }

  return data || null;
}

async function syncLoginProfile(client) {
  if (typeof client.rpc !== 'function') {
    return { data: null, error: null };
  }

  const { data, error } = await client.rpc('sync_login_profile');

  if (error && isMissingRpcError(error)) {
    return { data: null, error: null };
  }

  return { data: normalizeRpcProfile(data), error };
}

async function refreshSessionAfterProfileSync(client, authData) {
  if (typeof client.auth.refreshSession !== 'function') {
    return authData;
  }

  const { data, error } = await client.auth.refreshSession();

  if (error || !data?.session) {
    return authData;
  }

  return {
    ...authData,
    ...data,
    user: data.user || authData.user,
    session: data.session,
  };
}

export async function sendPhoneOtp(client, phone) {
  const { data, error } = await client.auth.signInWithOtp({ phone });
  return { data, error };
}

export async function sendEmailOtp(client, email) {
  const { data, error } = await client.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
    },
  });
  return { data, error };
}

export async function sendPhoneChangeOtp(client, phone) {
  const { data, error } = await client.auth.updateUser({ phone });
  return { data, error };
}

export async function verifyPhoneOtp(client, phone, token) {
  const { data, error } = await client.auth.verifyOtp({
    phone,
    token,
    type: 'sms',
  });
  return { data, error };
}

export async function verifyEmailOtp(client, email, token) {
  const { data, error } = await client.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });
  return { data, error };
}

export async function verifyPhoneChangeOtp(client, phone, token) {
  const { data, error } = await client.auth.verifyOtp({
    phone,
    token,
    type: 'phone_change',
  });
  return { data, error };
}

export async function upsertCurrentUserProfile(client, profileInput = {}) {
  const { data: userData, error: userError } = await client.auth.getUser();

  if (userError) {
    return { data: null, error: userError };
  }

  const user = userData?.user;

  if (!user?.id) {
    return {
      data: null,
      error: { message: 'No authenticated user found for profile sync.' },
    };
  }

  const phone =
    profileInput.phone ||
    user.phone ||
    user.user_metadata?.phone ||
    '';

  const fullName =
    profileInput.full_name ||
    profileInput.fullName ||
    user.user_metadata?.full_name ||
    fallbackName(phone);

  const email =
    profileInput.email ||
    user.email ||
    user.user_metadata?.email ||
    fallbackEmail(phone, user.id);

  const { data: existingProfile, error: lookupError } = await findExistingProfile(
    client,
    phone,
    user.id,
  );

  if (lookupError) {
    return { data: null, error: lookupError };
  }

  const role =
    profileInput.role ||
    existingProfile?.role ||
    user.user_metadata?.role ||
    USER_ROLES.CUSTOMER;

  const profilePayload = {
    id: user.id,
    full_name: fullName,
    email,
    phone,
    role,
  };

  const avatarUrl =
    profileInput.avatar_url ||
    profileInput.avatarUrl ||
    existingProfile?.avatar_url;

  if (avatarUrl) {
    profilePayload.avatar_url = avatarUrl;
  }

  const verificationStatus =
    profileInput.verification_status ||
    existingProfile?.verification_status;

  if (verificationStatus) {
    profilePayload.verification_status = verificationStatus;
  }

  const hasOnlineInput = typeof profileInput.is_online !== 'undefined';
  const hasExistingOnline = typeof existingProfile?.is_online !== 'undefined';

  if (hasOnlineInput || hasExistingOnline) {
    profilePayload.is_online = hasOnlineInput
      ? profileInput.is_online
      : existingProfile.is_online;
  }

  const vehicleDetails =
    profileInput.vehicle_details ||
    profileInput.vehicleDetails ||
    existingProfile?.vehicle_details;

  if (vehicleDetails) {
    profilePayload.vehicle_details = vehicleDetails;
  }

  const { data, error } = await client
    .from(TABLES.USER_PROFILES)
    .upsert(profilePayload, { onConflict: 'id' })
    .select()
    .single();

  return { data, error };
}

export async function verifyOtpAndSyncProfile(client, payload) {
  const { phone, token, profile } = payload;
  const { data: authData, error: authError } = await verifyPhoneOtp(
    client,
    phone,
    token,
  );

  if (authError) {
    return { data: null, error: authError };
  }

  if (!authData?.session) {
    return { data: authData, error: null };
  }

  const trustedAuthProfile = getTrustedAuthProfile(authData, phone);

  if (trustedAuthProfile) {
    return {
      data: { ...authData, profile: trustedAuthProfile, needsSignup: false },
      error: null,
    };
  }

  const userId = authData?.user?.id || authData?.session?.user?.id;
  const { data: existingProfile, error: lookupError } = await findExistingProfile(
    client,
    phone,
    userId,
  );

  if (lookupError) {
    return { data: { ...authData, profile: null, needsSignup: false }, error: lookupError };
  }

  if (existingProfile && (!profile || Object.keys(profile).length === 0)) {
    return {
      data: { ...authData, profile: existingProfile, needsSignup: false },
      error: null,
    };
  }

  if (!existingProfile) {
    const { data: syncedProfile, error: syncError } = await syncLoginProfile(client);

    if (syncError) {
      return { data: { ...authData, profile: null, needsSignup: false }, error: syncError };
    }

    if (syncedProfile) {
      const refreshedAuthData = await refreshSessionAfterProfileSync(client, authData);

      return {
        data: { ...refreshedAuthData, profile: syncedProfile, needsSignup: false },
        error: null,
      };
    }
  }

  if (!existingProfile && (!profile || Object.keys(profile).length === 0)) {
    if (isSeededLoginPhone(phone)) {
      return {
        data: { ...authData, profile: null, needsSignup: false },
        error: {
          message:
            'Seeded account exists, but login profile sync did not find it. Run 000_wipe_database.sql, then 001_insert_mock_data.sql, then retry this phone login.',
        },
      };
    }

    return {
      data: { ...authData, profile: null, needsSignup: true },
      error: null,
    };
  }

  if (!existingProfile || !profile || Object.keys(profile).length === 0) {
    if (!existingProfile) {
      const { data: profileData, error: profileError } = await upsertCurrentUserProfile(client, {
        phone,
        ...(profile || {}),
      });

      if (profileError) {
        return {
          data: { ...authData, profile: null, needsSignup: false },
          error: profileError,
        };
      }

      return {
        data: { ...authData, profile: profileData, needsSignup: false },
        error: null,
      };
    }

    return {
      data: { ...authData, profile: existingProfile, needsSignup: false },
      error: null,
    };
  }

  const { data: profileData, error: profileError } = await upsertCurrentUserProfile(client, {
    phone,
    ...profile,
  });

  if (profileError) {
    return {
      data: { ...authData, profile: null, needsSignup: false },
      error: profileError,
    };
  }

  return {
    data: { ...authData, profile: profileData, needsSignup: false },
    error: null,
  };
}

export async function completeSignupProfile(client, payload) {
  const metadata = {};

  if (payload.full_name || payload.fullName) {
    metadata.full_name = payload.full_name || payload.fullName;
  }

  if (payload.email) {
    metadata.email = payload.email;
  }

  if (payload.date_of_birth || payload.dateOfBirth) {
    metadata.date_of_birth = payload.date_of_birth || payload.dateOfBirth;
  }

  if (Object.keys(metadata).length > 0) {
    const { error: updateError } = await client.auth.updateUser({ data: metadata });
    if (updateError) {
      return { data: null, error: updateError };
    }
  }

  const { data: profileData, error: profileError } = await upsertCurrentUserProfile(
    client,
    payload,
  );

  if (profileError) {
    return { data: null, error: profileError };
  }

  return { data: profileData, error: null };
}

function buildCustomerSettingsRecord({ profile, user }) {
  const metadata = user?.user_metadata || {};
  const phone = profile?.phone || user?.phone || metadata.phone || '';
  const fullName =
    profile?.full_name ||
    metadata.full_name ||
    fallbackName(phone);
  const username = String(metadata.username || '').trim();
  const email =
    profile?.email ||
    user?.email ||
    metadata.email ||
    fallbackEmail(phone, profile?.id || user?.id);
  const role = profile?.role || metadata.role || USER_ROLES.CUSTOMER;
  const avatarUrl = profile?.avatar_url || metadata.avatar_url || '';
  const addresses = normalizeSavedAddresses(metadata.saved_addresses, metadata.address || 'Naxal, Kathmandu');
  const defaultAddressId = resolveDefaultSavedAddressId(addresses, metadata.default_address_id);
  const defaultAddress = getDefaultSavedAddress(addresses, defaultAddressId, metadata.address || 'Naxal, Kathmandu');

  return {
    id: profile?.id || user?.id || null,
    fullName,
    username,
    email,
    phone,
    role,
    avatarUrl,
    verificationStatus: profile?.verification_status || metadata.verification_status || 'verified',
    isOnline: Boolean(profile?.is_online),
    vehicleType: profile?.vehicle_type || metadata.vehicle_type || '',
    vehicleDetails: profile?.vehicle_details || metadata.vehicle_details || '',
    bikeModel: profile?.bike_model || metadata.bike_model || '',
    bikeCondition: profile?.bike_condition || metadata.bike_condition || '',
    licenseFrontUrl: profile?.license_front_url || metadata.license_front_url || '',
    licenseBackUrl: profile?.license_back_url || metadata.license_back_url || '',
    rejectionReason: profile?.rejection_reason || '',
    addresses,
    defaultAddressId,
    defaultAddress,
  };
}

export async function fetchCustomerSettings(client, userId) {
  try {
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError) {
      return { data: null, error: userError };
    }

    const user = userData?.user || null;
    const targetUserId = userId || user?.id;

    if (!targetUserId) {
      throw new Error('Missing customer id for profile settings.');
    }

    const { data: profile, error: profileError } = await fetchProfileSettingsRecord(client, targetUserId);

    if (profileError) {
      throw profileError;
    }

    return {
      data: buildCustomerSettingsRecord({ profile, user }),
      error: null,
    };
  } catch (error) {
    console.error('Error fetching customer settings:', error);
    return { data: null, error };
  }
}

export async function updateCustomerSettings(client, payload = {}) {
  const {
    full_name,
    fullName,
    phone,
    avatarUrl = '',
    username = '',
    password = '',
    addresses = [],
    defaultAddressId = '',
  } = payload;

  try {
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError) {
      throw userError;
    }

    const user = userData?.user;
    if (!user?.id) {
      throw new Error('No authenticated user found for settings update.');
    }

    const resolvedPhone = String(phone || user.phone || user.user_metadata?.phone || '').trim();
    const resolvedFullName = String(
      full_name ||
      fullName ||
      user.user_metadata?.full_name ||
      fallbackName(resolvedPhone),
    ).trim();
    const resolvedAvatarUrl = String(avatarUrl || user.user_metadata?.avatar_url || '').trim();
    const resolvedUsername = String(username ?? user.user_metadata?.username ?? '').trim();

    const normalizedAddresses = normalizeSavedAddresses(
      addresses,
      user.user_metadata?.address || 'Naxal, Kathmandu',
    );
    const resolvedDefaultAddressId = resolveDefaultSavedAddressId(
      normalizedAddresses,
      defaultAddressId || user.user_metadata?.default_address_id,
    );
    const resolvedDefaultAddress = getDefaultSavedAddress(
      normalizedAddresses,
      resolvedDefaultAddressId,
      user.user_metadata?.address || 'Naxal, Kathmandu',
    );

    const nextAuthPayload = {
      data: {
        ...user.user_metadata,
        full_name: resolvedFullName,
        username: resolvedUsername,
        phone: resolvedPhone,
        avatar_url: resolvedAvatarUrl,
        saved_addresses: normalizedAddresses,
        default_address_id: resolvedDefaultAddressId,
        address: resolvedDefaultAddress,
      },
    };

    if (password) {
      nextAuthPayload.password = password;
    }

    const { data: updatedAuthData, error: updateError } = await client.auth.updateUser(nextAuthPayload);
    if (updateError) {
      throw updateError;
    }

    const { data: profileData, error: profileError } = await upsertCurrentUserProfile(client, {
      full_name: resolvedFullName,
      phone: resolvedPhone,
      avatar_url: resolvedAvatarUrl,
    });

    if (profileError) {
      throw profileError;
    }

    return {
      data: {
        ...buildCustomerSettingsRecord({
          profile: profileData,
          user: updatedAuthData?.user || user,
        }),
      },
      error: null,
    };
  } catch (error) {
    console.error('Error updating customer settings:', error);
    return { data: null, error };
  }
}

export async function logout(client) {
  const { error } = await client.auth.signOut();
  return { error };
}
