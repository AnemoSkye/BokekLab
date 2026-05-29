# VibeMarket Design System & Visual Guidelines

Welcome to the Design System documentation for **VibeMarket** — an AI-powered brand theme and campaign generator tailored for Indonesian small and medium enterprises (UMKM). 

This document outlines the core visual philosophy, typography, dynamic token-driven color systems, spatial layouts, and motion guidelines that define VibeMarket’s user experience.

---

## 1. Visual Philosophy: "Mood First"

VibeMarket departs from standard, rigid SaaS dashboards. Instead, it prioritizes a **tactile, warm, and highly responsive brand-crafting environment**. The visual interface is designed to emulate a premium design studio workspace rather than a technical analytics tool.

### Core Aesthetic Pillars:
*   **Aesthetic Materiality**: Embraces smooth shapes, generous border-radii (`32px` or `2rem`), subtle frosted glass drop-shadows, and organic background lighting.
*   **Dynamic Visual Adaptation**: The system avoids standard blue/purple defaults by updating its entire style, borders, gradients, and backgrounds dynamically in response to the generated brand theme.
*   **Minimalist Clarity**: Information is organized into high-contrast visual tiles with spacious negative margins, avoiding cluttered table grids and telemetry lines.

---

## 2. Typography System

Typography is chosen to reinforce a premium, intentional design vibe. It utilizes four distinct families to establish clear semantic rhythm:

```css
@theme {
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-display: "Outfit", sans-serif;
  --font-serif: "Libre Baskerville", serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
}
```

### Hierarchy & Use-Cases:
1.  **General Admin & Controls (Sans-serif)**: `Inter` is utilized for standard body, inputs, controls, forms, and secondary labels to ensure perfect legibility.
2.  **Brand & Hero Headings (Display)**: `Outfit` is paired on top-tier headlines, brand titles, and banner markers to bring a friendly, crisp, modern aesthetic.
3.  **Editorial Accents (Serif)**: `Libre Baskerville` is reserved for quotes, motivational dividers, or brand style narratives to convey elegance and premium quality.
4.  **Tokenized Metadata (Monospace)**: `JetBrains Mono` is assigned to raw data values, color HEX codes, pricing, limits, and file sizes.

---

## 3. Light Theme & Dynamic Color Tokenization

VibeMarket implements a state-of-the-art **dynamic CSS custom property system**. The UI adapts its tokens based on user interaction and the currently active generated brand.

### A. The Baseline Context Modes
When a customized brand theme is *not* currently active, the interface applies thematic fallback states depending on the user's active tab context:

| Context/Tab | Primary Color | Secondary Color | Accent Color | Background Color | Mood Profile |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Brand (Default)** | `#9333EA` *(Purple)* | `#6B21A8` | `#D8B4FE` | `#FAF5FF` | Artistic, Creative |
| **Campaign** | `#FF6321` *(Orange)* | `#5A5A40` | `#FFB74D` | `#FDF8F3` | Warm, Active, Earthy |
| **Saved & Settings** | `#2563EB` *(Blue)* | `#1E3A8A` | `#93C5FD` | `#EFF6FF` | Stable, Organic Trust |

### B. Generated Brand Customization
Once a merchant uploads a product photo, Gemini analyses its features and generates a customized color palette, writing these values directly to CSS variables at document level:

```ts
root.style.setProperty("--brand-primary", theme.colorPalette.primaryColor);
root.style.setProperty("--brand-secondary", theme.colorPalette.secondaryColor);
root.style.setProperty("--brand-accent", theme.colorPalette.accentColor);
root.style.setProperty("--brand-bg", theme.colorPalette.backgroundColor);
```

This transforms the entire layout in real-time, delivering an immediate, hyper-personalized "vibe check" for the merchant's business.

---

## 4. Layout Architecture & Spatial Blocks

### UI Containers & Shell Groupings:
*   **Frosted floating Navbar**: A sleek, vertical navigation rail aligned to the left of the viewpoint. Styled with a custom transparent white card (`bg-white/80`), deep `backdrop-blur-2xl` filtering, and soft borders.
*   **Double-column Layout**: Spreads layout structures into clear, responsive columns:
    *   **Left Column (Guideline Core)**: Direct, objective visual configurations, such as primary product photo inputs, dynamic palettes, and chosen brand values.
    *   **Right Column (Content Outputs & Marketing)**: Contextual assets including SEO copywriters, social media copy modules, and dynamic visual mockups.

### UI Element Templates (CSS Classes):
*   **The M3 Card (`.m3-card`)**:
    ```css
    .m3-card {
      background: rgba(255, 255, 255, 0.7);
      backdrop-filter: blur(20px);
      border: 1px solid var(--brand-border, #E8E2D9);
      border-radius: 32px;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    ```
    Upon hover, cards elevate dynamically with expanded drop-shadows and subtle color hints (`hover:border-brand-primary/20 hover:shadow-xl`).
*   **The Capsule Button (`.m3-button`)**: A fully rounded capsule (`rounded-full`) that elevates elegantly on cursor hover and shrinks lightly on downpress click (`active:scale-95`). Operates with clean spaced tracking-widest text to retain structured design dignity.

---

## 5. Micro-Interactions & Motion Choreography

All motion in VibeMarket corresponds to physical physics laws (damping, mass, stiffness), implemented via `motion/react` springs.

### Motion Details:
1.  **Sinusoidal Background Spots (`GradientSpot`)**: Background features three floating background radial-gradient spots. They drift organically with different multipliers of sinusoidal trajectories, driven by `useAnimationFrame` and trigonometry vectors:
    ```ts
    const x = Math.sin(time / 2000 + offsetX) * 15 + "vw";
    ```
2.  **Step & Tab Transitions**: Layout containers scale up slightly and glide vertically (`y: 30` to `y: 0`) when entering active views. High-speed tabs trigger instant, rapid ambient spot motions (`setIsRapid(true)`) to feel energetic yet incredibly sleek.
3.  **Icon Rotations**: Material-icon wrappers use responsive hover behaviors (`group-hover:rotate-12 transition-transform`) to add a layer of micro-delight.

---

## 6. Key Components Breakdown

### 1. UploadZone (The Brand Generator)
An immersive, step-by-step assistant that steers user experience from clean local uploads to deep generation. Employs drop-down selectors, visual name suggestions presented as tactile tags, and style pills. Includes custom loading states with organic spinning orbs.

### 2. AssetDashboard (The Generated Assets Review)
A dense, dashboard designed to display generated outcomes. Features:
*   **Hex Color Palette**: Live, copyable circular color swatches showing dynamic primary, secondary, and accent styles.
*   **Brand Guidelines Summary**: A neat summary card placed right under the color palette displaying:
    *   Merchant's Chosen Brand Name
    *   Selected Design Style
    *   Exact Primary and Secondary color dots with associated HEX codes
*   **Visual Assets & Mockup Canvas**: Double-column cards showcasing logo ideas and immersive product mockup embeds.
*   **Social Marketing Grid**: Structured social media calendar blocks displaying content suggestions, scheduled tags, and SEO tags.
