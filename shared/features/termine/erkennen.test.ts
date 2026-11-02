import { describe, expect, it } from 'vitest';
import { erkenneTermin } from './index.ts';

const MONTAG = new Date('2026-11-02T10:00:00.000Z');

function termin(text: string, bezug = MONTAG) {
  return erkenneTermin(text, bezug);
}

describe('date and time in a note', () => {
  it('reads the English and German examples', () => {
    expect(termin('tomorrow 3pm')).toEqual({ datum: '2026-11-03', uhrzeit: '15:00' });
    expect(termin('tomorrow at 3 pm')).toEqual({ datum: '2026-11-03', uhrzeit: '15:00' });
    expect(termin('tomorrow at 3:30pm')).toEqual({ datum: '2026-11-03', uhrzeit: '15:30' });
    expect(termin('TOMORROW 3PM')).toEqual({ datum: '2026-11-03', uhrzeit: '15:00' });
    expect(termin('morgen 15 Uhr')).toEqual({ datum: '2026-11-03', uhrzeit: '15:00' });
    expect(termin('morgen um 15:30 Uhr')).toEqual({ datum: '2026-11-03', uhrzeit: '15:30' });
    expect(termin('MORGEN 15 UHR')).toEqual({ datum: '2026-11-03', uhrzeit: '15:00' });
    expect(termin('nächsten Montag')).toEqual({ datum: '2026-11-09', uhrzeit: null });
    expect(termin('naechsten Montag')).toEqual({ datum: '2026-11-09', uhrzeit: null });
    expect(termin('nächster Dienstag')).toEqual({ datum: '2026-11-03', uhrzeit: null });
    expect(termin('next Monday')).toEqual({ datum: '2026-11-09', uhrzeit: null });
    expect(termin('next Monday at 15:30')).toEqual({ datum: '2026-11-09', uhrzeit: '15:30' });
    expect(termin('nächsten Montag um 15 Uhr')).toEqual({ datum: '2026-11-09', uhrzeit: '15:00' });
    expect(termin('03.11.')).toEqual({ datum: '2026-11-03', uhrzeit: null });
    expect(termin('3.11.2026')).toEqual({ datum: '2026-11-03', uhrzeit: null });
    expect(termin('3.11.2026 15:30')).toEqual({ datum: '2026-11-03', uhrzeit: '15:30' });
    expect(termin('03.11. 15:30')).toEqual({ datum: '2026-11-03', uhrzeit: '15:30' });
    expect(termin('today')).toEqual({ datum: '2026-11-02', uhrzeit: null });
    expect(termin('heute')).toEqual({ datum: '2026-11-02', uhrzeit: null });
    expect(termin('heute 15:30')).toEqual({ datum: '2026-11-02', uhrzeit: '15:30' });
    expect(termin('today at 3pm')).toEqual({ datum: '2026-11-02', uhrzeit: '15:00' });
  });

  it('reads weekdays and a clock time on the day the note was written', () => {
    expect(termin('Monday')).toEqual({ datum: '2026-11-02', uhrzeit: null });
    expect(termin('Montag')).toEqual({ datum: '2026-11-02', uhrzeit: null });
    expect(termin('Tuesday')).toEqual({ datum: '2026-11-03', uhrzeit: null });
    expect(termin('Mittwoch')).toEqual({ datum: '2026-11-04', uhrzeit: null });
    expect(termin('Thursday')).toEqual({ datum: '2026-11-05', uhrzeit: null });
    expect(termin('Freitag')).toEqual({ datum: '2026-11-06', uhrzeit: null });
    expect(termin('Saturday')).toEqual({ datum: '2026-11-07', uhrzeit: null });
    expect(termin('Sonnabend')).toEqual({ datum: '2026-11-07', uhrzeit: null });
    expect(termin('Sunday')).toEqual({ datum: '2026-11-08', uhrzeit: null });
    expect(termin('am Montag')).toEqual({ datum: '2026-11-02', uhrzeit: null });
    expect(termin('on Friday at 3pm')).toEqual({ datum: '2026-11-06', uhrzeit: '15:00' });
    expect(termin('15:30')).toEqual({ datum: '2026-11-02', uhrzeit: '15:30' });
    expect(termin('3pm')).toEqual({ datum: '2026-11-02', uhrzeit: '15:00' });
    expect(termin('3 pm')).toEqual({ datum: '2026-11-02', uhrzeit: '15:00' });
    expect(termin('3:05 pm')).toEqual({ datum: '2026-11-02', uhrzeit: '15:05' });
    expect(termin('3 p.m.')).toEqual({ datum: '2026-11-02', uhrzeit: '15:00' });
    expect(termin('12pm')).toEqual({ datum: '2026-11-02', uhrzeit: '12:00' });
    expect(termin('12am')).toEqual({ datum: '2026-11-02', uhrzeit: '00:00' });
    expect(termin('15 Uhr')).toEqual({ datum: '2026-11-02', uhrzeit: '15:00' });
    expect(termin('0 Uhr')).toEqual({ datum: '2026-11-02', uhrzeit: '00:00' });
    expect(termin('00:05')).toEqual({ datum: '2026-11-02', uhrzeit: '00:05' });
    expect(termin('3pm tomorrow')).toEqual({ datum: '2026-11-03', uhrzeit: '15:00' });
  });

  it('reads a month name and an ISO date', () => {
    expect(termin('3 November')).toEqual({ datum: '2026-11-03', uhrzeit: null });
    expect(termin('3. November 2026')).toEqual({ datum: '2026-11-03', uhrzeit: null });
    expect(termin('November 3, 2026')).toEqual({ datum: '2026-11-03', uhrzeit: null });
    expect(termin('Nov 3')).toEqual({ datum: '2026-11-03', uhrzeit: null });
    expect(termin('3rd of May 2027')).toEqual({ datum: '2027-05-03', uhrzeit: null });
    expect(termin('3. März')).toEqual({ datum: '2027-03-03', uhrzeit: null });
    expect(termin('3. Maerz 2026')).toEqual({ datum: '2026-03-03', uhrzeit: null });
    expect(termin('2026-11-03')).toEqual({ datum: '2026-11-03', uhrzeit: null });
    expect(termin('2026-11-03 15:30')).toEqual({ datum: '2026-11-03', uhrzeit: '15:30' });
    expect(termin('maybe tomorrow')).toEqual({ datum: '2026-11-03', uhrzeit: null });
  });

  it('keeps markers around the words and still reads the first clear date', () => {
    expect(termin('= Meet tomorrow')).toEqual({ datum: '2026-11-03', uhrzeit: null });
    expect(termin('**tomorrow**')).toEqual({ datum: '2026-11-03', uhrzeit: null });
    expect(termin('- tomorrow 3pm')).toEqual({ datum: '2026-11-03', uhrzeit: '15:00' });
    expect(termin('[] tomorrow')).toEqual({ datum: '2026-11-03', uhrzeit: null });
    expect(termin('See you tomorrow at 3pm, or on 03.11. if needed.')).toEqual({ datum: '2026-11-03', uhrzeit: '15:00' });
    expect(termin('03.11. otherwise tomorrow')).toEqual({ datum: '2026-11-03', uhrzeit: null });
    expect(termin('Meet at 15:30, backup tomorrow')).toEqual({ datum: '2026-11-02', uhrzeit: '15:30' });
    expect(termin('version 1.3.0 ships tomorrow')).toEqual({ datum: '2026-11-03', uhrzeit: null });
    expect(termin('See #team tomorrow')).toEqual({ datum: '2026-11-03', uhrzeit: null });
    expect(termin('See #tomorrow and come today')).toEqual({ datum: '2026-11-02', uhrzeit: null });
  });

  it('leaves versions, prices, phone numbers, tags, and loose numbers alone', () => {
    const keine = [
      '',
      '   ',
      'Ship 1.3.0',
      'v1.2.0',
      'version 2.10.1',
      '1.3.0-beta',
      '1.2.3',
      '1.2',
      '03.11',
      '12,99 €',
      '€3,50',
      '$3.50',
      '4.99 EUR',
      'EUR 4.99',
      '19.90€',
      '+49 151 12345678',
      '030 1234567',
      '0151-12345678',
      '(030) 123456',
      '123-456-7890',
      '0049.30.12345678',
      '192.168.1.1',
      '#work',
      '#tomorrow',
      '#topic',
      '31.02.',
      '31.02.2026',
      '31.04.2026',
      '29.02.2026',
      '00.11.2026',
      '32.01.2026',
      '16:9',
      '4:3',
      '24:00',
      '15:60',
      '15:30:99',
      '13pm',
      'Q4 numbers',
      'chapter 4',
      'call 15 people',
      'room 3',
      'tomorrowland',
      'heutige Lage',
      'Mondays',
      'montags',
      'next week',
      'The price is 12,99 € and the version is 1.3.0. Call 030 123456 about #topic.',
    ];
    for (const text of keine) expect(termin(text)).toBeNull();
    expect(termin('today', new Date('nope'))).toBeNull();
  });
});
