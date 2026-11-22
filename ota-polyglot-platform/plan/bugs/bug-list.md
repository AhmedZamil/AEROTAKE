# Bugs

You say a bug in chat → it gets listed here.

| ID | Date | Area | Summary | Status | Notes |
|---|---|---|---|---|---|
| BUG-1 | 2026-10-04 | B2C passengers | Phone country code clones / repeats (`/booking/passengers`) | Fixed | Fixed 2026-10-05: `splitContactPhone` / `joinContactPhone` peel repeated dial codes; form defaults load national digits only; submit stores one `+dial national`. See `passengers/page.tsx`. |
| BUG-2 | 2026-10-04 | B2C passengers | Passport number not properly validated before booking | Fixed | Fixed 2026-10-09: client requires 6–12 A–Z/0–9 with a digit + future expiry (`lib/passport.ts`, form + Zod). Core `ConsumerBookingService` refuses bad passport/expiry the same way. |
| BUG-3 | 2026-10-04 | B2C auth | Forgot password should work end-to-end | Open | UI + API exist (`/forgot-password` → core `forgot-password` / `reset-password`). Reset email usually never arrives because SMTP is unset (core only logs the link). Needs real mail (ties to **P5-18**) so the reset link reaches the customer and reset completes. |
| BUG-4 | 2026-10-16 | B2C passengers | Contact email needs basic format validation | Fixed | Fixed 2026-10-16: `lib/email.ts` requires `name@example.com`. Empty says "Email is required"; a bad address says "Enter a valid email address"; a pasted runaway ending (or over 254 characters) says "Email address is too long". Shown on the traveller form before reserve. |
