---
name: CloudForge AI
colors:
  surface: '#121212'
  surface-dim: '#10131a'
  surface-bright: '#363941'
  surface-container-lowest: '#0b0e15'
  surface-container-low: '#191b23'
  surface-container: '#1d2027'
  surface-container-high: '#272a31'
  surface-container-highest: '#32353c'
  on-surface: '#e1e2ec'
  on-surface-variant: '#c2c6d6'
  inverse-surface: '#e1e2ec'
  inverse-on-surface: '#2e3038'
  outline: '#8c909f'
  outline-variant: '#424754'
  surface-tint: '#adc6ff'
  primary: '#adc6ff'
  on-primary: '#002e6a'
  primary-container: '#4d8eff'
  on-primary-container: '#00285d'
  inverse-primary: '#005ac2'
  secondary: '#4edea3'
  on-secondary: '#003824'
  secondary-container: '#00a572'
  on-secondary-container: '#00311f'
  tertiary: '#ffb786'
  on-tertiary: '#502400'
  tertiary-container: '#df7412'
  on-tertiary-container: '#461f00'
  error: '#EF4444'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a42'
  on-primary-fixed-variant: '#004395'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffdcc6'
  tertiary-fixed-dim: '#ffb786'
  on-tertiary-fixed: '#311400'
  on-tertiary-fixed-variant: '#723600'
  background: '#10131a'
  on-background: '#e1e2ec'
  surface-variant: '#32353c'
  base: '#0A0A0A'
  overlay: '#1A1A1A'
  border-subtle: '#262626'
  border-interactive: '#333333'
  success: '#10B981'
  warning: '#F59E0B'
  neutral-text: '#737373'
  code-bg: '#050505'
typography:
  display:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '400'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  h1:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '500'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  h2:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: '0'
  body:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.6'
    letterSpacing: 0.01em
  code:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.5'
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: '1.2'
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gap-sm: 8px
  gap-md: 12px
  container-padding: 16px
  container-padding-lg: 24px
  table-v: 4px
  table-h: 12px
---

# CloudForge AI Design System: Source of Truth

## 1. Philosophy
CloudForge AI is an operational workspace for AI Platform Engineering. The design language rejects the "chatbot" paradigm in favor of a developer-grade workbench. It prioritizes long-term maintainability over visual novelty, emphasizing consistency, clarity, and high-density information architecture.

**Core Tenets:**
- **Calm over Flashy:** No attention-seeking effects.
- **Invisible over Attention-Seeking:** The interface disappears to let the work lead.
- **Precision in Darkness:** High-contrast, developer-grade darkness optimized for long-duration work.
- **Meaning over Aesthetics:** Every visual decision must communicate state, status, or hierarchy.

---

## 2. Surface Vocabulary
Surfaces rely on tonal contrast and precise borders rather than depth or shadows.

- **Base (Level 0):** Hex `#0A0A0A` — The foundation.
- **Surface (Level 1):** Hex `#121212` — Primary containers, cards, and sidebar.
- **Overlay (Level 2):** Hex `#1A1A1A` — Modals, popovers, and elevated controls.
- **Borders:** 1px solid. Use `#262626` for subtle grouping and `#333333` for interactive elements.
- **Shadows:** Strictly forbidden. Use tonal shifts (`Level 1` to `Level 2`) to show elevation.

---

## 3. Typography Rules
Editorial and confident. Hierarchy is driven by scale and tracking, not heavy weights.

- **Primary Font:** Monospace or high-legibility Sans-Serif (e.g., Inter, JetBrains Mono).
- **Scale:**
  - **Display:** 32px / 1.1 leading / -0.02em tracking.
  - **H1:** 24px / 1.2 leading / -0.01em tracking.
  - **H2:** 18px / 1.4 leading / 0 tracking.
  - **Body:** 14px / 1.6 leading / 0.01em tracking (Optimized for density).
  - **Mono/Code:** 13px / 1.5 leading.
- **Weights:** Use `Regular (400)` and `Medium (500)`. Avoid `Bold (700+)` unless for semantic status.

---

## 4. Spacing Rules
Information density is preferred over decorative whitespace.

- **Base Unit:** 4px.
- **Container Padding:** 16px or 24px.
- **Component Gap:** 8px or 12px.
- **In-table Padding:** 4px vertical, 12px horizontal.
- **Rule:** Whitespace must be functional, separating logical groups rather than "breathing."

---

## 5. Shape Language
Intentional and memorable geometric rules.

- **Corner Radius:** 2px or 4px maximum. Hard edges (0px) for tables and code blocks.
- **Icons:** 16px or 20px. Minimalist, single-weight strokes (1.5px).
- **Control Shapes:** Rectilinear. Avoid rounded "pill" buttons.

---

## 6. Hierarchy Rules
- **Precious Accents:** Accent colors (CloudForge Blue: `#3B82F6`) are limited to 1-2 elements per viewport.
- **Scale over Weight:** Larger font size indicates importance; font weight indicates state.
- **Tonal Grouping:** Use subtle background shifts to indicate active vs. inactive zones.

---

## 7. Page Templates
- **Workbench:** Sidebar navigation (collapsed/expanded), header with breadcrumbs, and a flexible multi-column main area.
- **Monitoring/Dashboard:** High-density grid of metrics and logs.
- **Object Detail:** Split-pane view (Metadata on left/right, Primary content in center).

---

## 8. Interaction Patterns
- **Hover:** Subtle border color shift (`#333333` to `#4A4A4A`) or slight background lightening.
- **Active/Selection:** 2px left-border accent or solid tonal shift.
- **Focus:** 1px solid accent color ring with no offset.

---

## 9. Motion Principles
Motion must disappear into the interface. It communicates state, not personality.

- **Transitions:** 150ms "Ease-out".
- **Properties:** Opacity and subtle translates (max 4px).
- **Restrictions:** No floating cards, no bounciness, no excessive transforms.

---

## 10. Component Conventions
- **Buttons:** Ghost or Outline by default. Solid fill reserved for the primary "Submit/Run" action.
- **Inputs:** Understated. Border-bottom or subtle 1px border.
- **Modals:** Center-aligned, Level 2 surface, sharp corners.

---

## 11. Status Semantics
Colors are semantic, not decorative.
- **Neutral:** `#737373` (Idle/Inactive)
- **Success:** `#10B981` (Running/Completed)
- **Warning:** `#F59E0B` (Pending/Degraded)
- **Error:** `#EF4444` (Failed/Alert)

---

## 12. Table Patterns
Tables are first-class citizens.
- **Header:** Sticky, uppercase, tracking 0.05em, `#737373`.
- **Rows:** Border-bottom only. Hover state highlights entire row.
- **Density:** No cell padding exceeding 8px. Use mono fonts for numeric data.

---

## 13. Dashboard Patterns
- **Layout:** Bento-style modular grid.
- **Metric Cards:** Large numeric value, small sparkline, semantic status indicator.
- **Logs:** Real-time stream with monospace font, optimized for scanning speed.

---

## 14. Code Surface Patterns
- **Background:** `#050505` (Darker than base).
- **Syntax Highlighting:** Muted palette. Avoid high-saturation colors.
- **Chrome:** Line numbers, copy button, and language label in small caps.

---

## 15. Navigation Patterns
- **Primary:** Vertical sidebar with icon + label.
- **Secondary:** Horizontal tabs for sub-views.
- **Context:** Breadcrumbs for deep nesting of jobs/artifacts.
