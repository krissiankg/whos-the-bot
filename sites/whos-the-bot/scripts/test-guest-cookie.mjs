// Hosting platforms may add independent cookies; only this cookie authenticates a game guest.
export function guestSetCookie(headers) {
  return headers.getSetCookie().find(value => /^wtb_guest=/.test(value)) || null;
}

