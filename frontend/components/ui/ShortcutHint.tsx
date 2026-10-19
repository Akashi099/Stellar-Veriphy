interface ShortcutHintProps {
  keys: string;
  label?: string;
}

export function ShortcutHint({ keys, label = "Keyboard shortcut" }: ShortcutHintProps) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-normal opacity-80" aria-label={`${label}: ${keys}`}>
      <span aria-hidden="true">·</span>
      <kbd className="rounded border border-current/25 px-1.5 py-0.5 font-mono text-[10px] leading-none">
        {keys}
      </kbd>
    </span>
  );
}
