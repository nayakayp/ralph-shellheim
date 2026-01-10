# Shellheim Design Changelog

## Iteration 1 - 2026-01-10

### Area
Terminal Toolbar Component (`Dashboard.css`)

### Changes
Converted hardcoded CSS values to design tokens for consistency with the 4px grid system:

- **Spacing**: `0.5rem`, `1rem`, `0.375rem`, `0.75rem`, `3rem` → `var(--space-2)`, `var(--space-4)`, `var(--space-3)`, `48px`
- **Typography**: `0.875rem`, `0.8125rem`, `0.75rem` → `var(--text-md)`, `var(--text-base)`, `var(--text-xs)`
- **Font weights**: `500`, `600` → `var(--font-medium)`, `var(--font-semibold)`
- **Colors**: `var(--text-secondary)`, `var(--text-primary)`, `var(--bg-subtle)`, `var(--border-hover)` → `var(--fg-secondary)`, `var(--fg-primary)`, `var(--bg-surface-raised)`, `var(--border-strong)`
- **Transitions**: `150ms ease` → `var(--transition-fast)`

### Before/After
- **Before**: Terminal toolbar used inconsistent, hardcoded rem values and undefined CSS variables
- **After**: All spacing, typography, and colors now use the established design token system

### Next Priority
Audit other component CSS files for similar hardcoded value issues (ServerList.css, FileBrowser.css, or panel components)

---

## Iteration 2 - 2026-01-10

### Area
ServerList Action Buttons (`ServerList.css`, `variables.css`)

### Changes
**Added semantic tokens for feature-specific colors** to `variables.css`:
- `--stats`, `--stats-muted`, `--stats-border` (blue for server stats)
- `--docker`, `--docker-muted`, `--docker-border` (purple for Docker)
- `--wol`, `--wol-muted`, `--wol-border` (orange for Wake-on-LAN)
- Added `--success-border`, `--warning-border`, `--error-border` for consistency

**Converted hardcoded RGBA/hex values** in `ServerList.css`:
- `.action-btn-stats:hover` → uses `var(--stats-*)` tokens
- `.action-btn-docker:hover` → uses `var(--docker-*)` tokens
- `.action-btn-wol:hover` → uses `var(--wol-*)` tokens
- `.action-btn-danger:hover` → uses `var(--error-border)` token
- `.action-btn-sftp:hover` → uses `var(--success-border)` token

### Before/After
- **Before**: Action buttons used raw `rgba(...)` and `#hex` colors, making theming impossible
- **After**: All feature colors now use the design token system, enabling easy theme customization

### Next Priority
Audit FileBrowser.css or panel components (AiPanel.css, DockerPanel.css) for similar hardcoded values

---

## Iteration 3 - 2026-01-10

### Area
Button & Alert Components (`components.css`)

### Changes
Replaced hardcoded `rgba()` border colors with semantic tokens:
- `.btn--danger:hover` border: `rgba(239, 68, 68, 0.25)` → `var(--error-border)`
- `.alert--error` border: `rgba(239, 68, 68, 0.2)` → `var(--error-border)`
- `.alert--success` border: `rgba(34, 197, 94, 0.2)` → `var(--success-border)`
- `.alert--warning` border: `rgba(245, 158, 11, 0.2)` → `var(--warning-border)`

### Before/After
- **Before**: Core component styles used raw RGBA values despite tokens existing
- **After**: All semantic borders now use tokens, ensuring consistency and easier theming

### Next Priority
Audit panel components (DockerPanel.css, AiPanel.css, FileBrowser.css) for remaining hardcoded values

---

## Iteration 4 - 2026-01-10

### Area
Docker Panel Component (`DockerPanel.css`)

### Changes
Complete token conversion for the Docker panel — this file had **extensive hardcoded values**:

**Colors** (30+ replacements):
- `rgba(26, 27, 38, 0.95)` → `var(--bg-surface)`
- `rgba(122, 162, 247, *)` → `var(--stats-*)` tokens
- `rgba(187, 154, 247, *)` → `var(--docker-*)` tokens  
- `rgba(115, 218, 202, *)` → `var(--success-*)` tokens
- `rgba(247, 118, 142, *)` → `var(--error-*)` tokens
- `rgba(255, 158, 100, *)` → `var(--wol-*)` tokens
- `rgba(0, 0, 0, 0.5/0.7)` → `var(--bg-overlay)`
- `var(--tokyo-*)` colors → appropriate semantic tokens

**Spacing**:
- All `4px`, `6px`, `8px`, `10px`, `12px`, `16px`, `20px`, `24px` → `var(--space-*)` tokens
- Panel dimensions kept as explicit values (700px, 800px for modals)

**Typography**:
- `0.7rem` - `1rem` sizes → `var(--text-xs)` through `var(--text-lg)`
- `500`, `600` weights → `var(--font-medium)`, `var(--font-semibold)`

**Border radius**:
- `4px`, `6px`, `8px`, `10px`, `12px`, `16px` → `var(--radius-sm)` through `var(--radius-xl)`

**Transitions**:
- `0.2s ease` → `var(--transition-base)`

**Anti-pattern fix**:
- Removed dramatic drop shadow `0 25px 50px -12px rgba(0, 0, 0, 0.5)` → `var(--shadow-overlay)`

