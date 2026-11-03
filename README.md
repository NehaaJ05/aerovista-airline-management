# AeroVista — Airline Booking & Revenue Intelligence System

DBMS Experiential Learning (Level 3) mini-project. Next.js 14 + **MySQL 8** (primary, transactional) + **MongoDB** (NoSQL / vector destination guides).

## Quick start

```bash
npm install
cp .env.example .env.local        # set DATABASE_URL (MySQL root password), SESSION_SECRET, ADMIN_PASSWORD
npm run db:setup                  # schema + seed + admin + demo passenger + booking history (non-destructive)
npm run mongo:seed                # optional: MongoDB guides (needs MONGODB_URI)
mysql -u root -p < database/roles.sql   # optional: DB roles + av_admin / av_passenger users
npm run dev                       # http://localhost:3000
```

Using the mysql CLI instead of `db:setup`:
`mysql -u root -p < database/schema.sql` → `mysql -u root -p airline_intelligence < database/seed.sql` → `npm run db:seed` → `npm run db:demo-data`.

`schema.sql` **upgrades an existing v1 database in place** (adds columns/constraints, never drops data), so you can run it on your current DB. Migrations 001–003 are historical and no longer needed.

### Demo credentials
| Who | Login |
|---|---|
| Passenger | `demo.passenger@aerovista.local` / `demopass1234` |
| Admin | `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env.local` |
| MySQL roles | `av_passenger` / `AvPassenger@2026`, `av_admin` / `AvAdmin@2026` (local only) |

### Reset to a known demo state (run on the morning of the demo)
```bash
npm run demo:reset -- --confirm=airline_intelligence
```
Deletes all bookings/payments/cancellations/flights, regenerates the schedule around **today** and rebuilds the history. Users are kept. It refuses to run unless you type the database name. Back up first if needed: `mysqldump -u root -p airline_intelligence > backup.sql`.

## Live demo flow
1. Home → search BLR → BOM → compare Economy / Flex / Business on one flight card.
2. Register → book a **Flex** fare (simulated UPI/card) → confirmation ticket.
3. My trips → Cancel → dialog shows refund quote from `fn_refund_amount` → refund + seat released.
4. Tomorrow's **AV101 Business is sold out** and **AV701 Economy has 2 seats left** (inventory states to show).
5. Sign in as admin → dashboard updates (KPIs, charts, flight table) → Flights & fares (edit price/seats, delay, cancel flight) → Bookings lookup → Destination guides (MongoDB CRUD + vector search).
6. In MySQL, show the records (see below).

```sql
USE airline_intelligence;
SELECT * FROM v_booking_details ORDER BY booking_id DESC LIMIT 3\G
SELECT * FROM seat_inventory_log ORDER BY log_id DESC LIMIT 4;     -- trigger wrote +1 / -1
SELECT * FROM cancellations ORDER BY cancellation_id DESC LIMIT 1\G -- refund_policy applied
SELECT * FROM v_revenue_summary\G
-- procedure directly:
CALL sp_cancel_booking(<booking_id>, <your user_id>, 'viva demo', @refund); SELECT @refund;
CALL sp_cancel_booking(<same id>, <user_id>, 'again', @r);   -- ERROR 5003 already cancelled
INSERT INTO cancellations (booking_id, refund_amount) VALUES (<confirmed id>, 99999999); -- ERROR 5008 refund cap trigger
```

## DBMS features (where to find them)
| Concept | Object |
|---|---|
| Constraints | PK/FK, UNIQUE, CHECK (`sold_seats <= allocated_seats`, refund % ranges), **composite FK** `bookings(flight_fare_id, flight_id) → flight_fares` |
| Generated column + index | `flights.departure_date` (+ UNIQUE `(flight_number, departure_date)`) |
| Views | `v_flight_occupancy`, `v_revenue_by_flight`, `v_revenue_summary`, `v_daily_revenue` (CTE), `v_route_performance`, `v_booking_details` |
| Functions | `fn_occupancy_pct`, `fn_refund_amount` (refund policy) |
| Procedures | `sp_book_flight` (transaction + `SELECT … FOR UPDATE`), `sp_cancel_booking` (policy + ownership + cap), `sp_cancel_flight` (**cursor**), `sp_complete_departed_flights` |
| Triggers | `trg_booking_status_guard` (BEFORE UPDATE), `trg_booking_confirmed_seat` (AFTER UPDATE), `trg_booking_insert_confirmed` (AFTER INSERT), `trg_payment_amount_guard`, `trg_cancellation_refund_cap` |
| Event | `ev_complete_departed_flights` (every 10 min) |
| Recursive CTE | schedule generation in `seed.sql`; more in `advanced_queries.sql` |
| Roles / RBAC | `roles.sql`: passenger role can only book/cancel **through procedures** |
| NoSQL / vector | MongoDB `destination_guides`: `$jsonSchema` validator, unique + text indexes, 128-dim embeddings, cosine similarity in an aggregation pipeline (or Atlas `$vectorSearch`). Create: `database/mongo/init.mongodb.js`. Admin CRUD at `/admin/guides`. |

**Revenue definition (one place, the views):** gross = all captured payments (SUCCESS + REFUNDED + PARTIALLY_REFUNDED); refunds = Σ `cancellations.refund_amount`; net = gross − refunds; after fuel = net − fuel cost (0 fuel for airline-cancelled flights).

**Refund policy (`fare_classes`):** Economy 0%; Flex 100% (≥24h before departure) / 50% (<24h); Business 100% / 75%. Airline-cancelled flight: 100%.

## Bugs fixed (from v1)
- `sp_cancel_booking` accepted any refund amount from the caller (it refunded ₹100 on a non-refundable fare). The refund is now computed inside the DB, capped at the amount paid, with a trigger as a second guard.
- The revenue summary only counted SUCCESS payments, but the view also counted REFUNDED ones. Both now come from the same view.
- The dashboard clamped "revenue after fuel" to 0 while the SQL returned −fuel. One definition is now used everywhere.
- Non-refundable cancellations marked the payment as REFUNDED even when the refund was ₹0. The payment status now reflects the real refund (`SUCCESS` / `PARTIALLY_REFUNDED` / `REFUNDED`).
- A booking could reference a fare from a different flight. Fixed with a composite FK.
- A cancelled booking could be set back to CONFIRMED and sell a seat again. Fixed with the status-guard trigger.
- The seat-release trigger used unsigned subtraction, which could fail at 0 seats.
- Seeded flights were relative to the seed time, so they went stale and search came up empty. The schedule is now generated around today and `demo:reset` regenerates it.
- The seed scripts read `.env`, not `.env.local`, so following the README failed.
- The same flight appeared as 3 separate cards (one per fare). It is now one card with 3 fare options.
- Times shifted by timezone (DATETIME → JS Date). Times are now returned as strings and shown as airport-local time.
- The vector search endpoint needed a raw vector and Atlas. It now works with a text query on local MongoDB.

## Tests
`npm test` runs 42 unit tests (analytics/refund maths, validators, SQL splitter, embeddings). `npm run typecheck` and `npm run build` both pass. Verified against MySQL 8.0 + MongoDB 8.0: booking, cancel with refund, double cancel (5003), cancelling someone else's booking (5002), fare/flight mismatch (5007 + FK), sold-out fare (5005), refund-cap trigger (5008), illegal status change (5009), `sp_cancel_flight`, non-admin → 403, seat totals = active bookings = inventory log. **Not tested:** MongoDB Atlas `$vectorSearch` (local fallback tested), Windows, and many users booking at the same time from a browser (the lock is in `sp_book_flight`).
