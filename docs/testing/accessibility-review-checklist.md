# Accessibility Review Checklist

Use this checklist when reviewing a frontend change that adds or changes a page,
component, form, navigation item, dialog, or dynamic state. Review the affected
routes and states, not just the initial page load. Mark each item complete or
note why it does not apply; report failures with the route, browser, and steps
to reproduce.

## Keyboard

- [ ] Complete the changed flow using only the keyboard: Tab and Shift+Tab to
  move, Enter or Space to activate, and arrow keys where the control expects
  them.
- [ ] Focus is visible, follows a logical order, and is not hidden behind sticky
  content. There is no keyboard trap.
- [ ] Menus and dialogs open, operate, and close from the keyboard. Escape closes
  dismissible overlays, focus stays inside an open modal, and returns to its
  trigger when it closes.
- [ ] Disabled and loading controls cannot be activated, and their state is
  conveyed without relying on appearance alone.

## Contrast and Visual States

- [ ] Text contrast is at least 4.5:1 for normal text and 3:1 for large text.
- [ ] Controls, meaningful icons, boundaries, and visible focus indicators have
  at least 3:1 contrast against adjacent colors.
- [ ] Information is not conveyed by color alone; check error, success, warning,
  selected, and disabled states in both light and dark themes where supported.
- [ ] Text remains readable when zoomed and when the viewport is narrow; content
  and focus are not clipped or obscured.

## Semantics and Forms

- [ ] Use native elements for their intended purpose (buttons for actions, links
  for navigation, headings in order, lists for collections, and landmarks for
  page regions). Avoid adding ARIA where native HTML already provides the
  semantics.
- [ ] Every input has a persistent programmatic label. Instructions and errors
  are associated with the relevant field; invalid state and required state are
  conveyed to assistive technology.
- [ ] Icon-only controls have an accessible name. Decorative icons are hidden
  from assistive technology, and meaningful images have useful alternative
  text.
- [ ] Custom controls expose their role, name, value, and state, and support the
  expected keyboard interaction.

## Screen Reader and Dynamic Updates

- [ ] Read the changed flow with a screen reader: landmarks, page/section
  headings, control names, and the current value or state make sense in order.
- [ ] Validation errors, save/submit results, loading progress, and relevant
  async updates are announced without unexpectedly moving focus.
- [ ] Dialogs have an accessible name and description when needed; opening and
  closing them does not leave focus behind or lose the user's place.
- [ ] Status is available in text as well as icons or color, including
  verification results, wallet connection/errors, and notification messages.

## App Flows to Consider

Check the paths touched by the change. Include empty, loading, error, success,
and expanded/modal states when the feature has them.

- [ ] **Navigation and shared actions:** [Header](../../frontend/components/Header.tsx),
  [MobileNav](../../frontend/components/MobileNav.tsx), theme toggle, wallet
  connection, notifications, and responsive navigation.
- [ ] **Manifest creation and editing:** `/manifest`, including step changes,
  field validation, previews, signing, and dialogs. See
  [manifest page](../../frontend/app/manifest/page.tsx) and
  [FormInput](../../frontend/components/ui/FormInput.tsx).
- [ ] **Verification and certificate discovery:** `/verify`, `/certificates`,
  and `/certificates/[id]`, including search/filter controls, result updates,
  certificate details, and empty/error states.
- [ ] **Dialogs and announcements:** shared
  [Modal](../../frontend/components/ui/Modal.tsx), confirmation dialogs, toast
  messages in [ToastProvider](../../frontend/components/ToastProvider.tsx), and
  any feature-specific overlays.

## Automated Coverage and Review Notes

- [ ] Review the axe scan in
  [accessibility.spec.ts](../../frontend/e2e/accessibility.spec.ts) for the
  existing routes (`/`, `/verify`, `/manifest`, `/tools`, `/builder`). Add or
  update coverage when a changed route or interaction is not represented.
- [ ] Automated scans supplement, but do not replace, keyboard and screen-reader
  checks. For substantial user-facing changes, manually check with VoiceOver on
  macOS or NVDA on Windows.
- [ ] In the pull request, note the routes and states reviewed, any manual
  assistive-technology check performed, and any known accessibility follow-up.

For the broader testing approach and WCAG 2.1 AA references, see
[Accessibility Testing Plan](./accessibility-testing.md).