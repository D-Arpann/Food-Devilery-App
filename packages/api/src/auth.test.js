import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AUTH_OTP_LENGTH } from '@repo/utils';
import { fetchCustomerSettings, verifyOtpAndSyncProfile } from './auth.js';

class ProfileQuery {
  constructor(store) {
    this.store = store;
    this.payload = null;
  }

  select() {
    return this;
  }

  eq() {
    return this;
  }

  async maybeSingle() {
    return { data: null, error: null };
  }

  upsert(payload) {
    this.payload = payload;
    this.store.upsertedProfile = payload;
    return this;
  }

  async single() {
    return { data: this.payload, error: null };
  }
}

function createOtpClient(options = {}) {
  const store = { rpcCalls: [] };
  const user = {
    id: 'user-from-otp',
    phone: '+9779800000999',
    email: null,
    user_metadata: {},
    app_metadata: options.appMetadata || {},
  };

  return {
    store,
    client: {
      auth: {
        async verifyOtp() {
          return {
            data: {
              session: { user },
              user,
            },
            error: null,
          };
        },
        async getUser() {
          return { data: { user }, error: null };
        },
        async refreshSession() {
          store.refreshedSession = true;
          return {
            data: {
              session: { user, access_token: 'refreshed-token' },
              user,
            },
            error: null,
          };
        },
      },
      async rpc(name) {
        store.rpcCalls.push(name);

        if (options.rpcError) {
          return { data: null, error: options.rpcError };
        }

        return { data: options.rpcData || null, error: null };
      },
      from() {
        return new ProfileQuery(store);
      },
    },
  };
}

describe('phone OTP profile sync', () => {
  it('requires explicit signup when OTP auth succeeds without a profile', async () => {
    const { client, store } = createOtpClient();

    const { data, error } = await verifyOtpAndSyncProfile(client, {
      phone: '+9779800000999',
      token: '123456',
    });

    assert.equal(error, null);
    assert.equal(data.needsSignup, true);
    assert.equal(data.profile, null);
    assert.equal(store.upsertedProfile, undefined);
  });

  it('creates a profile from explicit signup details after OTP verification', async () => {
    const { client, store } = createOtpClient();

    const { data, error } = await verifyOtpAndSyncProfile(client, {
      phone: '+9779800000999',
      token: '123456',
      profile: {
        full_name: 'Arpan Dahal',
        email: 'arpan@example.com',
      },
    });

    assert.equal(error, null);
    assert.equal(data.needsSignup, false);
    assert.equal(data.profile.full_name, 'Arpan Dahal');
    assert.equal(data.profile.email, 'arpan@example.com');
    assert.equal(store.upsertedProfile.phone, '+9779800000999');
  });

  it('uses the database login profile sync before sending seeded phone users to signup', async () => {
    const restaurantProfile = {
      id: 'user-from-otp',
      full_name: 'Himalayan Momo House',
      email: 'demo.restaurant1@chitomitho.local',
      phone: '+9779800000001',
      role: 'restaurant_owner',
      verification_status: 'verified',
    };

    const { client, store } = createOtpClient({
      rpcData: [restaurantProfile],
    });

    const { data, error } = await verifyOtpAndSyncProfile(client, {
      phone: '+9779800000001',
      token: '123456',
    });

    assert.equal(error, null);
    assert.deepEqual(store.rpcCalls, ['sync_login_profile']);
    assert.equal(store.refreshedSession, true);
    assert.equal(data.session.access_token, 'refreshed-token');
    assert.equal(data.needsSignup, false);
    assert.equal(data.profile.role, 'restaurant_owner');
    assert.equal(store.upsertedProfile, undefined);
  });

  it('uses trusted auth app metadata before calling login sync RPC', async () => {
    const { client, store } = createOtpClient({
      appMetadata: {
        role: 'admin',
        verification_status: 'verified',
      },
    });

    const { data, error } = await verifyOtpAndSyncProfile(client, {
      phone: '+9779800000000',
      token: '123456',
    });

    assert.equal(error, null);
    assert.equal(data.needsSignup, false);
    assert.equal(data.profile.role, 'admin');
    assert.deepEqual(store.rpcCalls, []);
  });

  it('does not route seeded admin phones to customer signup when DB sync is missing', async () => {
    const { client, store } = createOtpClient({
      rpcError: {
        code: 'PGRST202',
        message: 'Could not find the function public.sync_login_profile',
      },
    });

    const { data, error } = await verifyOtpAndSyncProfile(client, {
      phone: '+9779800000000',
      token: '123456',
    });

    assert.equal(data.needsSignup, false);
    assert.match(error.message, /Run 000_wipe_database\.sql/);
    assert.deepEqual(store.rpcCalls, ['sync_login_profile']);
  });

  it('does not route seeded restaurant phones to customer signup when DB sync is missing', async () => {
    const { client } = createOtpClient({
      rpcError: {
        code: 'PGRST202',
        message: 'Could not find the function public.sync_login_profile',
      },
    });

    const { data, error } = await verifyOtpAndSyncProfile(client, {
      phone: '+9779811001001',
      token: '123456',
    });

    assert.equal(data.needsSignup, false);
    assert.match(error.message, /Seeded account exists/);
  });
});

