/* Demo users + realistic booking history.
 *
 * Everything is inserted through the normal tables so the triggers do
 * the seat counting (and write seat_inventory_log), exactly as live
 * bookings do. A seeded PRNG makes the data identical on every reset. */
import bcrypt from 'bcryptjs';
import type { Connection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';

export const DEMO_PASSENGER = {
  name: 'Ananya Rao',
  email: 'demo.passenger@aerovista.local',
  password: 'demopass1234',
  phone: '+91 98450 12345',
};
const TRAVELLER_COUNT = 360;
const TRAVELLER_DOMAIN = 'traveller.aerovista.local';

// ---------------------------------------------------------------------
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ['Aarav','Vivaan','Aditya','Vihaan','Arjun','Sai','Reyansh','Ayaan','Krishna','Ishaan',
  'Ananya','Diya','Aadhya','Saanvi','Pari','Myra','Ira','Kavya','Meera','Riya','Rohan','Kabir',
  'Nikhil','Priya','Sneha','Rahul','Neha','Varun','Pooja','Karthik','Lakshmi','Farhan','Zoya',
  'Harpreet','Simran','Deepak','Anjali','Manish','Shreya','Tanvi'];
const LAST = ['Sharma','Iyer','Reddy','Nair','Menon','Gupta','Patel','Rao','Das','Banerjee','Singh',
  'Kulkarni','Joshi','Mehta','Chatterjee','Pillai','Khan','Verma','Bhat','Shetty','Agarwal','Mishra',
  'Kapoor','Desai','Hegde','Mukherjee','Naidu','Ghosh','Saxena','Fernandes'];

const pad = (n: number) => String(n).padStart(2, '0');
export function toSqlDateTime(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function parseSqlDateTime(s: string | Date): Date {
  if (s instanceof Date) return s;
  const [d, t] = s.split(' ');
  const [y, m, day] = d.split('-').map(Number);
  const [hh, mm, ss] = (t ?? '00:00:00').split(':').map(Number);
  return new Date(y, m - 1, day, hh, mm, ss || 0);
}

// ---------------------------------------------------------------------
export async function ensureAdmin(conn: Connection, email: string, password: string) {
  if (!password || password.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters (set it in .env.local)');
  }
  const hash = await bcrypt.hash(password, 12);
  await conn.execute(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ('Revenue Admin', ?, ?, 'ADMIN')
     ON DUPLICATE KEY UPDATE role = 'ADMIN', password_hash = VALUES(password_hash)`,
    [email.toLowerCase(), hash]
  );
  console.log(`  ✓ admin account ready: ${email.toLowerCase()}`);
}

export async function ensureDemoUsers(conn: Connection): Promise<{ demoUserId: number; travellerIds: number[] }> {
  const hash = await bcrypt.hash(DEMO_PASSENGER.password, 10);

  await conn.execute(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES (?, ?, ?, ?, 'PASSENGER')
     ON DUPLICATE KEY UPDATE name = VALUES(name), phone = VALUES(phone), password_hash = VALUES(password_hash)`,
    [DEMO_PASSENGER.name, DEMO_PASSENGER.email, DEMO_PASSENGER.phone, hash]
  );

  const rand = mulberry32(7);
  const rows: unknown[][] = [];
  for (let i = 1; i <= TRAVELLER_COUNT; i++) {
    const name = `${FIRST[Math.floor(rand() * FIRST.length)]} ${LAST[Math.floor(rand() * LAST.length)]}`;
    rows.push([name, `traveller${String(i).padStart(3, '0')}@${TRAVELLER_DOMAIN}`, hash]);
  }
  await conn.query(
    `INSERT IGNORE INTO users (name, email, password_hash, role) VALUES ${rows.map(() => "(?, ?, ?, 'PASSENGER')").join(',')}`,
    rows.flat()
  );
  await conn.query(
    `INSERT IGNORE INTO passengers (user_id)
     SELECT user_id FROM users WHERE role = 'PASSENGER'`
  );

  const [[demo]] = await conn.query<RowDataPacket[]>('SELECT user_id FROM users WHERE email = ?', [DEMO_PASSENGER.email]);
  const [trs] = await conn.query<RowDataPacket[]>(
    'SELECT user_id FROM users WHERE email LIKE ? ORDER BY user_id', [`%@${TRAVELLER_DOMAIN}`]
  );
  console.log(`  ✓ demo passenger ${DEMO_PASSENGER.email} / ${DEMO_PASSENGER.password} + ${trs.length} synthetic travellers`);
  return { demoUserId: Number(demo.user_id), travellerIds: trs.map((r) => Number(r.user_id)) };
}

// ---------------------------------------------------------------------
type FareRow = {
  flight_fare_id: number; flight_id: number; flight_number: string; departure_time: string;
  status: string; class_code: string; current_fare: string; allocated_seats: number; sold_seats: number;
  refund_pct: string; late_refund_pct: string; origin: string; destination: string;
};

type PlannedBooking = {
  ref: string; userId: number; fare: FareRow; bookedAt: Date; payType: string;
  cancelAt?: Date;
};

export async function hasHistory(conn: Connection): Promise<boolean> {
  const [[r]] = await conn.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM bookings b JOIN users u ON u.user_id = b.user_id WHERE u.email LIKE ?`,
    [`%@${TRAVELLER_DOMAIN}`]
  );
  return Number(r.n) > 0;
}

export async function generateHistory(conn: Connection, demoUserId: number, travellerIds: number[]) {
  const rand = mulberry32(2026);
  const now = new Date();
  const usedRefs = new Set<string>();
  const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const newRef = () => {
    for (;;) {
      let r = 'AV';
      for (let i = 0; i < 8; i++) r += ALPH[Math.floor(rand() * ALPH.length)];
      if (!usedRefs.has(r)) { usedRefs.add(r); return r; }
    }
  };
  const payTypes = ['UPI', 'UPI', 'UPI', 'CARD', 'CARD', 'NETBANKING'];

  const [fares] = await conn.query<RowDataPacket[]>(
    `SELECT ff.flight_fare_id, ff.flight_id, f.flight_number, f.departure_time, f.status,
            fc.class_code, ff.current_fare, ff.allocated_seats, ff.sold_seats,
            fc.refund_pct, fc.late_refund_pct, o.airport_code AS origin, d.airport_code AS destination
       FROM flight_fares ff
       JOIN flights f       ON f.flight_id = ff.flight_id
       JOIN fare_classes fc ON fc.fare_class_id = ff.fare_class_id
       JOIN routes r        ON r.route_id = f.route_id
       JOIN airports o      ON o.airport_id = r.origin_airport_id
       JOIN airports d      ON d.airport_id = r.destination_airport_id
      WHERE f.status <> 'CANCELLED'
      ORDER BY f.departure_time, ff.flight_fare_id`
  );

  const planned: PlannedBooking[] = [];
  const dayMs = 86400000;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (const raw of fares as FareRow[]) {
    const dep = parseSqlDateTime(raw.departure_time);
    const daysAhead = Math.floor((dep.getTime() - startOfToday.getTime()) / dayMs);
    const free = raw.allocated_seats - raw.sold_seats;
    if (free <= 0) continue;

    // target load factor for this fare
    let load: number;
    if (dep.getTime() < now.getTime()) {
      load = 0.6 + rand() * 0.33;                               // flown: 60–93 %
    } else {
      load = Math.max(0.06, 0.62 - daysAhead * 0.045) + rand() * 0.12;  // fills up as departure nears
    }
    if (raw.class_code === 'FLEX') load *= 0.85;
    if (raw.class_code === 'BUS') load *= 0.8;

    let seats = Math.min(free, Math.round(raw.allocated_seats * load));

    // Showcase inventory states for the live demo (tomorrow):
    let showcase = false;
    if (daysAhead === 1 && raw.flight_number === 'AV101' && raw.class_code === 'BUS') { seats = free; showcase = true; }      // sold out
    if (daysAhead === 1 && raw.flight_number === 'AV701' && raw.class_code === 'ECO') { seats = free - 2; showcase = true; }  // last 2 seats
    if (seats <= 0) continue;

    for (let s = 0; s < seats; s++) {
      const leadDays = 1 + rand() * 24;
      let bookedAt = new Date(dep.getTime() - leadDays * dayMs - rand() * 6 * 3600000);
      const latest = new Date(Math.min(now.getTime() - 3600000, dep.getTime() - 3 * 3600000));
      if (bookedAt > latest) bookedAt = new Date(latest.getTime() - rand() * 2 * dayMs);
      const b: PlannedBooking = {
        ref: newRef(),
        userId: travellerIds[Math.floor(rand() * travellerIds.length)],
        fare: raw,
        bookedAt,
        payType: payTypes[Math.floor(rand() * payTypes.length)],
      };
      // ~7 % of bookings were later cancelled (more often on refundable fares)
      const cancelP = raw.class_code === 'ECO' ? 0.045 : 0.11;
      if (!showcase && rand() < cancelP) {
        const window = Math.min(dep.getTime(), now.getTime()) - bookedAt.getTime();
        if (window > 2 * 3600000) b.cancelAt = new Date(bookedAt.getTime() + rand() * (window - 3600000));
      }
      planned.push(b);
    }
  }

  // ---- demo passenger's own trips (used in the live walkthrough) -----
  const pick = (fno: string, cls: string, dayOffset: number) =>
    (fares as FareRow[]).find((f) => {
      const dep = parseSqlDateTime(f.departure_time);
      const d = Math.floor((dep.getTime() - startOfToday.getTime()) / dayMs);
      return f.flight_number === fno && f.class_code === cls && d === dayOffset;
    });
  const mine: Array<[FareRow | undefined, number, boolean]> = [
    [pick('AV201', 'FLEX', 4), 6, false],   // upcoming, refundable -> cancel in demo
    [pick('AV801', 'ECO', 9), 3, false],    // upcoming, non-refundable
    [pick('AV301', 'ECO', -4), 12, false],  // completed trip
    [pick('AV102', 'FLEX', -2), 15, true],  // cancelled earlier with refund
  ];
  for (const [fare, leadDays, cancelled] of mine) {
    if (!fare) continue;
    const dep = parseSqlDateTime(fare.departure_time);
    const bookedAt = new Date(Math.min(dep.getTime() - leadDays * dayMs, now.getTime() - 3600000));
    planned.push({
      ref: newRef(), userId: demoUserId, fare, bookedAt, payType: 'UPI',
      cancelAt: cancelled ? new Date(bookedAt.getTime() + 2 * dayMs) : undefined,
    });
  }

  // ---- insert bookings (CONFIRMED -> insert trigger sells the seat) ---
  const BATCH = 800;
  const idByRef = new Map<string, number>();
  for (let i = 0; i < planned.length; i += BATCH) {
    const chunk = planned.slice(i, i + BATCH);
    const vals: unknown[] = [];
    for (const b of chunk) {
      vals.push(b.userId, b.fare.flight_id, b.fare.flight_fare_id, b.ref, b.fare.current_fare, toSqlDateTime(b.bookedAt));
    }
    await conn.query(
      `INSERT INTO bookings (user_id, flight_id, flight_fare_id, booking_reference, booking_status, total_amount, booked_at)
       VALUES ${chunk.map(() => "(?, ?, ?, ?, 'CONFIRMED', ?, ?)").join(',')}`,
      vals
    );
    const [ids] = await conn.query<RowDataPacket[]>(
      'SELECT booking_id, booking_reference FROM bookings WHERE booking_reference IN (?)',
      [chunk.map((b) => b.ref)]
    );
    for (const r of ids) idByRef.set(r.booking_reference, Number(r.booking_id));

    const pvals: unknown[] = [];
    for (const b of chunk) {
      pvals.push(idByRef.get(b.ref), b.fare.current_fare, b.payType, 'SIM-' + b.ref, toSqlDateTime(b.bookedAt));
    }
    await conn.query(
      `INSERT INTO payments (booking_id, amount, payment_type, payment_status, transaction_reference, paid_at)
       VALUES ${chunk.map(() => "(?, ?, ?, 'SUCCESS', ?, ?)").join(',')}`,
      pvals
    );
  }

  // ---- historical cancellations, refund computed with the class policy
  const cancels = planned.filter((b) => b.cancelAt);
  for (let i = 0; i < cancels.length; i += BATCH) {
    const chunk = cancels.slice(i, i + BATCH);
    const vals: unknown[] = [];
    const full: number[] = [];
    const partial: number[] = [];
    for (const b of chunk) {
      const dep = parseSqlDateTime(b.fare.departure_time);
      const early = dep.getTime() - b.cancelAt!.getTime() >= dayMs;
      const pct = Number(early ? b.fare.refund_pct : b.fare.late_refund_pct);
      const paid = Number(b.fare.current_fare);
      const refund = Math.round(paid * pct) / 100;
      const id = idByRef.get(b.ref)!;
      vals.push(id, refund, toSqlDateTime(b.cancelAt!), b.userId,
        `${b.fare.class_code} (${early ? '24h+ before departure' : 'under 24h'}): ${pct}% refund`);
      if (refund >= paid && refund > 0) full.push(id); else if (refund > 0) partial.push(id);
    }
    await conn.query(
      `INSERT INTO cancellations (booking_id, refund_amount, cancellation_date, cancelled_by, reason, cancellation_type, refund_policy)
       VALUES ${chunk.map(() => "(?, ?, ?, ?, 'Change of travel plans', 'PASSENGER', ?)").join(',')}`,
      vals
    );
    if (full.length) await conn.query(`UPDATE payments SET payment_status = 'REFUNDED' WHERE booking_id IN (?)`, [full]);
    if (partial.length) await conn.query(`UPDATE payments SET payment_status = 'PARTIALLY_REFUNDED' WHERE booking_id IN (?)`, [partial]);
    // CONFIRMED -> CANCELLED: the update trigger releases each seat
    await conn.query(
      `UPDATE bookings SET booking_status = 'CANCELLED' WHERE booking_id IN (?)`,
      [chunk.map((b) => idByRef.get(b.ref))]
    );
  }

  // ---- loyalty points from active bookings ---------------------------
  await conn.query(
    `UPDATE passengers p
       JOIN (SELECT user_id, FLOOR(SUM(total_amount) / 100) AS pts
               FROM bookings WHERE booking_status IN ('CONFIRMED','COMPLETED') GROUP BY user_id) x
         ON x.user_id = p.user_id
        SET p.loyalty_points = x.pts,
            p.loyalty_tier = CASE WHEN x.pts >= 5000 THEN 'PLATINUM' WHEN x.pts >= 2500 THEN 'GOLD'
                                  WHEN x.pts >= 1000 THEN 'SILVER' ELSE 'STANDARD' END`
  );
  await conn.query('CALL sp_complete_departed_flights()');

  console.log(`  ✓ booking history: ${planned.length} bookings, ${cancels.length} cancellations`);
}

export async function wipeTransactions(conn: Connection) {
  await conn.query('DELETE FROM seat_inventory_log');
  await conn.query('DELETE FROM cancellations');
  await conn.query('DELETE FROM payments');
  await conn.query('DELETE FROM bookings');
  await conn.query('DELETE FROM flights');   // flight_fares cascade
  await conn.query(`UPDATE passengers SET loyalty_points = 0, loyalty_tier = 'STANDARD'`);
  const [r] = await conn.query<ResultSetHeader>('SELECT 1');
  void r;
}
