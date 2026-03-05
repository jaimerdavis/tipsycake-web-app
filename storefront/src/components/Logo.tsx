export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="TipsyCake logo"
    >
      {/* Cake base */}
      <rect x="4" y="22" width="32" height="8" rx="3" fill="currentColor" opacity="0.9" />
      <rect x="7" y="16" width="26" height="8" rx="3" fill="currentColor" opacity="0.7" />
      <rect x="10" y="10" width="20" height="8" rx="3" fill="currentColor" opacity="0.5" />
      {/* Tilted cherry on top — the "tipsy" */}
      <circle cx="23" cy="8" r="3.5" fill="currentColor" />
      <path d="M23 8 C22 4, 19 2, 16 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}
