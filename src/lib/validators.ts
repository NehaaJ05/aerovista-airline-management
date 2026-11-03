import { z } from 'zod';

/** Airport IATA code: three uppercase letters. */
export const AirportCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Airport code must be 3 letters');

/** YYYY-MM-DD, additionally validated to be a real calendar date. */
export const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(s + 'T00:00:00Z');
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Date is not a real calendar date');

const emptyToUndef = z.literal('').transform(() => undefined);

export const FlightSearchQuery = z
  .object({
    origin: AirportCode.optional().or(emptyToUndef),
    destination: AirportCode.optional().or(emptyToUndef),
    date: IsoDate.optional().or(emptyToUndef),
  })
  .refine((q) => !q.origin || !q.destination || q.origin !== q.destination, {
    message: 'Origin and destination must be different',
  });

export const RegisterInput = z.object({
  name: z.string().trim().min(2, 'Please enter your full name').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(200)
    .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Password must contain a letter and a number'),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[+\d][\d\s-]{6,}$/, 'Enter a valid phone number')
    .optional()
    .or(emptyToUndef),
});

export const LoginInput = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const PaymentType = z.enum(['UPI', 'CARD', 'NETBANKING']);

export const BookingInput = z.object({
  flightId: z.coerce.number().int().positive(),
  flightFareId: z.coerce.number().int().positive(),
  paymentType: PaymentType.default('UPI'),
});

export const CancelInput = z.object({
  reason: z.string().trim().max(255).optional(),
});

export const ProfileUpdate = z.object({
  name: z.string().trim().min(2, 'Please enter your full name').max(120),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[+\d][\d\s-]{6,}$/, 'Enter a valid phone number')
    .optional()
    .or(emptyToUndef),
});

export const AdminFlightUpdate = z
  .object({
    status: z.enum(['SCHEDULED', 'DELAYED']).optional(),
    fuelCost: z.coerce.number().min(0).max(10_000_000).optional(),
  })
  .refine((v) => v.status !== undefined || v.fuelCost !== undefined, 'Nothing to update');

export const AdminFareUpdate = z
  .object({
    currentFare: z.coerce.number().min(500, 'Fare must be at least ₹500').max(500_000).optional(),
    allocatedSeats: z.coerce.number().int().min(0).max(1000).optional(),
  })
  .refine((v) => v.currentFare !== undefined || v.allocatedSeats !== undefined, 'Nothing to update');

export const GuideInput = z.object({
  airport_code: AirportCode,
  city: z.string().trim().min(2).max(80),
  title: z.string().trim().min(4).max(120),
  summary: z.string().trim().min(20, 'Summary should be at least 20 characters').max(1200),
  highlights: z.array(z.string().trim().min(2).max(120)).max(8).default([]),
  best_time: z.string().trim().max(80).optional().default(''),
  tags: z.array(z.string().trim().toLowerCase().min(2).max(30)).max(10).default([]),
});
