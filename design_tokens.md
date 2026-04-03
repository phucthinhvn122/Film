
# Design Tokens - RoPhim Replica

This document outlines the design tokens extracted from the provided UI screenshots for the RoPhim application replica. These tokens are used to ensure consistency and accuracy in the UI implementation.

## 1. Colors

### Primary Palette
- `primary-bg`: `#11131a` (Main background - a very dark, slightly blue navy)
- `surface-1`: `#171a27` (Slightly lighter surface, used for mobile drawer)
- `surface-2`: `#262d4a` (Elevated surface, used for cards within the drawer)
- `surface-3`: `#23273a` (Component background, e.g., episode buttons)

### Accent Palette
- `accent-gold`: `#fcd34d` (Primary gold for active states, buttons, highlights)
- `accent-gold-darker`: `#ca8a04` (Darker gold for gradients)
- `accent-blue`: `#3b82f6` (Used for the rating button)
- `accent-red`: `#ef4444` (Used for close buttons)

### Text Palette
- `text-primary`: `#f8fafc` (Primary text, almost white)
- `text-secondary`: `#cbd5e1` (Secondary text, for subtitles, metadata)
- `text-muted`: `#94a3b8` (Muted text, for less important details)
- `text-dark`: `#0f172a` (Text on light backgrounds, e.g., member button)

### Gradient Palette
- `gradient-han-quoc`: `linear-gradient(135deg, #7c8ced, #d87b92)`
- `gradient-trung-quoc`: `linear-gradient(135deg, #448972, #e18c8b)`
- `gradient-hoat-hinh`: `linear-gradient(135deg, #e47f9e, #ff95a4)`

## 2. Typography

- **Font Family**: `Inter` (sans-serif as fallback)

| Usage                 | Font Size | Font Weight | Line Height | Letter Spacing |
|-----------------------|-----------|-------------|-------------|----------------|
| Hero Title            | `2.2rem`  | 800 (ExtraBold) | `1.2`       | `-0.5px`       |
| Section Title         | `1.3rem`  | 800 (ExtraBold) | `1.2`       | `-0.2px`       |
| Card Title            | `0.85rem` | 700 (Bold)    | `1.35`      | `normal`       |
| Body (Primary)        | `1.0rem`  | 600 (SemiBold)| `1.5`       | `normal`       |
| Body (Secondary)      | `0.9rem`  | 500 (Medium)  | `1.4`       | `normal`       |
| Button (Large)        | `1.1rem`  | 800 (ExtraBold) | `1`         | `0.2px`        |
| Button (Small)        | `0.85rem` | 700 (Bold)    | `1`         | `normal`       |
| Tag/Badge             | `0.65rem` | 700 (Bold)    | `1.2`       | `0.3px`        |

## 3. Spacing & Sizing

- **Base Unit**: `4px`
- **Grid Gaps**: `8px`, `12px`, `16px`, `24px`
- **Padding**:
  - Page Padding (Horizontal): `16px`
  - Card Padding: `16px` (for drawer cards), `0` (for movie cards)
  - Button Padding (Large): `16px 32px`
  - Button Padding (Small): `8px 14px`
- **Header Height**: `56px` (+ safe area)
- **Movie Card Aspect Ratio**: `2/3`

## 4. Border Radius

- `radius-sm`: `4px`
- `radius-md`: `8px`
- `radius-lg`: `12px`
- `radius-xl`: `16px`
- `radius-xxl`: `20px`
- `radius-full`: `999px` (for pill-shaped elements)

## 5. Shadows

- `shadow-card`: `0 12px 32px rgba(0,0,0,0.6)` (For movie posters)
- `shadow-button`: `0 8px 28px rgba(232,197,71,.4)` (For the main "Xem Ngay" button)
- `shadow-header`: `0 8px 28px rgba(0,0,0,.6)` (When header is scrolled)

## 6. Breakpoints

- **Mobile**: `< 768px`
- **Tablet**: `768px - 1024px`
- **Desktop**: `> 1024px`
