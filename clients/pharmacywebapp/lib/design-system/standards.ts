/**
 * Design System Standards
 * Guidelines and standards for component usage across the application
 */

import { designTokens, componentTokens } from './tokens'

export const designStandards = {
  // Layout Standards
  layout: {
    containerMaxWidth: '1280px',
    containerPadding: designTokens.spacing.md,
    sectionGap: designTokens.spacing['2xl'],
    contentGap: designTokens.spacing.lg,
  },

  // Form Standards
  form: {
    fieldGap: designTokens.spacing.md,
    labelMarginBottom: designTokens.spacing.sm,
    errorMarginTop: designTokens.spacing.xs,
    helpTextMarginTop: designTokens.spacing.xs,
    groupGap: designTokens.spacing.lg,
  },

  // Table Standards
  table: {
    headerHeight: componentTokens.table.rowHeight.md,
    rowHeight: componentTokens.table.rowHeight.md,
    cellPadding: componentTokens.table.cellPadding.md,
    borderColor: 'var(--border)',
    hoverBackground: 'var(--muted)',
    stripedBackground: 'var(--muted)',
  },

  // Card Standards
  card: {
    defaultPadding: componentTokens.card.padding.md,
    defaultGap: componentTokens.card.gap.md,
    defaultShadow: designTokens.shadows.md,
    hoverShadow: designTokens.shadows.lg,
    borderRadius: designTokens.borderRadius.lg,
  },

  // Button Standards
  button: {
    defaultHeight: componentTokens.button.height.md,
    defaultPadding: componentTokens.button.padding.md,
    borderRadius: designTokens.borderRadius.md,
    transition: `all ${designTokens.animation.duration.base} ${designTokens.animation.easing.inOut}`,
  },

  // Input Standards
  input: {
    defaultHeight: componentTokens.input.height.md,
    defaultPadding: componentTokens.input.padding.md,
    borderRadius: designTokens.borderRadius.md,
    borderWidth: '1px',
    focusRingWidth: '2px',
    transition: `all ${designTokens.animation.duration.base} ${designTokens.animation.easing.inOut}`,
  },

  // Modal/Dialog Standards
  modal: {
    defaultMaxWidth: componentTokens.modal.maxWidth.lg,
    defaultPadding: componentTokens.modal.padding,
    overlayBackground: 'rgba(0, 0, 0, 0.5)',
    borderRadius: designTokens.borderRadius.xl,
    animationDuration: designTokens.animation.duration.slow,
  },

  // Badge Standards
  badge: {
    defaultPadding: `${designTokens.spacing.xs} ${designTokens.spacing.sm}`,
    borderRadius: designTokens.borderRadius.full,
    fontSize: designTokens.typography.fontSize.xs[0],
    fontWeight: designTokens.typography.fontWeight.medium,
  },

  // Loading States
  loading: {
    spinnerSize: {
      sm: '1rem',
      md: '1.5rem',
      lg: '2rem',
    },
    skeletonGap: designTokens.spacing.sm,
    skeletonBorderRadius: designTokens.borderRadius.md,
  },

  // Empty States
  emptyState: {
    iconSize: '3rem',
    titleMarginTop: designTokens.spacing.md,
    descriptionMarginTop: designTokens.spacing.sm,
    actionMarginTop: designTokens.spacing.lg,
  },

  // Error States
  error: {
    iconSize: '2rem',
    messageMarginTop: designTokens.spacing.sm,
    actionMarginTop: designTokens.spacing.md,
  },
} as const

// Spacing utility classes mapping
export const spacingClasses = {
  // Padding
  p: {
    xs: 'p-1',
    sm: 'p-2',
    md: 'p-4',
    lg: 'p-6',
    xl: 'p-8',
    '2xl': 'p-10',
  },
  // Margin
  m: {
    xs: 'm-1',
    sm: 'm-2',
    md: 'm-4',
    lg: 'm-6',
    xl: 'm-8',
    '2xl': 'm-10',
  },
  // Gap
  gap: {
    xs: 'gap-1',
    sm: 'gap-2',
    md: 'gap-4',
    lg: 'gap-6',
    xl: 'gap-8',
    '2xl': 'gap-10',
  },
} as const

// Typography utility classes
export const typographyClasses = {
  heading: {
    h1: 'text-4xl font-bold',
    h2: 'text-3xl font-semibold',
    h3: 'text-2xl font-semibold',
    h4: 'text-xl font-semibold',
    h5: 'text-lg font-medium',
    h6: 'text-base font-medium',
  },
  body: {
    large: 'text-lg',
    base: 'text-base',
    small: 'text-sm',
    xs: 'text-xs',
  },
} as const

