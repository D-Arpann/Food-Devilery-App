-- ==========================================
-- FILE: 004_demo_restaurants.sql
-- Description: Demo seed data for 3 restaurants + 9 menu items
-- ==========================================

-- NOTE:
-- profiles.id references auth.users(id), so we seed demo auth users first.
-- This migration is idempotent and safe to rerun.

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
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
    '0b2f6b3e-6ce1-4e41-9eb5-1b7f0f11a111',
    'authenticated',
    'authenticated',
    'demo.restaurant1@chitomitho.local',
    '$2a$10$7EqJtq98hPqEX7fNZaFWoO5KyI2ryG5kyR3O6jwxKF1uHmVGuTZGi',
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Himalayan Momo House"}'::jsonb,
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
    '$2a$10$7EqJtq98hPqEX7fNZaFWoO5KyI2ryG5kyR3O6jwxKF1uHmVGuTZGi',
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Kathmandu Spice Kitchen"}'::jsonb,
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
    '$2a$10$7EqJtq98hPqEX7fNZaFWoO5KyI2ryG5kyR3O6jwxKF1uHmVGuTZGi',
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Newa Khaja Corner"}'::jsonb,
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (
  id,
  full_name,
  email,
  phone,
  role,
  verification_status,
  is_online
)
VALUES
  (
    '0b2f6b3e-6ce1-4e41-9eb5-1b7f0f11a111',
    'Himalayan Momo House',
    'demo.restaurant1@chitomitho.local',
    '9800000001',
    'food_place',
    'verified',
    TRUE
  ),
  (
    '1c3a7d4f-8df2-4b52-aec6-2c8a1a22b222',
    'Kathmandu Spice Kitchen',
    'demo.restaurant2@chitomitho.local',
    '9800000002',
    'food_place',
    'verified',
    TRUE
  ),
  (
    '2d4b8e50-9ef3-4c63-bfd7-3d9b2b33c333',
    'Newa Khaja Corner',
    'demo.restaurant3@chitomitho.local',
    '9800000003',
    'food_place',
    'verified',
    TRUE
  )
ON CONFLICT (id) DO UPDATE
SET
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  role = EXCLUDED.role,
  verification_status = EXCLUDED.verification_status,
  is_online = EXCLUDED.is_online;

INSERT INTO food_places (
  id,
  owner_id,
  name,
  description,
  image_url,
  address,
  is_active,
  verification_status
)
VALUES
  (
    '3e5c9f61-af04-4d74-c0e8-4eac3c44d444',
    '0b2f6b3e-6ce1-4e41-9eb5-1b7f0f11a111',
    'Himalayan Momo House',
    'Steamed and fried momo with fresh chutneys.',
    'https://images.unsplash.com/photo-1619895092538-128341789043',
    'Lazimpat, Kathmandu',
    TRUE,
    'verified'
  ),
  (
    '4f6da072-b105-4e85-d1f9-5fbd4d55e555',
    '1c3a7d4f-8df2-4b52-aec6-2c8a1a22b222',
    'Kathmandu Spice Kitchen',
    'Comfort meals with Nepali and Indo-fusion flavors.',
    'https://images.unsplash.com/photo-1504674900247-0877df9cc836',
    'Thamel, Kathmandu',
    TRUE,
    'verified'
  ),
  (
    '607eb183-c216-4f96-e20a-60ce5e66f666',
    '2d4b8e50-9ef3-4c63-bfd7-3d9b2b33c333',
    'Newa Khaja Corner',
    'Traditional Newari snacks and evening sets.',
    'https://images.unsplash.com/photo-1546069901-ba9599a7e63c',
    'Patan Durbar Square, Lalitpur',
    TRUE,
    'verified'
  )
ON CONFLICT (id) DO UPDATE
SET
  owner_id = EXCLUDED.owner_id,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  image_url = EXCLUDED.image_url,
  address = EXCLUDED.address,
  is_active = EXCLUDED.is_active,
  verification_status = EXCLUDED.verification_status;

