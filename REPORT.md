# Project Report — AeroVista

Airline Booking & Revenue Intelligence System — DBMS Level 3.

## 1. Problem statement

Maintain structured airline data (passengers, flights, fares,
bookings, payments, cancellations) and use it to compute occupancy,
revenue and demand intelligence that would support airline pricing
and seat-allocation decisions.

## 2. System architecture

Three layers:

1. **UI** — Next.js App Router pages (`src/app/*`) rendered as React
   client/server components. The nav is session-aware; the admin
   dashboard auto-refreshes every 10 s.
2. **API** — Next.js route handlers (`src/app/api/*`) that validate
   every request with `zod`, authenticate via a signed HTTP-only
   cookie, and talk to MySQL through a lazily-created connection pool.
   Every response is JSON, including errors.
3. **Databases** — MySQL 8.0 is the system of record. MongoDB Atlas
   is an optional supplement used only for vector search over route
   descriptions.

A deliberately small amount of logic lives in the application —
inventory, revenue, occupancy and the atomic booking workflow are
expressed in SQL (constraints, triggers, views, a procedure).

## 3. MySQL vs NoSQL distribution

| Area | Store | Why |
| ---- | ----- | --- |
| Users, passengers, authentication | MySQL | Transactional, relational |
| Airports, aircraft, routes | MySQL | Reference master data |
| Flights, fare classes, flight fares | MySQL | Inventory with constraints |
| Bookings, payments, cancellations | MySQL | ACID lifecycle |
| Occupancy and revenue analytics | MySQL | Expressed as SQL views |
| Route embeddings (vector search) | MongoDB | Native vector index |

Roughly 90% MySQL / 10% MongoDB. The application works end-to-end
without MongoDB; only `/api/vector-search` requires it, and that
endpoint reports a clean 503 when `MONGODB_URI` is empty.

## 4. ER model and relational schema

11 entities, matching the submitted ER diagram:
`users`, `passengers`, `airports`, `aircraft`, `routes`, `flights`,
`fare_classes`, `flight_fares`, `bookings`, `payments`, `cancellations`.

Important relationships:

- `passengers.user_id` → `users` (1:1, `UNIQUE`)
- `routes` → two FKs into `airports`, plus `CHECK (origin <> destination)`
- `flights` → `routes`, `aircraft`
- `flight_fares` → `flights`, `fare_classes`; `UNIQUE(flight_id, fare_class_id)`
- `bookings` → `users`, `flights`, `flight_fares`
- `payments.booking_id` → `bookings`, `UNIQUE` — **one payment per booking**
- `cancellations.booking_id` → `bookings`, `UNIQUE` — **one cancellation per booking**

## 5. Normalisation

Schema is in 3NF. No repeating groups; every non-key attribute depends
on its table's full primary key; derived values (occupancy, revenue)
are computed in views, never duplicated.

`flight_fares.sold_seats` is the single authoritative inventory
counter. `flights.available_seats` is retained as a static capacity
hint (part of the ER diagram) but is never used as live inventory —
`v_flight_occupancy` prefers `SUM(flight_fares.allocated_seats)` and
falls back to `available_seats` only when a flight has no fares.

## 6. Constraints

- `NOT NULL` on every semantically-required column
- `UNIQUE` on `users.email`, `airports.airport_code`,
  `aircraft.registration_no`, `bookings.booking_reference`,
  `payments.booking_id`, `cancellations.booking_id`,
  `(flight_id, fare_class_id)` on `flight_fares`,
  `(origin, destination)` on `routes`
- `CHECK` on `flight_fares.sold_seats <= allocated_seats`,
  `flights.arrival_time > departure_time`,
  `aircraft.total_seats > 0`, `routes.distance_km > 0`,
  non-negative amounts on payments / bookings / refunds / fares
- `ENUM` on roles, booking status, payment status, loyalty tier,
  flight status, fare class refundability
- Foreign-key referential integrity throughout; `ON DELETE CASCADE`
  on `passengers → users` and `flight_fares → flights`

## 7. Advanced SQL features demonstrated

See `database/schema.sql` and `database/advanced_queries.sql`.

- **Views** — `v_flight_occupancy`, `v_revenue_by_flight`
- **Stored function** — `fn_occupancy_pct(flight_id)` (deterministic)
- **Stored procedure** — `sp_cancel_booking(booking_id, refund, reason)`
  with explicit `START TRANSACTION / COMMIT / ROLLBACK` and `SIGNAL`
  on invalid states
- **Triggers** — `trg_booking_confirmed_seat` (AFTER UPDATE: increment
  on confirm, decrement on cancel), `trg_booking_insert_confirmed`
  (AFTER INSERT: defence in depth for direct-confirmed inserts)
- **Transactions + row locking** — `POST /api/bookings` and
  `sp_cancel_booking` both wrap their work in a transaction and use
  `SELECT ... FOR UPDATE` on the fare / booking row
- **Nested, correlated and recursive queries** — in
  `advanced_queries.sql`
- **CTEs** — `route_demand` (regular), `days` (recursive)
- **Aggregation + HAVING** — route-demand summary
- **Indexes** — `idx_flight_departure`, `idx_flight_route_departure`,
  `idx_flight_status`, `idx_fare_available`, `idx_booking_user_date`,
  `idx_booking_flight_status`, `idx_payment_status`
