import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SectionHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Optional section number (e.g., "01", "02") */
  number?: string;
  /** Section label (e.g., "identity", "settings") */
  label: string;
  /** Optional action element on the right side */
  action?: React.ReactNode;
  /** Show teal dot marker instead of "//" prefix */
  showDot?: boolean;
}

const SectionHeader = React.forwardRef<HTMLDivElement, SectionHeaderProps>(
  ({ className, number, label, action, showDot = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('section-header flex items-center justify-between', className)}
      {...props}
    >
      <span className="flex items-center gap-2">
        {showDot ? (
          <span className="marker-dot" />
        ) : (
          <span className="text-muted-foreground/60">//</span>
        )}
        {number && <span>{number}</span>}
        <span>{label}</span>
      </span>
      {action && <div className="ml-auto">{action}</div>}
    </div>
  )
);
SectionHeader.displayName = 'SectionHeader';

export { SectionHeader };
