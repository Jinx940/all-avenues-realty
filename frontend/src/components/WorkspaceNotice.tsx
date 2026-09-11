import { UiIcon } from './UiIcon';

export function WorkspaceNotice({ type, children, onDismiss }: {
  type: 'success' | 'error' | 'info';
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  return <div className={`workspace-notice workspace-notice--${type}`} role={type === 'error' ? 'alert' : 'status'}>
    <span className="workspace-notice-icon"><UiIcon name={type === 'success' ? 'userCheck' : type === 'error' ? 'bell' : 'activity'} size={18} /></span>
    <div>{children}</div>
    {onDismiss ? <button type="button" aria-label="Dismiss notification" onClick={onDismiss}><UiIcon name="close" size={16} /></button> : null}
  </div>;
}
