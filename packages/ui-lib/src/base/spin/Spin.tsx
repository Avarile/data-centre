import { cn } from '../../shadcn';

/**
 * Cybernetics inline spinner.
 *
 * Geometry is taken verbatim from the brand mark
 * (`designs/cybernetics-data/cybernetics-data-mark-color.svg`): a 277deg arc
 * (`stroke-dasharray="58 18"` on a r=12 circle) around a centre dot.
 *
 * This is the small-size variant of the mark by design — the three-bar glyph
 * only reads at roughly 64px and up, so the brand sheet ships a centre dot for
 * small sizes instead. Use `CyberneticsLoader` for page-level surfaces.
 *
 * Colour comes from `currentColor`, so the spinner stays legible on primary
 * buttons, in menus, in destructive dialogs, and in both themes.
 */
export const Spin: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <svg className={cn('animate-spin h-5 w-5', className)} viewBox="0 0 32 32">
      <circle
        cx="16"
        cy="16"
        r="12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeDasharray="58 18"
        transform="rotate(-58 16 16)"
      />
      <circle cx="16" cy="16" r="3.2" fill="currentColor" />
    </svg>
  );
};