describe('OTP configuration', () => {
  it('uses six digit OTP codes app wide', () => {
    assert.equal(AUTH_OTP_LENGTH, 6);
  });

  it('allows 123456 OTP login for every seeded auth phone', () => {
    const seedSql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/001_insert_mock_data.sql'),
      'utf8',
    );
    const configToml = readFileSync(
      resolve(process.cwd(), 'supabase/config.toml'),
      'utf8',
    );
    const seededPhones = [
      ...new Set([...seedSql.matchAll(/'\+977\d{10}'/g)].map(([phone]) => phone.slice(2, -1))),
    ].sort();

    assert.ok(seededPhones.length > 0, 'seed SQL includes phone auth accounts');
    seededPhones.forEach((phone) => {
      assert.match(configToml, new RegExp(`"${phone}"\\s*=\\s*"123456"`));
    });
  });
});

describe('customer settings', () => {
  it('falls back to base profile columns when rider application columns are not migrated yet', async () => {
    const selects = [];
    const user = {
      id: 'customer-id',
      phone: '+9779800000100',
      email: 'customer@example.com',
      user_metadata: {
        full_name: 'Demo Customer',
        address: 'Naxal, Kathmandu',
      },
    };

    const profile = {
      id: 'customer-id',
      full_name: 'Demo Customer',
      email: 'customer@example.com',
      phone: '+9779800000100',
      role: 'customer',
      avatar_url: null,
      verification_status: 'verified',
      is_online: false,
      vehicle_details: null,
      rejection_reason: null,
    };

    const client = {
      auth: {
        async getUser() {
          return { data: { user }, error: null };
        },
      },
      from() {
        return {
          select(columns) {
            selects.push(columns);
            this.columns = columns;
            return this;
          },
          eq() {
            return this;
          },
          async maybeSingle() {
            if (this.columns.includes('bike_model')) {
              return {
                data: null,
                error: {
                  code: '42703',
                  message: 'column user_profiles.bike_model does not exist',
                },
              };
            }

            return { data: profile, error: null };
          },
        };
      },
    };

    const { data, error } = await fetchCustomerSettings(client, 'customer-id');

    assert.equal(error, null);
    assert.equal(data.fullName, 'Demo Customer');
    assert.equal(data.role, 'customer');
    assert.equal(data.bikeModel, '');
    assert.equal(selects.length, 2);
    assert.match(selects[0], /bike_model/);
    assert.doesNotMatch(selects[1], /bike_model/);
  });
});

