/**
 * Product identity: a compact mark and the product name, together, on every
 * surface. The mark is a vector rising off a runway inside a rounded square,
 * drawn in the text's own colour so it never competes with the lamp hues or
 * with indigo. The tab icon (`app/icon.svg`) is this same glyph on the page
 * background, so the browser chrome matches the bar.
 */
function Mark() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className="size-4 shrink-0"
    >
      <rect
        x="0.75"
        y="0.75"
        width="14.5"
        height="14.5"
        rx="4.25"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="1.5"
      />
      <path
        d="M4.25 11.75 11.5 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M8.25 4.5h3.25v3.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({ name }: { name: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-foreground">
      <Mark />
      {/* `truncate` is the narrow-viewport guard only: the bar is full width, so
          a desktop header has room for the whole name. */}
      <span className="truncate text-[13.5px] font-semibold tracking-[-0.01em]">
        {name}
      </span>
    </div>
  );
}
