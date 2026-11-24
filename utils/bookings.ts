/**
 * Shared booking rules (Bookings screen and the home Quick actions count).
 * Upcoming = today or later and still open (confirmed, or held while the guest pays).
 */
export interface BookingLike {
  status: string;
  bookingDate?: string;
}

export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The booking's day as YYYY-MM-DD (dates may come as plain days or full ISO times). */
export const bookingDay = (b: BookingLike) =>
  /^\d{4}-\d{2}-\d{2}/.test(b.bookingDate || '') ? (b.bookingDate as string).slice(0, 10) : b.bookingDate ? isoDay(new Date(b.bookingDate)) : '';

export const isOpenBooking = (b: BookingLike) => b.status === 'pending' || b.status === 'confirmed';

export const isUpcomingBooking = (b: BookingLike, today: string) => bookingDay(b) >= today && isOpenBooking(b);

export const upcomingBookingCount = (bookings: BookingLike[], today = isoDay(new Date())) => bookings.filter((b) => isUpcomingBooking(b, today)).length;
