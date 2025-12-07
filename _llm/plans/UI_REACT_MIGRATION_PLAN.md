# UI React + Shadcn Migration Plan

> Created: 2025-12-06
> Status: ✅ Complete

## Goal

Migrate the Chrome extension UI from vanilla JS to React + Shadcn/ui, enabling:
- Component-based architecture for maintainability
- Shadcn's polished dark theme matching Tempo/Linear aesthetic
- Two-surface architecture: compact popup + full settings page
- Resizable/movable floating panel (future)

---

## Progress

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 0: Setup & Dependencies | ✅ Complete | React 18, Vite multi-entry, browser.ts export, 17 tests |
| Phase 1: Shared Component Library | ✅ Complete | Button, Card, Switch, SectionHeader - 40 tests |
| Phase 2: Popup Migration | ✅ Complete | Hooks (useAuth, useIdentity, useMemory) + popup App.tsx |
| Phase 3: Full Settings Page | ✅ Complete | options.html with full editing, memory, settings, context |
| Phase 4: Polish & Animation | ✅ Complete | Skeleton component, hover-lift, shimmer, micro-interactions |

**Total: 164 tests passing**

---

## Current State

### Tech Stack
- **Build**: Vite + @crxjs/vite-plugin
- **Styling**: Tailwind CSS (compiled at build time for CSP)
- **UI**: Vanilla JS (popup.js, content.js)
- **Storage**: chrome.storage.local + Supabase sync

### Files to Migrate

| File | Lines | Complexity | Notes |
|------|-------|------------|-------|
| popup.js | 597 | High | Auth, stats, identity editing, cloud sync |
| popup.html | ~150 | Medium | All markup inline |
| popup.css | ~50 | Low | Tailwind input file |
| content.js | ~400 | High | Overlay injection, chat UI |

### What Works Well (Keep)
- Tailwind configuration and custom colors (`arete-*`)
- Background script architecture (LLM calls, auth)
- chrome.storage patterns
- Supabase sync service

---

## Design Direction

