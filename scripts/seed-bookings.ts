/* eslint-disable no-console */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

/**
 * Optional: seeds a demo passenger and a handful of CONFIRMED bookings
 * so the admin dashboard shows non-zero occupancy and revenue right
 * after `npm run db:seed`.
 *
 * Idempotent: re-running does not create duplicate demo bookings
 * because each run tags its bookings with a stable reference prefix
 * and skips fares that already have a demo booking.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Set DATABASE_URL before seeding');

  const db = await mysql.createConnection(url);
  try {
    // 1. Demo passenger
    const demoEmail = 'demo.passenger@aerovista.local';
    const demoPass = await bcrypt.hash('demopass1234', 12);
    await db.execute(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ('Demo Passenger', ?, ?, 'PASSENGER')
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
      [demoEmail, demoPass]
    );
    const [uRows] = await db.execute(
      'SELECT user_id FROM users WHERE email = ?',
      [demoEmail]
    );
    const userId = (uRows as any[])[0].user_id;
    await db.execute(
      `INSERT IGNORE INTO passengers (user_id) VALUES (?)`,
      [userId]
    );

    // 2. Up to 6 confirmed bookings across different fares
    const [fRows] = await db.execute(
      `SELECT ff.flight_fare_id, ff.flight_id, ff.current_fare
         FROM flight_fares ff
         JOIN flights f ON f.flight_id = ff.flight_id
        WHERE f.status = 'SCHEDULED' AND f.departure_time > NOW()
          AND ff.sold_seats < ff.allocated_seats
        ORDER BY f.departure_time, ff.current_fare
        LIMIT 6`
    );
    const fares = fRows as any[];

    let made = 0;
    for (const fare of fares) {
      const ref = 'DEMO' + String(fare.flight_fare_id).padStart(6, '0');

      // Skip if a demo booking for this fare already exists
      const [dupRows] = await db.execute(
        'SELECT 1 FROM bookings WHERE booking_reference = ?',
        [ref]
      );
      if ((dupRows as any[]).length) continue;

      await db.beginTransaction();
      try {
        const [b] = await db.execute(
          `INSERT INTO bookings
             (user_id, flight_id, flight_fare_id, booking_reference, booking_status, total_amount)
           VALUES (?, ?, ?, ?, 'PENDING', ?)`,
          [userId, fare.flight_id, fare.flight_fare_id, ref, fare.current_fare]
        );
        const bookingId = (b as { insertId: number }).insertId;

        await db.execute(
          `INSERT INTO payments
             (booking_id, amount, payment_type, payment_status, transaction_reference, paid_at)
           VALUES (?, ?, 'DEMO', 'SUCCESS', ?, NOW())`,
          [bookingId, fare.current_fare, 'TXN-' + ref]
        );

        await db.execute(
          `UPDATE bookings SET booking_status = 'CONFIRMED' WHERE booking_id = ?`,
          [bookingId]
        );
        await db.commit();
        made++;
      } catch (e) {
        await db.rollback();
        console.error('Skipped fare', fare.flight_fare_id, e);
      }
    }

    console.log(
      `Demo passenger: ${demoEmail} / demopass1234`
    );
    console.log(`Created ${made} demo bookings.`);
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
