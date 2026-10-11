/**
 * Design System Tokens
 * Centralized design tokens for consistent styling across the application
 */

export const designTokens = {
  // Spacing Scale (based on 4px base unit)
  spacing: {
    xs: '0.25rem',    // 4px
    sm: '0.5rem',     // 8px
    md: '1rem',       // 16px
    lg: '1.5rem',     // 24px
    xl: '2rem',       // 32px
    '2xl': '2.5rem',  // 40px
    '3xl': '3rem',    // 48px
    '4xl': '4rem',    // 64px
    '5xl': '5rem',    // 80px
  },

  // Typography Scale
  typography: {
    fontFamily: {
      sans: 'var(--font-sans)',
      mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
    },
    fontSize: {
      xs: ['0.75rem', { lineHeight: '1rem' }],      // 12px
      sm: ['0.875rem', { lineHeight: '1.25rem' }],  // 14px
      base: ['1rem', { lineHeight: '1.5rem' }],      // 16px
      lg: ['1.125rem', { lineHeight: '1.75rem' }],  // 18px
      xl: ['1.25rem', { lineHeight: '1.75rem' }],   // 20px
      '2xl': ['1.5rem', { lineHeight: '2rem' }],    // 24px
      '3xl': ['1.875rem', { lineHeight: '2.25rem' }], // 30px
      '4xl': ['2.25rem', { lineHeight: '2.5rem' }], // 36px
      '5xl': ['3rem', { lineHeight: '1' }],         // 48px
    },
    fontWeight: {
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
    },
  },

  // Border Radius
  borderRadius: {
    none: '0',
    sm: '0.25rem',   // 4px
    md: '0.5rem',    // 8px
    lg: '0.75rem',   // 12px
    xl: '1rem',      // 16px
    '2xl': '1.5rem', // 24px
    full: '9999px',
  },

  // Shadows
  shadows: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
    none: 'none',
  },

  // Z-Index Scale
  zIndex: {
    hide: -1,
    base: 0,
    docked: 10,
    dropdown: 1000,
    sticky: 1100,
    banner: 1200,
    overlay: 1300,
    modal: 1400,
    popover: 1500,
    skipLink: 1600,
    toast: 1700,
    tooltip: 1800,
  },

  // Animation Durations
  animation: {
    duration: {
      fast: '150ms',
      base: '200ms',
      slow: '300ms',
      slower: '500ms',
    },
    easing: {
      linear: 'linear',
      in: 'cubic-bezier(0.4, 0, 1, 1)',
      out: 'cubic-bezier(0, 0, 0.2, 1)',
      inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    },
  },

  // Breakpoints (for responsive design)
  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },
} as const

// Component-specific tokens
export const componentTokens = {
  // Button
  button: {
    height: {
      sm: '2rem',   // 32px
      md: '2.5rem', // 40px
      lg: '3rem',   // 48px
    },
    padding: {
      sm: '0.5rem 1rem',
      md: '0.625rem 1.25rem',
      lg: '0.75rem 1.5rem',
    },
  },

  // Input
  input: {
    height: {
      sm: '2rem',
      md: '2.5rem',
      lg: '3rem',
    },
    padding: {
      sm: '0.5rem 0.75rem',
      md: '0.625rem 1rem',
      lg: '0.75rem 1.25rem',
    },
  },

  // Card
  card: {
    padding: {
      sm: '1rem',
      md: '1.5rem',
      lg: '2rem',
    },
    gap: {
      sm: '0.75rem',
      md: '1rem',
      lg: '1.5rem',
    },
  },

  // Table
  table: {
    cellPadding: {
      sm: '0.5rem',
      md: '0.75rem',
      lg: '1rem',
    },
    rowHeight: {
      sm: '2.5rem',
      md: '3rem',
      lg: '3.5rem',
    },
  },

  // Modal/Dialog
  modal: {
    maxWidth: {
      sm: '24rem',  // 384px
      md: '32rem',  // 512px
      lg: '42rem',  // 672px
      xl: '56rem',  // 896px
      '2xl': '72rem', // 1152px
    },
    padding: '1.5rem',
  },
} as const

// Export type-safe helpers
export type SpacingKey = keyof typeof designTokens.spacing
export type TypographySize = keyof typeof designTokens.typography.fontSize
export type BorderRadiusKey = keyof typeof designTokens.borderRadius
export type ShadowKey = keyof typeof designTokens.shadows

