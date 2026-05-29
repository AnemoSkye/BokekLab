---
name: Culinary Atmosphere
colors:
  surface: '#fcf9f8'
  surface-dim: '#dcd9d9'
  surface-bright: '#fcf9f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f2'
  surface-container: '#f0eded'
  surface-container-high: '#eae7e7'
  surface-container-highest: '#e5e2e1'
  on-surface: '#1b1c1c'
  on-surface-variant: '#5a4138'
  inverse-surface: '#303030'
  inverse-on-surface: '#f3f0ef'
  outline: '#8f7066'
  outline-variant: '#e3bfb2'
  surface-tint: '#a83900'
  primary: '#a43700'
  on-primary: '#ffffff'
  primary-container: '#cd4700'
  on-primary-container: '#fffbff'
  inverse-primary: '#ffb59a'
  secondary: '#964900'
  on-secondary: '#ffffff'
  secondary-container: '#fc820c'
  on-secondary-container: '#5e2c00'
  tertiary: '#72554b'
  on-tertiary: '#ffffff'
  tertiary-container: '#8d6e63'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbcf'
  primary-fixed-dim: '#ffb59a'
  on-primary-fixed: '#380d00'
  on-primary-fixed-variant: '#802a00'
  secondary-fixed: '#ffdcc6'
  secondary-fixed-dim: '#ffb786'
  on-secondary-fixed: '#311300'
  on-secondary-fixed-variant: '#723600'
  tertiary-fixed: '#ffdbce'
  tertiary-fixed-dim: '#e4beb2'
  on-tertiary-fixed: '#2b160f'
  on-tertiary-fixed-variant: '#5b4137'
  background: '#fcf9f8'
  on-background: '#1b1c1c'
  surface-variant: '#e5e2e1'
typography:
  display-lg:
    fontFamily: Outfit
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Outfit
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 42px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Outfit
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-sm:
    fontFamily: Outfit
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Outfit
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Outfit
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  data-label:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.05em
  data-value:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 24px
  lg: 48px
  xl: 80px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 64px
---

## Brand & Style
This design system focuses on the sensory experience of food and beverage discovery. The brand personality is vibrant, warm, and communal, aiming to evoke a sense of appetite and comfort. 

The design style utilizes a **Warm Glassmorphism** approach. It combines the "Mood First" philosophy with high-transparency layers, frosted glass backgrounds, and organic, fluid depth. Unlike cold, clinical glassmorphism, this iteration uses warm-tinted blurs and soft earthy backgrounds to create a tactile, inviting environment that feels like a modern bistro or a high-end kitchen.

## Colors
The palette is anchored by a vibrant **Culinary Orange (#E65100)** as the primary action color, chosen for its psychological connection to hunger and energy. The secondary orange provides variance for accents and highlights.

Surface colors transition from a primary **Warm Cream (#FFF8F1)** background to soft earthy neutrals. Neutral tones are slightly warmed (tinted with brown) rather than pure greys to maintain the organic feel. Success, warning, and error states should be softened—using sage greens and deep ambers rather than harsh neon tones—to align with the natural culinary theme.

## Typography
Typography balances the expressive, friendly nature of **Outfit** with the technical precision of **JetBrains Mono**. 

- **Outfit** is used for all narrative and structural elements. Headlines should use tighter letter-spacing and heavier weights to command attention.
- **JetBrains Mono** is reserved strictly for metadata, nutritional information, pricing, and technical specifications, providing a clean, "receipt-like" contrast to the organic layout.

Ensure a clear hierarchy where food names (Headlines) are significantly more prominent than the secondary data labels.

## Layout & Spacing
The layout follows a **Fluid Grid** philosophy with generous white space (or "cream space") to allow food photography to breathe. 

- **Mobile:** 4-column grid with 16px margins.
- **Desktop:** 12-column grid with 64px margins.

Spacing is based on an 8px root scale. Use `lg` and `xl` spacing for section breaks to create a high-end editorial feel. Components like cards should use `md` padding internally to maintain the soft, approachable aesthetic.

## Elevation & Depth
Depth is achieved through **Warm Glassmorphism** rather than traditional drop shadows.

- **Surface Layers:** Use a background blur (12px to 20px) combined with a high-transparency white/cream fill (alpha 0.6 - 0.8).
- **Glass Borders:** Instead of dark outlines, use a subtle 1px inner border with a light, semi-transparent highlight to simulate the edge of glass.
- **Shadows:** When shadows are required for extreme elevation (e.g., floating action buttons), use a long, soft diffusion with a color tint derived from the primary orange (#E65100) at very low opacity (10%) to keep the glow "delicious" rather than muddy.

## Shapes
In line with the "Mood First" philosophy, this design system uses a **Full-Round** shape language. 

All buttons, input fields, and tags are rendered as pill-shapes. Larger containers and cards use a minimum of 2rem (32px) corner radius to evoke an organic, friendly, and soft feeling. Avoid sharp corners entirely to maintain the appetizing and approachable culinary aesthetic.

## Components
- **Buttons:** Primary buttons are pill-shaped, using the primary orange background with white text. Hover states should include a subtle scale increase (1.02x) rather than a simple color shift.
- **Chips/Filters:** Use the primary orange at 10% opacity for the background with a high-contrast orange text. Ensure JetBrains Mono is used for filter counts.
- **Cards:** Food cards must feature edge-to-edge photography with the content overlayed on a glassmorphic bottom-anchored container. 
- **Input Fields:** Search bars and inputs should be pill-shaped with a soft cream background and a 1px border that glows orange on focus.
- **Lists:** Ingredient lists use JetBrains Mono for measurements (e.g., "500g") and Outfit for the item name to create clear visual separation.
- **Featured Menu Items:** Use an oversized "Floating Glass" component that breaks the grid slightly to draw attention to specials.