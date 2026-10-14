export function buzz(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
}

/** Short confirmation for a committed move. */
export function buzzTap(): void {
  buzz(12);
}

/** Heavier confirmation for a hit or a knockback. */
export function buzzThud(): void {
  buzz(28);
}

/** Rejected action: two short pulses so it never reads as a success. */
export function buzzReject(): void {
  buzz([10, 40, 10]);
}
