/* Shared flight query + grouping (one card per flight, fares nested). */

export const FLIGHT_SELECT = `
  SELECT f.flight_id, f.flight_number, f.departure_time, f.arrival_time, f.status,
         TIMESTAMPDIFF(MINUTE, f.departure_time, f.arrival_time) AS duration_min,
         o.airport_code AS origin_code, o.city AS origin_city, o.airport_name AS origin_airport,
         d.airport_code AS destination_code, d.city AS destination_city, d.airport_name AS destination_airport,
         ac.model AS aircraft_model,
         ff.flight_fare_id, ff.current_fare, ff.allocated_seats, ff.sold_seats,
         (ff.allocated_seats - ff.sold_seats) AS seats_left,
         fc.class_code, fc.class_name, fc.refundable, fc.refund_pct, fc.late_refund_pct,
         fc.cabin_baggage_kg, fc.checkin_baggage_kg, fc.meal_included, fc.priority_boarding
    FROM flights f
    JOIN routes r         ON r.route_id = f.route_id
    JOIN airports o       ON o.airport_id = r.origin_airport_id
    JOIN airports d       ON d.airport_id = r.destination_airport_id
    JOIN aircraft ac      ON ac.aircraft_id = f.aircraft_id
    JOIN flight_fares ff  ON ff.flight_id = f.flight_id
    JOIN fare_classes fc  ON fc.fare_class_id = ff.fare_class_id`;

export type FareOption = {
  flight_fare_id: number;
  class_code: string;
  class_name: string;
  price: number;
  seats_left: number;
  allocated_seats: number;
  sold_out: boolean;
  refundable: boolean;
  refund_pct: number;
  late_refund_pct: number;
  cabin_baggage_kg: number;
  checkin_baggage_kg: number;
  meal_included: boolean;
  priority_boarding: boolean;
};

export type FlightResult = {
  flight_id: number;
  flight_number: string;
  departure_time: string;
  arrival_time: string;
  status: string;
  duration_min: number;
  aircraft_model: string;
  origin: { code: string; city: string; airport: string };
  destination: { code: string; city: string; airport: string };
  fares: FareOption[];
  lowest_fare: number | null;
  seats_left: number;
};

export function groupFlightRows(rows: any[]): FlightResult[] {
  const map = new Map<number, FlightResult>();
  for (const r of rows) {
    let f = map.get(r.flight_id);
    if (!f) {
      f = {
        flight_id: r.flight_id,
        flight_number: r.flight_number,
        departure_time: r.departure_time,
        arrival_time: r.arrival_time,
        status: r.status,
        duration_min: Number(r.duration_min),
        aircraft_model: r.aircraft_model,
        origin: { code: r.origin_code, city: r.origin_city, airport: r.origin_airport },
        destination: { code: r.destination_code, city: r.destination_city, airport: r.destination_airport },
        fares: [],
        lowest_fare: null,
        seats_left: 0,
      };
      map.set(r.flight_id, f);
    }
    const seatsLeft = Math.max(0, Number(r.seats_left));
    f.fares.push({
      flight_fare_id: r.flight_fare_id,
      class_code: r.class_code,
      class_name: r.class_name,
      price: Number(r.current_fare),
      seats_left: seatsLeft,
      allocated_seats: Number(r.allocated_seats),
      sold_out: seatsLeft <= 0,
      refundable: !!r.refundable,
      refund_pct: Number(r.refund_pct),
      late_refund_pct: Number(r.late_refund_pct),
      cabin_baggage_kg: Number(r.cabin_baggage_kg),
      checkin_baggage_kg: Number(r.checkin_baggage_kg),
      meal_included: !!r.meal_included,
      priority_boarding: !!r.priority_boarding,
    });
    f.seats_left += seatsLeft;
    if (seatsLeft > 0 && (f.lowest_fare === null || Number(r.current_fare) < f.lowest_fare)) {
      f.lowest_fare = Number(r.current_fare);
    }
  }
  return [...map.values()];
}