describe('seeded OTP accounts', () => {
  it('seeds admin, restaurant, customer, and rider users with E.164 phone identities', () => {
    const seedSql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/001_insert_mock_data.sql'),
      'utf8',
    );

    [
      '+9779800000000',
      '+9779800000001',
      '+9779800000100',
      '+9779800000200',
    ].forEach((phone) => {
      assert.match(seedSql, new RegExp(`'${phone.replace('+', '\\+')}'`));
    });

    assert.match(seedSql, /phone_confirmed_at/);
    assert.match(seedSql, /'phone'/);
    assert.match(seedSql, /CREATE TEMP TABLE seeded_profile_map/);
    assert.match(seedSql, /RIGHT\(REGEXP_REPLACE\(COALESCE\(p\.phone, ''\), '\\D', '', 'g'\), 10\)/);
    assert.match(seedSql, /email = 'archived-' \|\| p\.id::TEXT/);
    assert.match(seedSql, /phone = 'archived-' \|\| p\.id::TEXT/);
    assert.match(seedSql, /DELETE FROM auth\.users u/);
    assert.match(seedSql, /u\.id = m\.stale_id/);
    assert.match(seedSql, /r\.owner_id = m\.stale_id/);
    assert.match(seedSql, /u\.id::TEXT/);
    assert.match(seedSql, /'phone', u\.phone/);
    assert.doesNotMatch(seedSql, /Demo login password/i);
  });

  it('syncs stale OTP auth users to the matching seeded app profile', () => {
    const schemaSql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/000_wipe_database.sql'),
      'utf8',
    );

    assert.match(schemaSql, /verification_status public\.verification_status NOT NULL DEFAULT 'verified'/);
    assert.match(schemaSql, /CREATE OR REPLACE FUNCTION private\.sync_login_profile\(\)/);
    assert.match(schemaSql, /CREATE OR REPLACE FUNCTION public\.sync_login_profile\(\)/);
    assert.match(schemaSql, /WHERE p\.phone = current_phone/);
    assert.match(schemaSql, /current_phone_national_digits := RIGHT\(current_phone_digits, 10\)/);
    assert.match(schemaSql, /current_phone_national_digits/);
    assert.match(schemaSql, /REGEXP_REPLACE\(COALESCE\(p\.phone, ''\), '\\D', '', 'g'\)/);
    assert.match(schemaSql, /SET owner_id = current_user_id/);
    assert.match(schemaSql, /GRANT EXECUTE ON FUNCTION public\.sync_login_profile\(\) TO authenticated/);
  });

  it('normalizes seeded auth phones to Supabase format and app profile phones to E.164', () => {
    const migrationsDir = resolve(process.cwd(), 'supabase/migrations');
    const migrationSql = readFileSync(
      resolve(migrationsDir, '20260514064047_add_restaurant_rejection_reason.sql'),
      'utf8',
    );

    assert.match(migrationSql, /UPDATE auth\.users[\s\S]*phone ~ '\^\\\+977\[0-9\]\{10\}\$'/);
    assert.match(migrationSql, /UPDATE public\.user_profiles[\s\S]*phone ~ '\^977\[0-9\]\{10\}\$'/);
    assert.match(migrationSql, /UPDATE auth\.identities[\s\S]*identity_data ->> 'phone' ~ '\^\\\+977\[0-9\]\{10\}\$'/);
    assert.match(migrationSql, /CREATE TEMP TABLE seeded_owner_profile_map/);
    assert.match(migrationSql, /UPDATE public\.restaurants[\s\S]*owner_id = m\.canonical_id/);
    assert.match(migrationSql, /DELETE FROM auth\.users[\s\S]*u\.id = m\.stale_id/);
    assert.match(migrationSql, /CREATE TEMP TABLE seeded_orphan_phone_auth_map/);
    assert.match(migrationSql, /REGEXP_REPLACE\(COALESCE\(canonical\.phone, ''\), '\\D', '', 'g'\)/);
  });

  it('does not make admin policy read user_profiles recursively', () => {
    const schemaSql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/000_wipe_database.sql'),
      'utf8',
    );
    const functionMatch = schemaSql.match(
      /CREATE OR REPLACE FUNCTION public\.current_user_is_admin\(\)[\s\S]*?\$\$;/,
    );

    assert.ok(functionMatch, 'current_user_is_admin function exists');
    assert.match(functionMatch[0], /auth\.jwt\(\)\s*->\s*'app_metadata'\s*->>\s*'role'/);
    assert.doesNotMatch(functionMatch[0], /FROM\s+public\.user_profiles/i);
  });
});
