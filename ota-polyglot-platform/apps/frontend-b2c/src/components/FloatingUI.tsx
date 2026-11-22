// The floating "call us" button is off until the operator supplies a real phone number (P5-12): lib/site.ts still holds the mockup's
// placeholder, and a button that dials a number nobody answers is worse than no button. It also sat on top of the "Select" buttons and
// the price bar on phones. Restore it (and hide it on /flights and /booking, where it covers the main actions) once the number is real.
export default function FloatingUI() {
  return null;
}
