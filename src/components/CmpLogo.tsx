/**
 * CMP Solutions brand mark — a third-party attribution logo, not part of
 * Ritual's own design system, so it deliberately carries its own navy/blue
 * gradient rather than reusing Ritual's internal tokens (DESIGN.md reserves
 * those for the app's own UI). Built as inline SVG rather than a raster
 * asset so it stays crisp at any size, from the small nav mark up to the
 * larger welcome-screen moment.
 */
export function CmpLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="CMP Solutions"
    >
      <defs>
        <linearGradient id="cmp-bg" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1b2a52" />
          <stop offset="100%" stopColor="#0b1330" />
        </linearGradient>
        <linearGradient id="cmp-mark" x1="10" y1="10" x2="38" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#9db4ff" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="11" fill="url(#cmp-bg)" />
      {/* Four short radial nodes around a hub, evoking circuits/connectivity. */}
      <circle cx="24" cy="24" r="4.5" fill="url(#cmp-mark)" />
      <g stroke="url(#cmp-mark)" strokeWidth="3" strokeLinecap="round">
        <line x1="24" y1="10" x2="24" y2="16" />
        <line x1="24" y1="32" x2="24" y2="38" />
        <line x1="10" y1="24" x2="16" y2="24" />
        <line x1="32" y1="24" x2="38" y2="24" />
      </g>
      <g fill="url(#cmp-mark)">
        <circle cx="24" cy="9" r="2.2" />
        <circle cx="24" cy="39" r="2.2" />
        <circle cx="9" cy="24" r="2.2" />
        <circle cx="39" cy="24" r="2.2" />
      </g>
    </svg>
  );
}
