import { describe, expect, it } from 'vitest';
import { terminText, erkenneTermin } from './index.ts';

describe('calendar edges for a recognized date', () => {
  it('steps across a month and a year in Berlin', () => {
    const januar = new Date('2026-01-31T22:00:00.000Z');
    const silvester = new Date('2026-12-31T22:00:00.000Z');
    const schalt = new Date('2024-03-01T10:00:00.000Z');
    const maerz = new Date('2026-03-01T10:00:00.000Z');
    expect(erkenneTermin('tomorrow', januar)).toEqual({ datum: '2026-02-01', uhrzeit: null });
    expect(erkenneTermin('morgen', januar)).toEqual({ datum: '2026-02-01', uhrzeit: null });
    expect(erkenneTermin('tomorrow', silvester)).toEqual({ datum: '2027-01-01', uhrzeit: null });
    expect(erkenneTermin('gestern', schalt)).toEqual({ datum: '2024-02-29', uhrzeit: null });
    expect(erkenneTermin('yesterday', schalt)).toEqual({ datum: '2024-02-29', uhrzeit: null });
    expect(erkenneTermin('gestern', maerz)).toEqual({ datum: '2026-02-28', uhrzeit: null });
    expect(erkenneTermin('29.02.', new Date('2024-01-15T10:00:00.000Z'))).toEqual({ datum: '2024-02-29', uhrzeit: null });
    expect(erkenneTermin('29.02.2024', maerz)).toEqual({ datum: '2024-02-29', uhrzeit: null });
    expect(erkenneTermin('29.02.', maerz)).toBeNull();
    expect(erkenneTermin('29.02.', new Date('2024-03-02T10:00:00.000Z'))).toBeNull();
    expect(erkenneTermin('29.02.', new Date('2023-12-01T10:00:00.000Z'))).toEqual({ datum: '2024-02-29', uhrzeit: null });
  });

  it('rolls a past date without a year forward and keeps an explicit year', () => {
    const nach = new Date('2026-11-04T10:00:00.000Z');
    const amTag = new Date('2026-11-03T10:00:00.000Z');
    const davor = new Date('2026-11-02T10:00:00.000Z');
    const dezember = new Date('2026-12-15T10:00:00.000Z');
    expect(erkenneTermin('03.11.', nach)).toEqual({ datum: '2027-11-03', uhrzeit: null });
    expect(erkenneTermin('03.11.', amTag)).toEqual({ datum: '2026-11-03', uhrzeit: null });
    expect(erkenneTermin('03.11.', davor)).toEqual({ datum: '2026-11-03', uhrzeit: null });
    expect(erkenneTermin('3.11.2025', nach)).toEqual({ datum: '2025-11-03', uhrzeit: null });
    expect(erkenneTermin('3.11.2026', nach)).toEqual({ datum: '2026-11-03', uhrzeit: null });
    expect(erkenneTermin('01.11.', davor)).toEqual({ datum: '2027-11-01', uhrzeit: null });
    expect(erkenneTermin('31.12.', davor)).toEqual({ datum: '2026-12-31', uhrzeit: null });
    expect(erkenneTermin('03.01.', dezember)).toEqual({ datum: '2027-01-03', uhrzeit: null });
    expect(erkenneTermin('31.01.', new Date('2026-02-01T10:00:00.000Z'))).toEqual({ datum: '2027-01-31', uhrzeit: null });
    expect(erkenneTermin('01.02.', new Date('2026-01-31T10:00:00.000Z'))).toEqual({ datum: '2026-02-01', uhrzeit: null });
  });

  it('uses the Berlin calendar day when the clocks change', () => {
    const fruehling = new Date('2026-03-28T22:00:00.000Z');
    expect(erkenneTermin('tomorrow 3pm', fruehling)).toEqual({ datum: '2026-03-29', uhrzeit: '15:00' });
    const plus24 = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Berlin',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(fruehling.getTime() + 24 * 60 * 60 * 1000));
    expect(plus24).toBe('30/03/2026');

    const herbst = new Date('2026-10-24T22:30:00.000Z');
    expect(erkenneTermin('tomorrow 3pm', herbst)).toEqual({ datum: '2026-10-26', uhrzeit: '15:00' });
    expect(erkenneTermin('heute', new Date('2026-10-25T00:30:00.000Z'))).toEqual({ datum: '2026-10-25', uhrzeit: null });
    expect(erkenneTermin('today 15:00', new Date('2026-10-25T01:30:00.000Z'))).toEqual({ datum: '2026-10-25', uhrzeit: '15:00' });
  });

  it('reads today from the Berlin date, including across midnight UTC', () => {
    expect(erkenneTermin('heute', new Date('2026-11-01T23:30:00.000Z'))).toEqual({ datum: '2026-11-02', uhrzeit: null });
    expect(erkenneTermin('today', new Date('2026-11-01T22:30:00.000Z'))).toEqual({ datum: '2026-11-01', uhrzeit: null });
    expect(erkenneTermin('15:30', new Date('2026-11-01T23:30:00.000Z'))).toEqual({ datum: '2026-11-02', uhrzeit: '15:30' });
    const sonntag = new Date('2026-11-01T10:00:00.000Z');
    expect(erkenneTermin('next Monday', sonntag)).toEqual({ datum: '2026-11-02', uhrzeit: null });
    expect(erkenneTermin('Montag', sonntag)).toEqual({ datum: '2026-11-02', uhrzeit: null });
    expect(erkenneTermin('Sonntag', sonntag)).toEqual({ datum: '2026-11-01', uhrzeit: null });
  });

  it('formats the appointment like the other quiet dates', () => {
    const heute = new Date('2026-06-01T12:00:00.000Z');
    expect(terminText({ datum: '2026-11-03', uhrzeit: '15:00' }, heute)).toBe('3 Nov · 15:00');
    expect(terminText({ datum: '2026-03-09', uhrzeit: '09:05' }, heute)).toBe('9 Mar · 09:05');
    expect(terminText({ datum: '2026-11-03', uhrzeit: null }, heute)).toBe('3 Nov');
    expect(terminText({ datum: '2027-01-02', uhrzeit: null }, heute)).toBe('2 Jan 2027');
    expect(terminText({ datum: '2025-11-03', uhrzeit: '15:00' }, heute)).toBe('3 Nov 2025 · 15:00');
  });
});
