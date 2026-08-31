export function Wordmark({ name }: { name: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-foreground">
      <span
        className="size-3.5 shrink-0 rounded-[3px] border-[1.5px] border-border"
        aria-hidden="true"
      />
      <span className="truncate text-[13.5px] font-semibold tracking-[-0.01em]">
        {name}
      </span>
    </div>
  );
}
