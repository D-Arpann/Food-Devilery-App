import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  rejectAdminRestaurantApplication,
  rejectAdminRiderApplication,
  submitRiderApplication,
  submitRestaurantApplication,
  subscribeToCustomerOrders,
  subscribeToRestaurantFeed,
  updateRestaurantProfile,
  uploadRestaurantImage,
} from './queries.js';

class QueryBuilder {
  constructor(table, store) {
    this.table = table;
    this.store = store;
    this.operation = '';
    this.payload = null;
  }

  select() {
    this.operation = this.operation || 'select';
    return this;
  }

  eq() {
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  upsert(payload) {
    this.operation = 'upsert';
    this.payload = payload;
    this.store.upserts.push({ table: this.table, payload });
    return this;
  }

  insert(payload) {
    this.operation = 'insert';
    this.payload = payload;
    this.store.inserts.push({ table: this.table, payload });
    return this;
  }

  update(payload) {
    this.operation = 'update';
    this.payload = payload;
    this.store.updates.push({ table: this.table, payload });
    return this;
  }

  async maybeSingle() {
    return { data: null, error: null };
  }

  async single() {
    if (this.table === 'restaurants' && this.operation === 'insert') {
      return {
        data: {
          id: 'restaurant-id',
          verification_status: 'pending',
          ...this.payload[0],
        },
        error: null,
      };
    }

    return { data: this.payload, error: null };
  }

  then(resolve) {
    resolve({ data: [], error: null });
  }
}

function createRestaurantClient() {
  const store = {
    inserts: [],
    upserts: [],
    updates: [],
  };
  const user = {
    id: 'owner-id',
    email: 'owner@example.com',
    phone: '+9779800000001',
    user_metadata: { full_name: 'Owner Name' },
  };

  return {
    store,
    client: {
      auth: {
        async getUser() {
          return { data: { user }, error: null };
        },
        async updateUser(payload) {
          store.updatedAuthUser = payload;
          return { data: { user }, error: null };
        },
      },
      from(table) {
        return new QueryBuilder(table, store);
      },
    },
  };
}

describe('restaurant applications', () => {
  it('stores customer-facing bio and image details with the pending application', async () => {
    const { client, store } = createRestaurantClient();

    const { data, error } = await submitRestaurantApplication(client, {
      restaurantName: 'Everest Thali',
      description: 'Family-run Nepali thali and snacks.',
      imageUrl: 'https://example.test/everest.jpg',
      email: 'owner@example.com',
      phone: '9800000001',
      location: 'Naxal, Kathmandu',
    });

    assert.equal(error, null);
    assert.equal(data.mode, 'created');

    const insert = store.inserts.find((entry) => entry.table === 'restaurants');
    assert.equal(insert.payload[0].description, 'Family-run Nepali thali and snacks.');
    assert.equal(insert.payload[0].image_url, 'https://example.test/everest.jpg');
    assert.equal(insert.payload[0].banner_url, 'https://example.test/everest.jpg');
    assert.equal(insert.payload[0].profile_image_url, null);
    assert.equal(insert.payload[0].contact_phone, '+9779800000001');
  });

  it('does not clear restaurant image when profile form saves text fields only', async () => {
    const { client, store } = createRestaurantClient();

    const { error } = await updateRestaurantProfile(client, 'restaurant-id', {
      name: 'Everest Thali',
      description: 'Family-run Nepali thali and snacks.',
      email: 'owner@example.com',
      phone: '9800000001',
      address: 'Naxal, Kathmandu',
    });

    assert.equal(error, null);

    const update = store.updates.find((entry) => entry.table === 'restaurants');
    assert.ok(update);
    assert.equal(Object.hasOwn(update.payload, 'image_url'), false);
    assert.equal(Object.hasOwn(update.payload, 'banner_url'), false);
    assert.equal(Object.hasOwn(update.payload, 'profile_image_url'), false);
  });

  it('updates banner and profile image columns separately after upload', async () => {
    const store = {
      updates: [],
      uploads: [],
    };
    const client = {
      from(table) {
        return new QueryBuilder(table, store);
      },
      storage: {
        from(bucket) {
          assert.equal(bucket, 'restaurant_images');
          return {
            async upload(path, file, options) {
              store.uploads.push({ path, file, options });
              return { error: null };
            },
            getPublicUrl(path) {
              return { data: { publicUrl: `https://cdn.test/${path}` } };
            },
          };
        },
      },
    };
    const bannerFile = { name: 'banner.png', type: 'image/png' };
    const profileFile = { name: 'profile.jpg', type: 'image/jpeg' };

    const bannerResult = await uploadRestaurantImage(client, 'owner-id', 'restaurant-id', bannerFile, 'banner');
    const profileResult = await uploadRestaurantImage(client, 'owner-id', 'restaurant-id', profileFile, 'profile');

    assert.equal(bannerResult.error, null);
    assert.equal(profileResult.error, null);
    assert.equal(bannerResult.data.kind, 'banner');
    assert.equal(profileResult.data.kind, 'profile');

    assert.deepEqual(
      store.updates.map((entry) => entry.payload),
      [
        {
          banner_url: 'https://cdn.test/owner-id/restaurant-restaurant-id-banner.png',
          image_url: 'https://cdn.test/owner-id/restaurant-restaurant-id-banner.png',
        },
        {
          profile_image_url: 'https://cdn.test/owner-id/restaurant-restaurant-id-profile.jpg',
        },
      ],
    );
  });
});

describe('rider applications', () => {
  it('requires bike details and both license images before creating a pending rider application', async () => {
    const { client } = createRestaurantClient();

    const { data, error } = await submitRiderApplication(client, {
      riderName: 'Demo Customer',
      phone: '9800000201',
      vehicleType: 'motorbike',
      bikeModel: 'Honda Dio',
      bikeCondition: 'Good',
      licenseFrontUrl: 'https://cdn.test/rider/license-front.jpg',
    });

    assert.equal(data, null);
    assert.match(error.message, /license front and back/i);
  });

  it('stores bicycle applications without bike model or license images', async () => {
    const { client, store } = createRestaurantClient();

    const { data, error } = await submitRiderApplication(client, {
      riderName: 'Demo Customer',
      phone: '9800000201',
      vehicleType: 'bicycle',
    });

    assert.equal(error, null);
    assert.equal(data.role, 'rider');
    assert.equal(data.verification_status, 'pending');

    const upsert = store.upserts.find((entry) => entry.table === 'user_profiles');
    assert.equal(upsert.payload.vehicle_type, 'bicycle');
    assert.equal(upsert.payload.bike_model, null);
    assert.equal(upsert.payload.bike_condition, null);
    assert.equal(upsert.payload.license_front_url, null);
    assert.equal(upsert.payload.license_back_url, null);
    assert.match(upsert.payload.vehicle_details, /Bicycle/);
  });

  it('stores bike details and license document URLs with a pending rider role', async () => {
    const { client, store } = createRestaurantClient();

    const { data, error } = await submitRiderApplication(client, {
      riderName: 'Demo Customer',
      phone: '9800000201',
      vehicleType: 'scooter',
      bikeModel: 'Honda Dio',
      bikeCondition: 'Good',
      licenseFrontUrl: 'https://cdn.test/rider/license-front.jpg',
      licenseBackUrl: 'https://cdn.test/rider/license-back.jpg',
    });

    assert.equal(error, null);
    assert.equal(data.role, 'rider');
    assert.equal(data.verification_status, 'pending');

    const upsert = store.upserts.find((entry) => entry.table === 'user_profiles');
    assert.equal(upsert.payload.vehicle_type, 'scooter');
    assert.equal(upsert.payload.bike_model, 'Honda Dio');
    assert.equal(upsert.payload.bike_condition, 'Good');
    assert.equal(upsert.payload.license_front_url, 'https://cdn.test/rider/license-front.jpg');
    assert.equal(upsert.payload.license_back_url, 'https://cdn.test/rider/license-back.jpg');
    assert.match(upsert.payload.vehicle_details, /Honda Dio/);
    assert.equal(upsert.payload.rejection_reason, null);
  });
});

describe('admin application rejection', () => {
  it('stores a rejection reason for restaurant applications', async () => {
    const { client, store } = createRestaurantClient();

    const { data, error } = await rejectAdminRestaurantApplication(
      client,
      'restaurant-id',
      'Upload a clearer storefront photo.',
    );

    assert.equal(error, null);
    assert.equal(data.verification_status, 'rejected');

    const update = store.updates.find((entry) => entry.table === 'restaurants');
    assert.equal(update.payload.verification_status, 'rejected');
    assert.equal(update.payload.rejection_reason, 'Upload a clearer storefront photo.');
  });

  it('stores a rejection reason for rider applications', async () => {
    const { client, store } = createRestaurantClient();

    const { data, error } = await rejectAdminRiderApplication(
      client,
      'profile-id',
      'License back image is unreadable.',
    );

    assert.equal(error, null);
    assert.equal(data.verification_status, 'rejected');

    const update = store.updates.find((entry) => entry.table === 'user_profiles');
    assert.equal(update.payload.verification_status, 'rejected');
    assert.equal(update.payload.rejection_reason, 'License back image is unreadable.');
  });
});

describe('realtime subscriptions', () => {
  it('subscribes to restaurant and menu changes so customer feeds can refresh', () => {
    const handlers = [];
    const client = {
      channel(name) {
        assert.equal(name, 'restaurant-feed');
        return {
          on(type, options, handler) {
            handlers.push({ type, options, handler });
            return this;
          },
          subscribe() {
            return this;
          },
        };
      },
      removeChannel(channel) {
        assert.ok(channel);
      },
    };

    const unsubscribe = subscribeToRestaurantFeed(client, () => {});

    assert.equal(typeof unsubscribe, 'function');
    assert.deepEqual(
      handlers.map((entry) => entry.options.table),
      ['restaurants', 'restaurant_menu_items'],
    );
  });

  it('subscribes to customer order changes for live status updates', () => {
    const handlers = [];
    const client = {
      channel(name) {
        assert.equal(name, 'customer-orders-customer-id');
        return {
          on(type, options, handler) {
            handlers.push({ type, options, handler });
            return this;
          },
          subscribe() {
            return this;
          },
        };
      },
      removeChannel(channel) {
        assert.ok(channel);
      },
    };

    const unsubscribe = subscribeToCustomerOrders(client, 'customer-id', () => {});

    assert.equal(typeof unsubscribe, 'function');
    assert.equal(handlers.length, 2);
    assert.ok(handlers.every((entry) => entry.options.filter === 'customer_id=eq.customer-id'));
  });
});
