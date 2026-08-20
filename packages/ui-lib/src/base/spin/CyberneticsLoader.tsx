import { cn } from '../../shadcn';

/**
 * Cybernetics brand loader — the full mark for page-level loading surfaces.
 *
 * The three-bar glyph stays static while the arc rotates around it, matching
 * the reference animation in
 * `designs/loading-svg/cybernetics-data/cybernetics-data-loader-{light,dark}.gif`
 * (32 frames, 1.6s, a plain rotation of the arc).
 *
 * Defaults to 64px because the bars stop reading below roughly that size — for
 * inline sizes (12-24px) use `Spin`, which is the centre-dot variant of the
 * same mark. Colour comes from `currentColor` in both cases.
 */
export const CyberneticsLoader: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <svg className={cn('size-16', className)} viewBox="0 0 32 32">
      <g
        className="animate-spin"
        style={{ transformBox: 'view-box', transformOrigin: '16px 16px' }}
      >
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
      </g>
      <rect x="10" y="10.6" width="12" height="2.4" fill="currentColor" />
      <rect x="10" y="14.8" width="8" height="2.4" fill="currentColor" />
      <rect x="10" y="19" width="5" height="2.4" fill="currentColor" />
    </svg>
  );
};