- **Roles / permissions** — `airline_passenger_role`,
  `airline_admin_role` with narrow and broad grants respectively

## 8. Authentication and authorisation

- Passwords hashed with `bcryptjs` (12 rounds)
- Session JWT signed with HS256 using `SESSION_SECRET` (32+ chars
  enforced at load time)
- Cookie: `HttpOnly`, `SameSite=Lax`, `Secure` in production, 8-hour
  TTL, no client-side JS access
- Role pinned server-side to `PASSENGER` on registration — the API
  ignores any `role` field in the request body (no privilege escalation)
- `requireAdmin` helper gates `/api/admin/*` and returns a 403 JSON
  response for non-admins
- Database-level roles in `database/roles.sql` give the application
  the option to run with least-privilege MySQL accounts

## 9. Booking lifecycle

```
PENDING ──(payment success)──▶ CONFIRMED ──(cancel)──▶ CANCELLED
```

`POST /api/bookings` performs, in one transaction:

1. `SELECT ... FOR UPDATE` the matching `flight_fares` row
2. verify flight is `SCHEDULED`, not departed, seats available
3. `INSERT INTO bookings (... status='PENDING' ...)`
4. `INSERT INTO payments (... status='SUCCESS' ...)` — one payment row,
   enforced by `UNIQUE(booking_id)`
5. `UPDATE bookings SET booking_status='CONFIRMED'` — this fires the
   trigger which atomically bumps `sold_seats` (with a `SIGNAL` if
   inventory moved in the meantime)
6. `COMMIT` — or `ROLLBACK` on any failure

## 10. Payment and refund lifecycle

Payments transition `PENDING → SUCCESS` on booking confirmation and
`SUCCESS → REFUNDED` on cancellation. The refund is a status change
on the existing payment row — **not** a second row — matching the
spec's "one booking, one payment" invariant.

Refund policy applied in `/api/bookings/:id/cancel`:

- `fare_classes.refundable = TRUE` → 100% refund
- `fare_classes.refundable = FALSE` → 0% refund (booking still cancels)

## 11. Analytics definitions

- **Occupancy** = `100 × sold_seats / allocated_seats`; `NULLIF`
  prevents division by zero.
- **Gross revenue** = `SUM(payments.amount)` for `SUCCESS` or
  `REFUNDED` payments (so a refunded booking's gross is preserved and
  the net is the correct lower number).
- **Refunds** = `SUM(cancellations.refund_amount)`.
- **Net revenue** = gross − refunds.
- **Revenue after fuel** = net − `flights.fuel_cost`. The UI clamps
  this to zero for flights that have never earned revenue, so the
  dashboard doesn't display a misleading `-fuel_cost` for empty
  flights.

Only payments with status `SUCCESS` or `REFUNDED` contribute. Pending
and failed payments are ignored.

## 12. Admin dashboard

Server-side data: `v_flight_occupancy`, `v_revenue_by_flight`, plus a
summary query for total flights, confirmed bookings, gross revenue,
total refunds and cancellations. The dashboard:

- auto-refreshes every 10 s (`setInterval`, cleared on unmount)
- offers a manual "Refresh now" button
- shows the last-updated timestamp
- renders loading / error / empty states explicitly
- formats every currency as INR (`en-IN` locale)
- is only reachable from the nav when `user.role === 'ADMIN'`

## 13. MongoDB integration

Single cached `MongoClient` (see `src/lib/mongo.ts`) with
`maxPoolSize: 5`. The vector-search endpoint runs a `$vectorSearch`
aggregation against `route_embeddings` using the configured Atlas
index. Query payload is validated with `zod` (`vector: number[]`,
length 1–4096, each entry finite). Missing `MONGODB_URI` yields a
clean 503, never a crash.

## 14. Testing

`npm test` runs the Vitest suite:

- `tests/analytics.test.ts` — occupancy, net revenue, revenue after
  fuel (incl. zero-booking clamp), INR formatting
- `tests/validators.test.ts` — airport code, ISO date, flight search,
  register, login and booking request shapes

Integration tests requiring a live MySQL schema (full booking
workflow, inventory counting, admin authorisation) are documented in
the README; run them against a separate test database.

## 15. Security

- Parameterised SQL everywhere (`?` placeholders via `mysql2`)
- Password hashing (bcrypt, 12 rounds)
- Session cookies: HttpOnly, SameSite=Lax, Secure in production,
  signed HS256 with 32+ char secret
- Role pinned server-side on registration
- Admin routes gated by `requireAdmin`
- Uniform "Invalid email or password" message to prevent user
  enumeration on login
- Transactions + `SELECT ... FOR UPDATE` prevent overselling and
  double payments
- `UNIQUE(payments.booking_id)` and `UNIQUE(cancellations.booking_id)`
  make duplicate payments / cancellations impossible even under a
  programming error
- MongoDB payload validation prevents malformed `$vectorSearch`

## 16. Limitations

- Payments are simulated.
- Vector search requires manually populated `route_embeddings` and a
  configured Atlas Vector Search index.
- Admin flight CRUD (edit prices, mark CANCELLED) is intentionally
  left as an extension — the schema and roles already support it.
- Refund policy is binary (refundable vs non-refundable). A
  time-based policy (e.g., 50% refund within 24 hours of departure)
  is a small change to `/api/bookings/:id/cancel`.
