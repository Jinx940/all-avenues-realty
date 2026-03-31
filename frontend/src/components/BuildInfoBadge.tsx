import { appBuildInfo, buildInfoSummary, buildInfoTooltip } from '../lib/buildInfo';
import { UiIcon } from './UiIcon';

export function BuildInfoBadge({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={['build-info-badge', className].filter(Boolean).join(' ')}
      title={buildInfoTooltip(appBuildInfo)}
    >
      <UiIcon name="spark" size={14} />
      <span>{buildInfoSummary(appBuildInfo)}</span>
    </div>
  );
}