**Z-index**:
- Hardcoded `z-index: 1100` → `var(--z-modal)`

### Before/After
- **Before**: 459 lines with 50+ hardcoded color/spacing values, dramatic shadows, and mixed `--tokyo-*` variables
- **After**: Fully tokenized with consistent design system usage, proper layered shadows, organized into logical sections

### Next Priority
Audit remaining hardcoded values in FileBrowser.css (minor: lines 67, 188-208 still have rgba values)

---

## Iteration 5 - 2026-01-10

### Area
FileBrowser Action Buttons (`FileBrowser.css`, `variables.css`)

### Changes
**Added semantic token** to `variables.css`:
- `--info`, `--info-muted`, `--info-border` (blue for informational actions like download)

**Converted hardcoded rgba/hex values** in `FileBrowser.css`:
- `.fb-close:hover` border → `var(--error-border)`
- `.fb-action-danger:hover` border → `var(--error-border)`
- `.fb-action-upload:hover` border → `var(--success-border)`
- `.fb-action-download:hover` → uses new `var(--info-*)` tokens
- `.fb-action-edit:hover` → uses `var(--warning-*)` tokens
- `.fb-error` border → `var(--error-border)`

### Before/After
- **Before**: Action buttons used raw `rgba(...)` and `#hex` colors for hover states
- **After**: All action button states use semantic tokens, enabling consistent theming

### Next Priority
Audit AiPanel.css for remaining hardcoded values and ensure consistent token usage

---

## Iteration 6 - 2026-01-10

### Area
AI Settings Panel (`AiPanel.css`)

### Changes
Converted remaining hardcoded values to design tokens:

**Colors**:
- `.toggle-switch input:checked + .toggle-slider::before`: `white` → `var(--bg-primary)`
- `.test-result.success` background: `rgba(16, 185, 129, 0.1)` → `var(--success-muted)`
- `.test-result.success` border: `rgba(16, 185, 129, 0.2)` → `var(--success-border)`
- `.test-result.error` border: `rgba(239, 68, 68, 0.2)` → `var(--error-border)`
- `.panel-success` background/border: same rgba values → `var(--success-muted)`, `var(--success-border)`

**Shadows**:
- Range slider thumb (webkit): `0 2px 4px rgba(0, 0, 0, 0.3)` → `var(--shadow-sm)`
- Range slider thumb (moz): same → `var(--shadow-sm)`

### Before/After
- **Before**: 6 hardcoded rgba values for colors and shadows, inconsistent with token system
- **After**: All colors and shadows now use semantic tokens, enabling consistent theming

### Next Priority
Scan remaining CSS files for any leftover hardcoded values (layout.css, ServerList.css, or other component files)

---

## Iteration 7 - 2026-01-10

### Area
Server Stats Panel (`ServerStatsPanel.css`)

### Changes
Complete design token conversion for the stats panel — this file had **50+ hardcoded values**:

**Colors** (40+ replacements):
- `rgba(0, 0, 0, 0.6)` overlay → `var(--bg-overlay)`
- `rgba(30, 30, 46, 0.98)` → `var(--bg-surface)`
- `rgba(139, 92, 246, *)` violet colors → `var(--docker-*)` tokens
- `rgba(122, 162, 247, *)` blue colors → `var(--stats-*)` tokens
- `rgba(158, 206, 106, *)` green colors → `var(--success-*)` / `var(--terminal-green)`
- `#7aa2f7`, `#e2e8f0`, `#94a3b8`, `#565f89` → `var(--stats)`, `var(--fg-primary)`, `var(--fg-secondary)`, `var(--fg-faint)`
- `#ff9e64`, `#9ece6a`, `#bb9af7`, `#f7768e` → `var(--wol)`, `var(--terminal-green)`, `var(--docker)`, `var(--terminal-red)`

**Spacing**:
- All `4px`, `6px`, `8px`, `12px`, `14px`, `16px`, `20px` → `var(--space-*)` tokens

**Typography**:
- `11px` - `18px` sizes → `var(--text-xs)` through `var(--text-xl)`
- `500`, `600`, `700` weights → `var(--font-medium)`, `var(--font-semibold)`, `var(--font-bold)`
- `'JetBrains Mono', monospace` → `var(--font-mono)`

**Border radius**:
- `4px`, `6px`, `8px`, `12px`, `16px` → `var(--radius-sm)` through `var(--radius-xl)`

**Z-index**:
- `z-index: 1000` → `var(--z-modal)`

**Shadows**:
- `0 24px 80px rgba(0, 0, 0, 0.5)` (dramatic) → `var(--shadow-overlay)`

**Transitions**:
- `0.15s`, `0.2s`, `0.3s` → `var(--transition-fast)`, `var(--transition-base)`, `var(--transition-slow)`

### Before/After
- **Before**: 471 lines with 50+ hardcoded rgba/hex colors, inconsistent spacing, dramatic shadows
- **After**: Fully tokenized using design system — consistent colors, spacing grid, proper layered shadows

### Next Priority
Continue tokenizing remaining panel components: SearchPanel.css, MonitoringPanel.css, or TagSelector.css (all have 10+ hardcoded values)
