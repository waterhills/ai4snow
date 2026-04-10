```markdown
# Design System Specification: Precision High-Tech Ski Intelligence

## 1. Overview & Creative North Star
**Creative North Star: "The Alpine Glacial Lab"**

This design system moves away from traditional "rugged" winter aesthetics and instead embraces a high-precision, laboratory-grade digital environment. It is designed to feel like a heads-up display (HUD) for a professional athlete—clinical, futuristic, and unerringly accurate. 

To break the "template" look, we utilize **intentional asymmetry**. Data visualizations should not always be centered; they should feel like they are being scanned in real-time. Overlapping glass surfaces and varying "z-axis" elevations replace rigid, flat grids. The experience is not just a dashboard; it is a high-performance instrument.

---

## 2. Colors & Surface Philosophy

### The Palette
We utilize a deep, nocturnal foundation to make our "Electric" accents feel like light sources rather than mere colors.

*   **Foundation:** `background` (#010e24) / `surface` (#010e24)
*   **Action:** `primary` (#72dcff) / `primary_container` (#00d2ff)
*   **Utility:** `error` (#ff716c) / `tertiary` (#ac89ff)

### The "No-Line" Rule
**Strict Mandate:** Traditional 1px solid borders for sectioning are prohibited. Boundaries between content areas must be defined exclusively through background shifts. 
*   Place a `surface_container_low` card atop a `surface` background. 
*   Use a `surface_container_highest` element to denote the most critical interactive zone.
*   This creates a "molded" look rather than a "drawn" one.

### Surface Hierarchy & Nesting
Treat the UI as a series of nested atmospheric layers.
1.  **Macro-Level:** `surface` (The void/base).
2.  **Meso-Level:** `surface_container` (Content regions).
3.  **Micro-Level:** `surface_container_high` (Interactive components/cards).

### The "Glass & Gradient" Rule
To achieve a "signature" feel, floating elements (modals, tooltips, hover-cards) must utilize **Glassmorphism**.
*   **Recipe:** `surface_variant` at 40% opacity + 20px `backdrop-blur`.
*   **Gradients:** Main Action CTAs should use a linear gradient: `primary` (#72dcff) to `primary_container` (#00d2ff) at a 135° angle. This adds "visual soul"—a sense of glowing energy that flat hex codes lack.

---

## 3. Typography
The system uses a dual-font approach to balance technical precision with high-end editorial flair.

*   **Display & Headlines (Space Grotesk):** This is our "Precision" font. Its geometric, slightly wider stance feels engineered. Use `display-lg` (3.5rem) with tightened letter-spacing (-0.02em) for hero moments to command authority.
*   **Body & Titles (Inter):** Our "Reliability" font. Inter provides maximum legibility during high-activity scenarios. 
*   **The Hierarchy Goal:** Use extreme scale contrast. A `display-md` headline paired with a `label-sm` metadata tag creates a sophisticated, "magazine-meets-mainframe" aesthetic.

---

## 4. Elevation & Depth

### The Layering Principle
Forget shadows in the traditional sense. Depth is achieved via **Tonal Layering**. 
*   To lift an object: Move from `surface_container_low` to `surface_container_highest`. 
*   This mimics the way light hits physical surfaces in a dark environment.

### Ambient Shadows
Where floating is required (e.g., a detached navigation bar):
*   **Shadow Color:** Use a tinted version of `on_surface` (deep blue) at 6% opacity.
*   **Blur:** Minimum 40px. The shadow should feel like a soft "aura" rather than a hard drop-shadow.

### The "Ghost Border" Fallback
If a visual separator is functionally required:
*   Use `outline_variant` at **15% opacity**. It should be barely perceptible—a "whisper" of a line that only appears when the user focuses on it.

---

## 5. Components

### Buttons (The "Power Cells")
*   **Primary:** Gradient fill (`primary` to `primary_container`). `xl` roundedness (0.75rem). Text is `on_primary_fixed` (Deep Navy) for maximum contrast.
*   **Secondary:** Glass-filled. `outline_variant` (Ghost Border). 
*   **States:** On hover, add a 4px `primary` outer glow (0.3 opacity) to simulate a powered-on light.

### Data Visualization: Pressure Maps
*   Forgo standard bar charts. Use **Heatmaps** utilizing the `primary` to `tertiary` spectrum.
*   **Pressure Chips:** Use `secondary_container` with `on_secondary_container` text. Use `full` roundedness for a "pill" look that feels organic against the technical grid.

### Input Fields
*   **Style:** No background. Only a bottom "Ghost Border" that transitions to a 100% opaque `primary` glow when focused.
*   **Labels:** Use `label-md` in `on_surface_variant`. 

### Cards & Lists
*   **Strict Rule:** No dividers. Use **80px of vertical white space** to separate major list sections.
*   **Visual Grouping:** Group items by placing them on a shared `surface_container_low` plinth with `lg` (0.5rem) corners.

---

## 6. Do’s and Don’ts

### Do:
*   **Embrace Negative Space:** Give data room to breathe. High-tech doesn't mean cluttered; it means intentional.
*   **Use Subtle Animation:** Background gradients should subtly shift (2-3% hue rotation) to feel "alive."
*   **Layer Surface Tiers:** Always place higher-tier containers on lower-tier surfaces.

### Don't:
*   **Don't use Pure White:** Use `on_surface` (#dbe6ff). Pure white (#FFFFFF) is too harsh and breaks the glacial, high-tech immersion.
*   **Don't use 1px Solid Borders:** It looks like a generic template. If you can't see the separation through color shifts, your hierarchy is too flat.
*   **Don't use standard Drop Shadows:** We are in a digital space; light comes from the elements themselves (glow), not from an invisible sun above the screen.