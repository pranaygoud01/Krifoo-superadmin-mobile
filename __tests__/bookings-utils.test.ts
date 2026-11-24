import { bookingDay, isUpcomingBooking, upcomingBookingCount } from '../utils/bookings';

describe('upcoming bookings', () => {
  const today = '2026-11-23';
  const list = [
    { status: 'confirmed', bookingDate: '2026-11-23' }, // today
    { status: 'pending', bookingDate: '2026-11-25T00:00:00.000Z' }, // later, held while paying
    { status: 'confirmed', bookingDate: '2026-11-22' }, // yesterday
    { status: 'cancelled_by_user', bookingDate: '2026-11-24' }, // cancelled
    { status: 'completed', bookingDate: '2026-11-23' }, // already done
    { status: 'no_show', bookingDate: '2026-11-24' },
  ];

  it('counts open bookings from today onwards', () => {
    expect(upcomingBookingCount(list, today)).toBe(2);
  });

  it('reads plain days and full ISO dates the same way', () => {
    expect(bookingDay({ status: 'confirmed', bookingDate: '2026-11-25T00:00:00.000Z' })).toBe('2026-11-25');
    expect(isUpcomingBooking({ status: 'confirmed', bookingDate: '2026-11-23' }, today)).toBe(true);
  });

  it('is zero with no bookings', () => {
    expect(upcomingBookingCount([], today)).toBe(0);
  });
});
