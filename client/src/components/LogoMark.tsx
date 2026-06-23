interface Props {
  className?: string;
}

export function LogoMark({ className = 'h-8 w-8' }: Props) {
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      className={className}
    >
      <rect x="3" y="3" width="42" height="42" rx="8" fill="#0f9f59" />
      <path
        d="M14 34c4.2-6.2 9.8-9.3 16.7-9.3 2.5 0 4.9.4 7.3 1.3"
        fill="none"
        stroke="#dcfce7"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M11 22c4.6 3.9 9.2 5.9 13.8 5.9 4.3 0 8.4-1.6 12.2-4.8"
        fill="none"
        stroke="#ffffff"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M24 11v26"
        fill="none"
        stroke="#bbf7d0"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.9"
      />
      <circle cx="34" cy="14" r="5" fill="#facc15" />
      <path
        d="M12 36h24"
        fill="none"
        stroke="#075985"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}