### References
- **Tempo.xyz**: Dark theme (#1d1d1d), numbered sections (`01 ::`), code-like dividers (`//`)
- **Linear**: Muted palette, excellent typography, dense information
- **Raycast**: Floating panel, keyboard-first, minimal chrome
- **Arc**: Compact, bold accents, progressive disclosure

### Design Tokens (Shadcn Variables)

```css
/* Dark theme base - tempo.xyz inspired */
:root {
  --background: 0 0% 7%;           /* #121212 */
  --foreground: 0 0% 95%;          /* #f2f2f2 */
  --card: 0 0% 9%;                 /* #171717 */
  --card-foreground: 0 0% 95%;
  --popover: 0 0% 9%;
  --popover-foreground: 0 0% 95%;
  --primary: 168 76% 42%;          /* Arete teal #1DB48D */
  --primary-foreground: 0 0% 100%;
  --secondary: 0 0% 14%;           /* #242424 */
  --secondary-foreground: 0 0% 95%;
  --muted: 0 0% 14%;
  --muted-foreground: 0 0% 64%;
  --accent: 168 76% 42%;
  --accent-foreground: 0 0% 100%;
  --destructive: 0 84% 60%;
  --destructive-foreground: 0 0% 100%;
  --border: 0 0% 18%;              /* #2e2e2e */
  --input: 0 0% 14%;
  --ring: 168 76% 42%;
  --radius: 0.5rem;
}
```

### Typography

```css
/* Tempo-inspired hierarchy */
--font-sans: 'Geist', -apple-system, sans-serif;
--font-mono: 'Geist Mono', monospace;

/* Section headers */
.section-header {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}
/* Pattern: "// 01 identity" */
```

---

## Architecture

### Two-Surface Model

```
┌─────────────────────────────────────────────────────────────┐
│ POPUP (popup.html)                                          │
│ Quick access panel - 320px wide, auto height               │
│                                                             │
│ • View identity (read-only, formatted)                      │
│ • Quick toggle settings (2-3 switches)                      │
│ • Memory stats (compact)                                    │
│ • "Open Settings" link → options page                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ OPTIONS PAGE (options.html)                                 │
│ Full settings - browser tab, responsive width              │
│                                                             │
│ • Identity editing (prose textarea + parsed preview)        │
│ • All settings (sync, model, theme, API keys)               │
│ • Memory management (facts, pages, conversation)            │
│ • Context history with filtering                            │
│ • Export/Import/Clear actions                               │
│ • Account management                                        │
└─────────────────────────────────────────────────────────────┘
```

### File Structure

```
src/
├── popup/                    # Popup React app
│   ├── main.tsx              # Entry point
│   ├── App.tsx               # Root component
│   └── index.html            # HTML template
│
├── options/                  # Options page React app
│   ├── main.tsx              # Entry point
│   ├── App.tsx               # Root component
│   └── index.html            # HTML template
│
├── components/               # Shared components
│   ├── ui/                   # Shadcn primitives (copy-pasted)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   ├── textarea.tsx
│   │   ├── switch.tsx
│   │   ├── tabs.tsx
│   │   ├── separator.tsx
│   │   ├── avatar.tsx
│   │   ├── badge.tsx
│   │   ├── progress.tsx
│   │   └── tooltip.tsx
│   │
│   ├── identity/             # Identity-specific components
│   │   ├── IdentityView.tsx  # Read-only formatted display
│   │   ├── IdentityEditor.tsx # Prose input + save
│   │   └── IdentityCard.tsx  # Compact card for popup
│   │
│   ├── memory/               # Memory components
│   │   ├── StatsBar.tsx      # Facts/Pages/Messages counts
│   │   ├── FactsList.tsx     # Scrollable facts list
│   │   └── ContextHistory.tsx # Page visits timeline
│   │
│   ├── settings/             # Settings components
│   │   ├── QuickSettings.tsx # Toggle switches for popup
│   │   ├── FullSettings.tsx  # All settings for options
│   │   └── ApiKeyManager.tsx # API key configuration
│   │
│   └── layout/               # Layout components
│       ├── Header.tsx        # Logo + user avatar
│       ├── SectionHeader.tsx # "// 01 identity" pattern
│       └── Footer.tsx        # Actions row
│
├── hooks/                    # React hooks
│   ├── useAuth.ts            # Auth state from background
│   ├── useIdentity.ts        # Identity CRUD
│   ├── useMemory.ts          # Facts/pages/conversation
│   └── useSettings.ts        # Settings state
│
├── lib/                      # Utilities
│   ├── chrome.ts             # chrome.* API wrappers
│   ├── utils.ts              # cn() helper, formatters
│   └── constants.ts          # Storage keys, limits
│
├── styles/                   # Global styles
│   └── globals.css           # Tailwind + Shadcn variables
│
├── content.js                # Keep vanilla (overlay injection)
├── context.js                # Keep vanilla
└── api.js                    # Keep vanilla
```

### Entry Points (Vite Config)

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        popup: 'src/popup/index.html',
        options: 'src/options/index.html',
        content: 'src/content.js',
        background: 'background.js',
      },
    },
  },
});
```

---

## Component Specifications

### Popup Layout

```
┌─────────────────────────────────┐
│ [A] Arete        [avatar] [⚙]  │  ← Header (48px)
├─────────────────────────────────┤
│ // identity                     │  ← SectionHeader
│ ┌─────────────────────────────┐ │
│ │ Senior PM at PayNearMe      │ │  ← IdentityCard
│ │ Payments + conversational AI│ │
│ │                    [Edit →] │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ // quick settings               │
│ Sync enabled         [═══○]    │  ← Switch
│ Auto-context         [═══○]    │
├─────────────────────────────────┤
│ // memory            [0] [12]  │  ← Compact stats
│        ━━━━━━━━━━━━━━━━━━━     │  ← Combined progress
├─────────────────────────────────┤
│      [ Open full settings → ]  │  ← Footer link
└─────────────────────────────────┘
Width: 320px | Height: auto (~380px)
```

### Options Page Layout

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  [A] Arete                                    gustavo... [Sign out]
│  Your AI, elevated                                               │
│                                                                  │
│  ════════════════════════════════════════════════════════════    │
│                                                                  │
│  ┌─────────────────────────────────┐ ┌─────────────────────────┐ │
│  │ // 01 identity                  │ │ // 02 memory            │ │
│  │                                 │ │                         │ │
│  │ ┌─────────────────────────────┐ │ │  Facts      0/50  ───── │ │
│  │ │ I'm a Senior PM at PayNearMe│ │ │  Pages     12/20  ━━━━━ │ │
│  │ │ working on payments...      │ │ │  Messages       0       │ │
│  │ │                             │ │ │                         │ │
│  │ └─────────────────────────────┘ │ │  Storage: 9.7 KB        │ │
│  │                                 │ │                         │ │
│  │  ┌─ Parsed ─────────────────┐   │ │  [Clear] [Export]       │ │
│  │  │ Role: Senior PM          │   │ └─────────────────────────┘ │
│  │  │ Company: PayNearMe       │   │                             │
│  │  │ Domain: Payments, AI     │   │ ┌─────────────────────────┐ │
│  │  └──────────────────────────┘   │ │ // 03 settings          │ │
│  │                                 │ │                         │ │
│  │          [Save identity]        │ │ Sync to cloud    [═══○] │ │
│  └─────────────────────────────────┘ │ Auto-context     [═══○] │ │
│                                      │ Default model           │ │
│  ┌───────────────────────────────────┤ ┌─────────────────────┐ │ │
│  │ // 04 recent context              │ │ Claude           ▼  │ │ │
│  │                                   │ └─────────────────────┘ │ │
│  │ ┌───────────────────────────────┐ │ Theme                   │ │
│  │ │ Linear - Project Management   │ │ [● Dark] [○ Light]      │ │
│  │ │ linear.app • 2 min ago        │ │                         │ │
│  │ ├───────────────────────────────┤ │ API Keys                │ │
│  │ │ Tempo - Stablecoin Infra      │ │ [Configure →]           │ │
│  │ │ tempo.xyz • 15 min ago        │ └─────────────────────────┘ │
│  │ └───────────────────────────────┘                             │
│  │                     [View all →]                              │
│  └───────────────────────────────────                            │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
Max width: 1200px | Centered | Responsive grid
```

