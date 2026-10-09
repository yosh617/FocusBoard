# Design — FocusBoard

A locked design system for the FocusBoard app. Every screen and overlay uses the same visual language while preserving the app’s local-first behavior and existing navigation.

## Genre

Modern-minimal, calm and task-first.

## App structure

- App screens: Workbench — a quiet home workspace, direct controls for the timer and clock, and focused settings/task drawers.
- Overlays: compact, clearly bounded decision surfaces that keep the triggering context visible when possible.
- Content: sectioned work areas with consistent headings, restrained separators, and visible state.

## Theme

- `--color-paper`: `oklch(100% 0 0)`
- `--color-paper-2`: `oklch(98.5% 0 0)`
- `--color-ink`: `oklch(14% 0 0)`
- `--color-ink-2`: `oklch(48.8% 0 0)`
- `--color-rule`: `oklch(91.4% 0 0)`
- `--color-accent`: the user-selected `--accent` value (defaults to `#315f98`)
- `--color-focus`: the same user-selected accent, with a distinct focus outline
- Timer and task theme colors remain functional signals and do not replace the app accent.

## Typography

- Display: Geist, weight 600, roman.
- Body: Geist, weight 400.
- Mono: the system monospace stack, used only for values that benefit from fixed-width digits.
- Numeric timer and report values use tabular numerals.

## Spacing and shape

- Use the existing four-point rhythm: 4, 8, 12, 16, 24, 32, 48, and 64 px.
- Small controls use 8 px corners, cards 12 px, panels 16 px, and pills are reserved for compact segmented controls and primary actions.
- Use hairline borders to separate adjacent work areas. Shadows are reserved for floating controls and overlays.

## Motion and interaction

- Keep existing timer timing and behavior unchanged.
- Use short, quiet state transitions. Honor `prefers-reduced-motion`.
- The selected state uses accent-soft plus ink, or accent plus its readable contrast color. Never use white text on a pale accent.
- Focus is visible independently from selection. Disabled controls remain distinguishable and retain their explanation nearby.
- Dangerous actions use the ember token; export and save actions use the normal action style.

## Per-screen allowances

- The home workspace may show the user’s chosen background and clock placement.
- Settings, tasks, and reports use opaque neutral work surfaces for legibility.
- Timer and task colors may vary through the user’s existing settings.
- App screens do not add decorative hero art or unrelated gradients.

## Shared rules

- Preserve Japanese as the interface language, including primary navigation and screen headings.
- Keep the user-configured accent, timer colors, task themes, and background preferences.
- Keep the home, settings, task, report, and dialog hierarchy recognizable across viewport sizes.
- Reserve space for floating controls and safe areas. Do not cover the clock, main timer actions, or the task launcher.
- Keep user data and uploaded images on-device.

## Exports

### `tokens.css`

```css
:root {
  --color-paper: oklch(100% 0 0);
  --color-paper-2: oklch(98.5% 0 0);
  --color-ink: oklch(14% 0 0);
  --color-ink-2: oklch(48.8% 0 0);
  --color-rule: oklch(91.4% 0 0);
  --color-accent: var(--accent, #315f98);
  --color-focus: var(--accent, #315f98);
  --font-display: var(--font-geist, "Geist", sans-serif);
  --font-body: var(--font-geist, "Geist", sans-serif);
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;
  --space-16: 4rem;
  --radius-control: 8px;
  --radius-card: 12px;
  --radius-panel: 16px;
  --radius-pill: 999px;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --dur-short: 180ms;
}
```

### Tailwind v4 `@theme`

```css
@theme {
  --color-paper: oklch(100% 0 0);
  --color-paper-2: oklch(98.5% 0 0);
  --color-ink: oklch(14% 0 0);
  --color-ink-2: oklch(48.8% 0 0);
  --color-rule: oklch(91.4% 0 0);
  --font-display: "Geist", sans-serif;
  --font-body: "Geist", sans-serif;
  --spacing-1: 0.25rem;
  --spacing-2: 0.5rem;
  --spacing-3: 0.75rem;
  --spacing-4: 1rem;
  --spacing-6: 1.5rem;
  --spacing-8: 2rem;
  --spacing-12: 3rem;
  --spacing-16: 4rem;
  --radius-control: 8px;
  --radius-card: 12px;
  --radius-panel: 16px;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}
```

### DTCG `tokens.json`

```json
{
  "color": {
    "paper": { "$value": "oklch(100% 0 0)", "$type": "color" },
    "paper-2": { "$value": "oklch(98.5% 0 0)", "$type": "color" },
    "ink": { "$value": "oklch(14% 0 0)", "$type": "color" },
    "ink-2": { "$value": "oklch(48.8% 0 0)", "$type": "color" },
    "rule": { "$value": "oklch(91.4% 0 0)", "$type": "color" },
    "accent": { "$value": "var(--accent, #315f98)", "$type": "color" }
  },
  "font": {
    "display": { "$value": "Geist", "$type": "fontFamily" },
    "body": { "$value": "Geist", "$type": "fontFamily" }
  },
  "space": {
    "1": { "$value": "0.25rem", "$type": "dimension" },
    "2": { "$value": "0.5rem", "$type": "dimension" },
    "3": { "$value": "0.75rem", "$type": "dimension" },
    "4": { "$value": "1rem", "$type": "dimension" },
    "6": { "$value": "1.5rem", "$type": "dimension" },
    "8": { "$value": "2rem", "$type": "dimension" }
  }
}
```

### shadcn/ui variables

```css
:root {
  --background: 100% 0 0;
  --foreground: 14% 0 0;
  --primary: var(--accent, #315f98);
  --primary-foreground: 100% 0 0;
  --muted: 91.4% 0 0;
  --muted-foreground: 48.8% 0 0;
  --border: 91.4% 0 0;
  --input: 91.4% 0 0;
  --ring: var(--accent, #315f98);
  --radius: 12px;
}
```
