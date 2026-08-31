/**
 * A column heading in an answer's table. Shared by the ranking, the lookup, the
 * score vector and the pending row, so every table an answer draws heads its
 * columns the same way.
 */
export function HeadCell({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`text-[10px] font-medium tracking-[0.07em] text-muted-foreground uppercase ${className}`}
    >
      {children}
    </span>
  );
}
