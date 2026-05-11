# design.md

## Design System
* **Background Base:** Radial gradient from Top Right (`#171f33` to `#0b1326`).
* **Surface:** `#0b1326`
* **Primary (Success/Confidence):** `#39ff14` (Neon Green)
* **Secondary (Learning/Correction):** `#ffb77d` (Warm Orange)
* **Text Colors:** `on-surface` (`#dae2fd`), `on-surface-variant` (`#baccb0`).
* **Error/Risk:** `#ffb4ab`

## Typography
* **Headlines (display-lg, headline-md):** Space Grotesk (Weights: 500, 700).
* **Body & UI Labels (body-base):** Sora (Weights: 400, 600).
* **Numerical Data (data-lg, data-md, label-caps):** JetBrains Mono (Weights: 500, 600, 700) - Strict requirement for all odds, percentages, and timestamps.

## Glassmorphism Specs
* **Container Background:** `rgba(255, 255, 255, 0.05)`
* **Backdrop Filter:** `blur(24px)`
* **Border:** `1px solid rgba(255, 255, 255, 0.1)`
* **Inner Glow:** `box-shadow: inset 1px 1px 0px rgba(255, 255, 255, 0.05)`
* **Elevation Drop Shadow:** Outer glow using primary/secondary colors at low opacity (e.g., `drop-shadow-[0_0_30px_rgba(57,255,20,0.2)]`).

## Layout & Responsive
* **Grid System:** 12-column fluid grid.
* **Max Width:** 1440px.
* **Breakpoints:** * Mobile (`< 768px`): 1 column, bottom navigation bar, tight margins (`1rem`).
    * Tablet (`768px - 1024px`): 2 columns.
    * Desktop (`> 1024px`): 3 columns, fixed left sidebar, wide margins (`2.5rem`).

## Component States
* **Hover:** Glass cards trigger a border glow `border-primary/40` or `border-secondary/40` depending on context. Buttons scale slightly.
* **Active:** Interactive elements scale down (`active:scale-95`) with `duration-100`.
* **Disabled:** Opacity reduced to `0.5`, grayscale filter applied, cursor set to `not-allowed`.
* **Loading:** Mascot sprite shifts to `running` animation; text elements show a subtle pulse effect.