---

## Implementation Phases

### Phase 0: Setup & Dependencies

**Goal**: Get React + Shadcn running in the extension

**Tasks**:
- [ ] Install React 18 + ReactDOM
- [ ] Install Shadcn dependencies (`@radix-ui/*`, `class-variance-authority`, `clsx`, `tailwind-merge`)
- [ ] Update Vite config for multiple entry points
- [ ] Create `src/popup/` and `src/options/` directories
- [ ] Initialize Shadcn with dark theme variables
- [ ] Create `components.json` for Shadcn CLI
- [ ] Add `cn()` utility function
- [ ] Verify CSP compliance (no inline styles)

**Dependencies to Add**:
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@radix-ui/react-avatar": "^1.0.4",
    "@radix-ui/react-switch": "^1.0.3",
    "@radix-ui/react-tabs": "^1.0.4",
    "@radix-ui/react-tooltip": "^1.0.7",
    "@radix-ui/react-separator": "^1.0.3",
    "@radix-ui/react-progress": "^1.0.3",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.0",
    "lucide-react": "^0.303.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0"
  }
}
```

**Tests**:
- [ ] Popup renders without errors
- [ ] Options page renders without errors
- [ ] Tailwind classes apply correctly
- [ ] No CSP violations in console

### Phase 1: Shared Component Library

**Goal**: Build reusable Shadcn components + Arete-specific components

**Tasks**:
- [ ] Copy Shadcn primitives: Button, Card, Input, Textarea, Switch, Tabs, Avatar, Badge, Progress, Separator, Tooltip
- [ ] Create `SectionHeader` component (`// 01 identity` pattern)
- [ ] Create `Header` component (logo + avatar + settings icon)
- [ ] Create `StatsBar` component (facts/pages/messages with progress)
- [ ] Create `IdentityView` component (formatted read-only display)
- [ ] Create `IdentityEditor` component (prose textarea + save button)

**Component: SectionHeader**
```tsx
interface SectionHeaderProps {
  number: string;  // "01"
  label: string;   // "identity"
  action?: React.ReactNode;  // Optional right-side action
}

// Renders: "// 01 identity"
```

**Tests**:
- [ ] Each component renders in isolation
- [ ] Dark theme variables apply
- [ ] Accessibility (keyboard navigation, ARIA)

### Phase 2: Popup Migration

**Goal**: Replace popup.html + popup.js with React app

**Tasks**:
- [ ] Create `src/popup/App.tsx` with main layout
- [ ] Implement `useAuth` hook (wraps chrome.runtime.sendMessage)
- [ ] Implement `useIdentity` hook (load/save identity)
- [ ] Implement `useMemory` hook (stats loading)
- [ ] Wire up Header with auth state
- [ ] Wire up IdentityCard with identity data
- [ ] Wire up QuickSettings with toggle state
- [ ] Wire up compact StatsBar
- [ ] Add "Open full settings" link
- [ ] Delete old popup.js, popup.html, popup.css

**Popup State**:
```tsx
interface PopupState {
  user: User | null;
  identity: Identity | null;
  stats: {
    facts: number;
    pages: number;
    messages: number;
    storageKb: number;
  };
  settings: {
    syncEnabled: boolean;
    autoContext: boolean;
  };
}
```

