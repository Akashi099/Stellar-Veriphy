# Accessibility Review Checklist

Use this short checklist on every PR that touches UI. It targets common accessibility regressions in keyboard use, semantics, focus, and contrast. Aim to complete it in a few minutes.

## 1. Keyboard navigation
- [ ] All interactive elements are reachable and operable with `Tab` / `Shift+Tab` and `Enter` / `Space`.
- [ ] No keyboard traps; users can always move focus away.
- [ ] Custom widgets (menus, modals, dropdowns) support expected keys (e.g. `Esc` to close, arrow keys where applicable).
- [ ] Global shortcuts don't hijack typing in inputs/textareas — verify with `KeyboardShortcutsProvider.tsx`.

## 2. Semantics & ARIA
- [ ] Use native elements first (`button`, `a`, `input`, `label`); avoid clickable `div`/`span`.
- [ ] Images and icons have appropriate `alt` text or `aria-hidden="true"` when decorative.
- [ ] Form fields have associated labels; errors are announced (e.g. `aria-describedby`, `role="alert"`).
- [ ] ARIA roles/states are correct and not redundant (e.g. `aria-expanded` on toggles).
- [ ] Landmarks and headings are logical (one `h1`, sensible order).

## 3. Focus management
- [ ] Focus is visible on every focusable element (no `outline: none` without a replacement).
- [ ] Opening a modal/dialog moves focus inside and traps it; closing returns focus to the trigger — check `WalletModal.tsx`.
- [ ] Focus order follows visual order; no unexpected jumps.
- [ ] Route/view changes move focus to a sensible starting point (e.g. main heading).

## 4. Color contrast & visual
- [ ] Text meets WCAG AA contrast (4.5:1 normal, 3:1 large text); check both light and dark themes.
- [ ] Focus indicators and UI component boundaries meet 3:1 against adjacent colors.
- [ ] Information isn't conveyed by color alone (add text/icon cues).
- [ ] Content remains usable at 200% zoom and with increased text size.

## Representative components & flows
- **Header** (`frontend/components/Header.tsx`): nav links, mobile menu toggle, keyboard reachability, focus order.
- **Wallet modal** (`frontend/components/WalletModal.tsx`): focus trap, `Esc` to close, focus return, labeled controls.
- **Keyboard shortcuts** (`frontend/components/KeyboardShortcutsProvider.tsx`): shortcuts don't break input typing; discoverable help.
- **Verification flow**: step navigation, status announcements, error messaging, focus on step change.
- **Upload flow**: file input labeling, drag-and-drop keyboard alternative, progress/error announcements.

## Existing tooling
- Run `frontend/scripts/a11y-report.mjs` to surface automated issues before review.
- Reuse helpers in `frontend/utils/accessibility.tsx` (focus management, announcements) rather than reimplementing.

## Quick manual pass
1. Tab through the changed screen end-to-end.
2. Open/close any modal and confirm focus behavior.
3. Toggle theme and re-check contrast.
4. Run the a11y report script.