INSERT INTO menu_items (
  id,
  food_place_id,
  name,
  description,
  price,
  image_url,
  is_available,
  category
)
VALUES
  (
    '718fc294-d327-4aa7-831b-71df6f77a777',
    '3e5c9f61-af04-4d74-c0e8-4eac3c44d444',
    'Chicken Steam Momo',
    '10 pieces served with tomato-sesame achar.',
    220,
    'https://images.unsplash.com/photo-1625938145744-5ec4d9e57fd6',
    TRUE,
    'Momo'
  ),
  (
    'a4b2f5c7-065a-4dda-a64e-a4f29210d101',
    '3e5c9f61-af04-4d74-c0e8-4eac3c44d444',
    'Buff C-Momo',
    'Pan-fried chili momo with onions and bell peppers.',
    280,
    'https://images.unsplash.com/photo-1544025162-d76694265947',
    TRUE,
    'Momo'
  ),
  (
    'b5c3a6d8-176b-4eeb-b75f-b503a321e202',
    '3e5c9f61-af04-4d74-c0e8-4eac3c44d444',
    'Jhol Momo',
    'Steamed momo served in spiced sesame broth.',
    260,
    'https://images.unsplash.com/photo-1604908176997-431f7e2a89ff',
    TRUE,
    'Momo'
  ),
  (
    '8290d3a5-e438-4bb8-942c-82e07088b888',
    '4f6da072-b105-4e85-d1f9-5fbd4d55e555',
    'Paneer Butter Masala Set',
    'Paneer curry with jeera rice and salad.',
    360,
    'https://images.unsplash.com/photo-1631452180519-c014fe946bc7',
    TRUE,
    'Main Course'
  ),
  (
    'c6d4b7e9-287c-4ffc-c860-c614b432f303',
    '4f6da072-b105-4e85-d1f9-5fbd4d55e555',
    'Chicken Biryani',
    'Fragrant basmati rice with spiced chicken and raita.',
    390,
    'https://images.unsplash.com/photo-1563379091339-03246963d29a',
    TRUE,
    'Main Course'
  ),
  (
    'd7e5c8fa-398d-401d-d971-d725c543a404',
    '4f6da072-b105-4e85-d1f9-5fbd4d55e555',
    'Butter Naan Basket',
    'Set of 3 soft butter naan breads.',
    140,
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4',
    TRUE,
    'Bread'
  ),
  (
    '93a1e4b6-f549-4cc9-a53d-93f18199c999',
    '607eb183-c216-4f96-e20a-60ce5e66f666',
    'Newari Khaja Set',
    'Beaten rice, choila, aloo achar, and boiled egg.',
    420,
    'https://images.unsplash.com/photo-1627308595229-7830a5c91f9f',
    TRUE,
    'Newari'
  ),
  (
    'e8f6d90b-4a9e-412e-ea82-e836d654b505',
    '607eb183-c216-4f96-e20a-60ce5e66f666',
    'Choila Platter',
    'Smoky grilled buff choila with mustard oil dressing.',
    340,
    'https://images.unsplash.com/photo-1608039755401-742074f0548d',
    TRUE,
    'Newari'
  ),
  (
    'f907ea1c-5baf-423f-fb93-f947e765c606',
    '607eb183-c216-4f96-e20a-60ce5e66f666',
    'Yomari Trio',
    'Three traditional yomari with chaku and khuwa filling.',
    210,
    'https://images.unsplash.com/photo-1555939594-58d7cb561ad1',
    TRUE,
    'Dessert'
  )
ON CONFLICT (id) DO UPDATE
SET
  food_place_id = EXCLUDED.food_place_id,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  image_url = EXCLUDED.image_url,
  is_available = EXCLUDED.is_available,
  category = EXCLUDED.category;
