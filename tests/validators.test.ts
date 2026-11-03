import { describe, it, expect } from 'vitest';
import {
  AirportCode,
  IsoDate,
  FlightSearchQuery,
  RegisterInput,
  LoginInput,
  BookingInput,
} from '../src/lib/validators';

describe('AirportCode', () => {
  it('accepts a 3-letter code', () => {
    expect(AirportCode.parse('BLR')).toBe('BLR');
  });

  it('uppercases and trims', () => {
    expect(AirportCode.parse('  blr  ')).toBe('BLR');
  });

  it('rejects wrong length', () => {
    expect(() => AirportCode.parse('BL')).toThrow();
    expect(() => AirportCode.parse('BLRX')).toThrow();
  });

  it('rejects non-letters', () => {
    expect(() => AirportCode.parse('BL1')).toThrow();
  });
});

describe('IsoDate', () => {
  it('accepts valid date', () => {
    expect(IsoDate.parse('2026-12-25')).toBe('2026-12-25');
  });

  it('rejects malformed string', () => {
    expect(() => IsoDate.parse('25-12-2026')).toThrow();
  });

  it('rejects impossible calendar date', () => {
    expect(() => IsoDate.parse('2026-02-30')).toThrow();
  });
});

describe('FlightSearchQuery', () => {
  it('all fields optional, empty strings treated as undefined', () => {
    const parsed = FlightSearchQuery.parse({ origin: '', destination: '', date: '' });
    expect(parsed.origin).toBeUndefined();
    expect(parsed.destination).toBeUndefined();
    expect(parsed.date).toBeUndefined();
  });

  it('parses valid filters', () => {
    const parsed = FlightSearchQuery.parse({ origin: 'blr', destination: 'DEL', date: '2026-12-25' });
    expect(parsed).toEqual({ origin: 'BLR', destination: 'DEL', date: '2026-12-25' });
  });
});

describe('RegisterInput', () => {
  it('requires an 8-character password', () => {
    expect(() =>
      RegisterInput.parse({ name: 'A B', email: 'a@b.com', password: 'short' })
    ).toThrow();
  });

  it('normalises email', () => {
    const p = RegisterInput.parse({ name: 'Nikita', email: '  N@PES.EDU  ', password: 'abcd1234' });
    expect(p.email).toBe('n@pes.edu');
  });
});

describe('LoginInput', () => {
  it('rejects missing password', () => {
    expect(() => LoginInput.parse({ email: 'a@b.com', password: '' })).toThrow();
  });
});

describe('BookingInput', () => {
  it('coerces numeric strings', () => {
    expect(BookingInput.parse({ flightId: '12', flightFareId: '7' })).toEqual({
      flightId: 12,
      flightFareId: 7,
      paymentType: 'UPI',
    });
  });

  it('rejects negatives', () => {
    expect(() => BookingInput.parse({ flightId: -1, flightFareId: 1 })).toThrow();
  });
});

describe('v2 validation rules', () => {
  it('rejects identical origin and destination', () => {
    expect(FlightSearchQuery.safeParse({ origin: 'BLR', destination: 'blr', date: '' }).success).toBe(false);
  });
  it('requires a letter and a digit in passwords', () => {
    expect(RegisterInput.safeParse({ name: 'Ana Rao', email: 'a@b.com', password: 'abcdefgh' }).success).toBe(false);
    expect(RegisterInput.safeParse({ name: 'Ana Rao', email: 'a@b.com', password: 'abcd1234' }).success).toBe(true);
  });
  it('rejects unknown payment types', () => {
    expect(BookingInput.safeParse({ flightId: 1, flightFareId: 2, paymentType: 'CASH' }).success).toBe(false);
  });
});
