import Link from "next/link";

export function Wordmark() {
  return (
    <Link className="wordmark" href="/" aria-label="Lineage home">
      <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
        <circle cx="16" cy="16" r="14" fill="#591709" />
        <path
          d="M8 9 C14 9 14 16 24 16 M8 16 H24 M8 23 C14 23 14 16 24 16"
          fill="none"
          stroke="#F2E5C8"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="24" cy="16" r="2.4" fill="#F2E5C8" />
      </svg>
      <span>Lineage</span>
    </Link>
  );
}