**Tests**:
- [ ] Auth flow works (sign in → avatar appears)
- [ ] Identity displays correctly
- [ ] Settings toggles persist
- [ ] Stats load on open
- [ ] "Open settings" navigates to options page

### Phase 3: Full Settings Page

**Goal**: Create comprehensive options.html page

**Tasks**:
- [ ] Create `src/options/App.tsx` with grid layout
- [ ] Build IdentityEditor section (left column)
- [ ] Build Memory section (right column top)
- [ ] Build Settings section (right column bottom)
- [ ] Build ContextHistory section (bottom left)
- [ ] Implement parsed identity preview (updates on save)
- [ ] Add Clear/Export/Import actions
- [ ] Add API key configuration UI
- [ ] Add model selector dropdown
- [ ] Add theme toggle (dark/light/system)
- [ ] Register options page in manifest.json

**Manifest Addition**:
```json
{
  "options_page": "src/options/index.html"
}
```

**Tests**:
- [ ] Identity editing → save → preview updates
- [ ] Settings persist across sessions
- [ ] Export produces valid JSON
- [ ] Import restores data
- [ ] Clear prompts confirmation

### Phase 4: Polish & Animation

**Goal**: Add micro-interactions and visual refinement

**Tasks**:
- [ ] Add fade-in animations on mount
- [ ] Add hover lift effects on cards
- [ ] Add focus ring animations
- [ ] Add loading skeletons during async operations
- [ ] Add success/error toast notifications
- [ ] Add sync status indicator (animated dot when syncing)
- [ ] Keyboard shortcuts (Escape to close, Tab navigation)
- [ ] Responsive breakpoints for options page

**Animation Tokens**:
```css
/* Staggered reveal */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-in {
  animation: fadeInUp 0.3s ease-out forwards;
}

/* Stagger children */
.stagger-children > * {
  animation-delay: calc(var(--index) * 50ms);
}
```

**Tests**:
- [ ] Animations don't cause jank
- [ ] Reduced motion preference respected
- [ ] Keyboard navigation works throughout

---

## Migration Strategy

### Incremental Approach

1. **Keep vanilla JS working** during migration
2. Build React components in parallel under `src/`
3. Swap entry points in manifest when ready
4. Delete old files only after validation

### Rollback Plan

If issues arise:
- Revert manifest.json entry points
- Old popup.js remains functional
- Git history preserves everything

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | React 18 | Industry standard, good DX, hooks |
| Component library | Shadcn/ui | Own the code, dark theme built-in, Radix primitives |
| Styling | Tailwind + CSS variables | Already using Tailwind, Shadcn expects it |
| State management | React hooks + chrome.storage | Simple, no Redux needed for this scale |
| Animation | CSS transitions | Lightweight, no runtime library |
| Icons | Lucide React | Matches Shadcn aesthetic, tree-shakeable |

---

## Open Questions

1. **Content script (overlay)**: Migrate to React or keep vanilla?
   - Recommendation: Keep vanilla for now. Overlay injection is complex, and React adds bundle size to every page.

2. **Floating/resizable panel**: Should popup become a floating window?
   - Recommendation: Phase 5 consideration. Chrome extension popups have constraints. Could explore `chrome.windows.create()` for a detached panel.

3. **Chat UI**: Include in options page or separate?
   - Recommendation: Keep chat in overlay (content script). Options page is for settings, not conversation.

---

## Success Criteria

1. Popup loads in <100ms
2. Options page loads in <200ms
3. No CSP violations
4. All existing functionality preserved
5. Dark theme matches Tempo/Linear aesthetic
6. Components are reusable and tested
7. Bundle size increase <50KB gzipped

---

## Dependencies Summary

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@radix-ui/react-avatar": "^1.0.4",
    "@radix-ui/react-switch": "^1.0.3",
    "@radix-ui/react-tabs": "^1.0.4",
    "@radix-ui/react-tooltip": "^1.0.7",
    "@radix-ui/react-separator": "^1.0.3",
    "@radix-ui/react-progress": "^1.0.3",
    "@radix-ui/react-select": "^2.0.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.0",
    "lucide-react": "^0.303.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0"
  }
}
```

---

## References

- [Shadcn/ui Documentation](https://ui.shadcn.com)
- [Radix Primitives](https://radix-ui.com/primitives)
- [Chrome Extension with React + Vite](https://crxjs.dev/vite-plugin)
- [Tempo.xyz](https://tempo.xyz) - Design reference
- [Linear](https://linear.app) - Design reference
