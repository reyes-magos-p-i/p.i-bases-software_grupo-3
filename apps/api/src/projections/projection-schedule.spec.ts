import {
  addMinutes,
  buildSlots,
  costaRicaNow,
  formatLocal,
  scheduleDays,
  scheduledDurationMinutes,
} from './projection-schedule';

describe('projection schedule helpers', () => {
  it('adds minutes across midnight', () => {
    expect(addMinutes('2099-07-21T21:00', 295)).toBe('2099-07-22T01:55');
  });

  it('reads the current time in Costa Rica (UTC-6)', () => {
    expect(costaRicaNow(Date.parse('2026-10-07T03:30:00Z'))).toBe('2026-10-06T21:30');
  });

  it('measures durations that end the next day', () => {
    expect(scheduledDurationMinutes('18:05', '21:00')).toBe(175);
    expect(scheduledDurationMinutes('21:00', '01:55')).toBe(295);
    expect(scheduledDurationMinutes('10:00', '10:00')).toBe(1440);
  });

  it('lists every day of an inclusive range, including month changes', () => {
    expect(scheduleDays('2099-07-30', '2099-08-02')).toEqual([
      '2099-07-30',
      '2099-07-31',
      '2099-08-01',
      '2099-08-02',
    ]);
    expect(scheduleDays('2099-07-21', '2099-07-21')).toEqual(['2099-07-21']);
  });

  it('builds one slot per day with the same duration', () => {
    expect(buildSlots(['2099-07-21', '2099-07-22'], '21:00', 295)).toEqual([
      { screeningDate: '2099-07-21', startTime: '2099-07-21T21:00', endTime: '2099-07-22T01:55' },
      { screeningDate: '2099-07-22', startTime: '2099-07-22T21:00', endTime: '2099-07-23T01:55' },
    ]);
  });

  it('formats local timestamps for messages', () => {
    expect(formatLocal('2099-07-22T18:05')).toBe('22/07/2099 18:05');
  });
});
