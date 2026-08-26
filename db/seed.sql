-- Development-only seed. Apply after the initial migration.
INSERT OR IGNORE INTO users (id, email, display_name) VALUES
  ('seed-user', 'traveller@example.com', 'Demo Traveller');

INSERT OR IGNORE INTO trips (id, owner_id, name, description, start_date, end_date, base_currency, budget, status) VALUES
  ('japan', 'seed-user', 'Japan in Spring', 'A rail-focused spring journey through six destinations.', '2027-05-12', '2027-05-26', 'AUD', 7000, 'planning'),
  ('alpine', 'seed-user', 'The Alpine Arc', 'A multi-country journey through Italy, Switzerland and France.', '2027-09-05', '2027-09-25', 'AUD', 9200, 'idea'),
  ('great-ocean', 'seed-user', 'Great Ocean Road', 'A four-day Australian coastal road trip.', '2026-11-14', '2026-11-17', 'AUD', 1800, 'booked');

INSERT OR IGNORE INTO trip_travellers (id, trip_id, user_id, role) VALUES
  ('seed-owner-japan', 'japan', 'seed-user', 'owner'),
  ('seed-owner-alpine', 'alpine', 'seed-user', 'owner'),
  ('seed-owner-coast', 'great-ocean', 'seed-user', 'owner');

INSERT OR IGNORE INTO trip_segments (id, trip_id, destination_name, country, start_day, end_day, start_date, end_date, latitude, longitude, colour, sort_order) VALUES
  ('tokyo', 'japan', 'Tokyo', 'Japan', 1, 4, '2027-05-12', '2027-05-15', 35.6762, 139.6503, '#c85f49', 0),
  ('koyasan', 'japan', 'Koyasan', 'Japan', 5, 5, '2027-05-16', '2027-05-16', 34.2125, 135.5860, '#a17c53', 1),
  ('kyoto', 'japan', 'Kyoto', 'Japan', 6, 7, '2027-05-17', '2027-05-18', 35.0116, 135.7681, '#617c55', 2),
  ('osaka', 'japan', 'Osaka', 'Japan', 8, 9, '2027-05-19', '2027-05-20', 34.6937, 135.5023, '#3f777c', 3),
  ('onomichi', 'japan', 'Onomichi', 'Japan', 10, 11, '2027-05-21', '2027-05-22', 34.4089, 133.2049, '#5d7094', 4),
  ('hiroshima', 'japan', 'Hiroshima', 'Japan', 12, 15, '2027-05-23', '2027-05-26', 34.3853, 132.4553, '#805c87', 5);

INSERT OR IGNORE INTO trip_days (id, trip_id, day_number, date, title, destination_segment_id) VALUES
  ('day-5', 'japan', 5, '2027-05-16', 'Tokyo → Koyasan', 'koyasan'),
  ('day-6', 'japan', 6, '2027-05-17', 'First light in Kyoto', 'kyoto'),
  ('day-7', 'japan', 7, '2027-05-18', 'Shrines, lanes & markets', 'kyoto');

INSERT OR IGNORE INTO events (id, trip_id, day_id, segment_id, title, category, subcategory, start_time, time_precision, origin, destination, transport_mode, provider, service_number, duration_minutes, estimated_cost, currency, booking_status, payment_status, sort_order) VALUES
  ('e-1', 'japan', 'day-5', 'koyasan', 'Tokyo Station → Shin-Osaka', 'Transport', 'High-speed train', '07:30', 'exact', 'Tokyo Station', 'Shin-Osaka', 'high_speed_train', 'JR Central', 'Nozomi 209', 185, 194, 'AUD', 'need_to_book', 'not_paid', 0),
  ('e-3', 'japan', 'day-5', 'koyasan', 'Eko-in Temple Stay', 'Accommodation', 'Temple stay', '14:30', 'exact', NULL, NULL, NULL, 'Eko-in', NULL, NULL, 210, 'AUD', 'booked', 'paid', 1),
  ('e-4', 'japan', 'day-5', 'koyasan', 'Okunoin Night Tour', 'Attraction', 'Guided tour', '18:45', 'exact', NULL, NULL, NULL, NULL, NULL, 80, 60, 'AUD', 'need_to_book', 'not_paid', 2),
  ('e-9', 'japan', 'day-7', 'kyoto', 'Fushimi Inari at sunrise', 'Attraction', 'Shrine', '06:45', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, 0, 'AUD', 'not_required', 'not_paid', 0),
  ('e-11', 'japan', 'day-7', 'kyoto', 'Nishiki Market lunch', 'Food', 'Market', '13:30', 'approximate', NULL, NULL, NULL, NULL, NULL, NULL, 32, 'AUD', 'not_required', 'not_paid', 1);
