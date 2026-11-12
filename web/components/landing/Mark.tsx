export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="mark">
      <path d="M16 4 C16 28 16 36 16 42 C16 52 26 55 38 52" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <circle cx="49" cy="50" r="8" fill="var(--signal)" />
    </svg>
  );
}
