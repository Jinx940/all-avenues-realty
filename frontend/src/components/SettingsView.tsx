import { useState, type FormEvent } from 'react';
import type {
  AuditLogRow,
  AuthUser,
  ManagedUser,
  PhotoStorageAuditPayload,
  StorageBackupOverviewPayload,
  StorageBackupSyncPayload,
  WorkerSummary,
} from '../types';
import { downloadCsv } from '../lib/csv';
import { PasswordField } from './PasswordField';
import { UiIcon } from './UiIcon';

type UserDraft = {
  username: string;
  displayName: string;
  password: string;
  role: AuthUser['role'];
  workerId: string;
};

type PasswordChangeDraft = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export function SettingsView({
  currentUser,
  users,
  workers,
  auditLogs,
  photoAudit,
  storageBackupOverview,
  storageBackupResult,
  draft,
  editingUserId,
  isSavingUser,
  passwordDraft,
  isChangingPassword,
  isRunningPhotoAudit,
  isSyncingStorageBackups,
  onSubmit,
  onPasswordSubmit,
  onRunPhotoAudit,
  onSyncStorageBackups,
  onFieldChange,
  onPasswordFieldChange,
  onStartEdit,
  onCancelEdit,
  onCancelPasswordEdit,
  onToggleUserStatus,
  onDeleteUser,
  onClearAuditLogs,
  onLogout,
}: {
  currentUser: AuthUser;
  users: ManagedUser[];
  workers: WorkerSummary[];
  auditLogs: AuditLogRow[];
  photoAudit: PhotoStorageAuditPayload | null;
  storageBackupOverview: StorageBackupOverviewPayload | null;
  storageBackupResult: StorageBackupSyncPayload | null;
  draft: UserDraft;
  editingUserId: string | null;
  isSavingUser: boolean;
  passwordDraft: PasswordChangeDraft;
  isChangingPassword: boolean;
  isRunningPhotoAudit: boolean;
  isSyncingStorageBackups: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onPasswordSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRunPhotoAudit: () => void;
  onSyncStorageBackups: () => void;
  onFieldChange: (field: keyof UserDraft, value: string) => void;
  onPasswordFieldChange: (field: keyof PasswordChangeDraft, value: string) => void;
  onStartEdit: (userId: string) => void;
  onCancelEdit: () => void;
  onCancelPasswordEdit: () => void;
  onToggleUserStatus: (userId: string, status: 'ACTIVE' | 'INACTIVE') => void;
  onDeleteUser: (userId: string) => void;
  onClearAuditLogs: () => void;
  onLogout: () => void;
}) {
  const [isAuditHistoryOpen, setIsAuditHistoryOpen] = useState(false);
  const [isPhotoAuditOpen, setIsPhotoAuditOpen] = useState(false);
  const isEditing = Boolean(editingUserId);
  const isAdmin = currentUser.role === 'ADMIN';
  const activeUsers = users.filter((user) => user.status === 'ACTIVE').length;
  const linkedUsers = users.filter((user) => user.linkedWorker).length;
  const recentAuditCount = auditLogs.length;
  const exportDate = new Date().toISOString().slice(0, 10);

  const exportUsers = () => {
    downloadCsv(`workspace-users-${exportDate}.csv`, [
      ['Display name', 'Username', 'Role', 'Status', 'Linked worker', 'Created', 'Updated'],
      ...users.map((user) => [
        user.displayName,
        user.username,
        user.role,
        user.status,
        user.linkedWorker?.name ?? '',
        new Date(user.createdAt).toISOString(),
        new Date(user.updatedAt).toISOString(),
      ]),
    ]);
  };

  const exportAuditLogs = () => {
    downloadCsv(`workspace-audit-${exportDate}.csv`, [
      ['Date', 'Entity type', 'Action', 'Entity label', 'Summary', 'Performed by'],
      ...auditLogs.map((item) => [
        new Date(item.date).toISOString(),
        item.entityType,
        item.action,
        item.entityLabel ?? '',
        item.summary,
        item.performedBy,
      ]),
    ]);
  };

  const exportPhotoAudit = () => {
    if (!photoAudit) return;

    downloadCsv(`photo-storage-audit-${exportDate}.csv`, [
      [
        'Status',
        'Kind',
        'Category',
        'Storage',
        'Property',
        'Location',
        'File name',
        'Stored ref',
        'Created',
        'Message',
      ],
      ...photoAudit.missingItems.map((item) => [
        item.status,
        item.kind,
        item.category,
        item.storage,
        item.propertyName,
        item.locationLabel,
        item.fileName,
        item.storedRef,
        item.createdAt ? new Date(item.createdAt).toISOString() : '',
        item.message ?? '',
      ]),
      ...photoAudit.recoveredItems.map((item) => [
        item.status,
        item.kind,
        item.category,
        item.storage,
        item.propertyName,
        item.locationLabel,
        item.fileName,
        item.storedRef,
        item.createdAt ? new Date(item.createdAt).toISOString() : '',
        item.message ?? '',
      ]),
    ]);
  };

  const exportStorageBackupResult = () => {
    if (!storageBackupResult) return;

    downloadCsv(`storage-backup-sync-${exportDate}.csv`, [
      ['Kind', 'Item id', 'Original name', 'Stored ref', 'Message'],
      ...storageBackupResult.missingItems.map((item) => [
        item.kind,
        item.id,
        item.originalName,
        item.storedRef,
        item.message ?? '',
      ]),
    ]);
  };

  return (
    <section className="tab-panel">
      <div className="panel records-filter-panel settings-shell settings-shell--compact">
        <div className="settings-panel-head settings-panel-head--compact">
          <div>
            <h2 className="title-with-icon">
              <UiIcon name="settings" />
              <span>Settings</span>
            </h2>
          </div>
          <div className="page-actions">
            <span className="pill tone-success">{currentUser.role}</span>
            <button type="button" className="ghost-button" onClick={onLogout}>
              <UiIcon name="lock" />
              Sign out
            </button>
          </div>
        </div>

        <div className="settings-main-card">
          <div className="settings-card-head settings-card-head--compact">
            <div>
              <h3 className="title-with-icon title-with-icon--sm">
                <UiIcon name="shield" />
                <span>Account & settings</span>
              </h3>
              <p>
                Update your own access here. Admin accounts can also manage users, audit logs and
                exports.
              </p>
            </div>
          </div>

          <div className="settings-section-stack">
            <article className="settings-admin-card">
              <div className="panel-head">
                <div>
                  <h3 className="title-with-icon title-with-icon--sm">
                    <UiIcon name="lock" />
                    <span>My password</span>
                  </h3>
                  <p>Change your password without leaving the workspace.</p>
                </div>
              </div>

              <form className="form-grid" onSubmit={onPasswordSubmit}>
                <PasswordField
                  label="Current password"
                  value={passwordDraft.currentPassword}
                  onChange={(value) => onPasswordFieldChange('currentPassword', value)}
                  placeholder="Enter your current password"
                  autoComplete="current-password"
                />

                <PasswordField
                  label="New password"
                  value={passwordDraft.newPassword}
                  onChange={(value) => onPasswordFieldChange('newPassword', value)}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                />

                <PasswordField
                  label="Confirm new password"
                  value={passwordDraft.confirmPassword}
                  onChange={(value) => onPasswordFieldChange('confirmPassword', value)}
                  placeholder="Repeat the new password"
                  autoComplete="new-password"
                />

                <label>
                  Signed in as
                  <input value={`${currentUser.displayName} (@${currentUser.username})`} disabled />
                  <small className="settings-field-note">
                    When the password changes, other active sessions will be closed automatically.
                  </small>
                </label>

                <div className="actions-row span-2">
                  <button type="submit" disabled={isChangingPassword}>
                    <UiIcon name="lock" />
                    {isChangingPassword ? 'Updating...' : 'Update password'}
                  </button>
                  <button type="button" className="ghost-button" onClick={onCancelPasswordEdit}>
                    <UiIcon name="refresh" />
                    Clear
                  </button>
                </div>
              </form>
            </article>

            {isAdmin ? (
              <>
                <div className="settings-helper-grid">
                  <article className="settings-helper-item">
                    <strong>{users.length}</strong>
                    <p>{activeUsers} active accounts in the workspace.</p>
                  </article>
                  <article className="settings-helper-item">
                    <strong>{linkedUsers}</strong>
                    <p>Users already linked to a worker profile.</p>
                  </article>
                  <article className="settings-helper-item">
                    <strong>{recentAuditCount}</strong>
                    <p>Recent audit entries ready for review.</p>
                  </article>
                </div>

                <div className="settings-admin-grid">
                  <div className="settings-admin-card">
                    <div className="panel-head">
                      <div>
                        <h3 className="title-with-icon title-with-icon--sm">
                          <UiIcon name={isEditing ? 'refresh' : 'userPlus'} />
                          <span>{isEditing ? 'Edit user' : 'Register a user'}</span>
                        </h3>
                        <p>
                          {isEditing
                            ? 'Update access, worker link and optionally reset the password.'
                            : 'Create a new account and assign a role for this workspace.'}
                        </p>
                      </div>
                    </div>

                    <form className="form-grid" onSubmit={onSubmit}>
                      <label>
                        Display Name
                        <input
                          value={draft.displayName}
                          onChange={(event) => onFieldChange('displayName', event.target.value)}
                          placeholder="Example: Manuel Office"
                        />
                      </label>

                      <label>
                        Username
                        <input
                          value={draft.username}
                          onChange={(event) => onFieldChange('username', event.target.value)}
                          placeholder="example.user"
                          disabled={isEditing}
                        />
                        <small className="settings-field-note">
                          {isEditing
                            ? 'Username stays fixed to keep sign-in references stable.'
                            : 'Use a unique login name for the account.'}
                        </small>
                      </label>

                      <PasswordField
                        label={isEditing ? 'New Password' : 'Password'}
                        value={draft.password}
                        onChange={(value) => onFieldChange('password', value)}
                        placeholder={isEditing ? 'Leave blank to keep the current password' : 'At least 6 characters'}
                      />

                      <label>
                        Role
                        <select value={draft.role} onChange={(event) => onFieldChange('role', event.target.value)}>
                          <option value="ADMIN">Admin</option>
                          <option value="OFFICE">Office</option>
                          <option value="WORKER">Worker</option>
                          <option value="VIEWER">Viewer</option>
                        </select>
                      </label>

                      <label className="span-2">
                        Linked worker
                        <select
                          value={draft.workerId}
                          onChange={(event) => onFieldChange('workerId', event.target.value)}
                          disabled={draft.role !== 'WORKER'}
                          required={draft.role === 'WORKER'}
                        >
                          <option value="">
                            {draft.role === 'WORKER'
                              ? 'Select a linked worker'
                              : 'Available only when role is Worker'}
                          </option>
                          {workers.map((worker) => (
                            <option key={worker.id} value={worker.id}>
                              {worker.name} - {worker.statusLabel}
                            </option>
                          ))}
                        </select>
                        <small className="settings-field-note">
                          {draft.role === 'WORKER'
                            ? 'Worker accounts must stay linked so assignments and permissions line up correctly.'
                            : 'Switch the role to Worker if this account should be tied to a crew member.'}
                        </small>
                      </label>

                      <div className="actions-row span-2">
                        <button type="submit" disabled={isSavingUser}>
                          <UiIcon name={isEditing ? 'refresh' : 'userPlus'} />
                          {isSavingUser
                            ? isEditing
                              ? 'Saving...'
                              : 'Creating...'
                            : isEditing
                              ? 'Save changes'
                              : 'Create user'}
                        </button>
                        {isEditing ? (
                          <button type="button" className="ghost-button" onClick={onCancelEdit}>
                            <UiIcon name="close" />
                            Cancel
                          </button>
                        ) : null}
                      </div>
                    </form>
                  </div>

                  <div className="settings-admin-card">
                    <div className="panel-head">
                      <div>
                        <h3 className="title-with-icon title-with-icon--sm">
                          <UiIcon name="users" />
                          <span>Current users</span>
                        </h3>
                      </div>
                      <button type="button" className="ghost-button" onClick={exportUsers} disabled={!users.length}>
                        <UiIcon name="download" />
                        Export CSV
                      </button>
                    </div>

                    <div className="settings-users-table-shell">
                      <div className="settings-users-table settings-users-table--header">
                        <span>Name</span>
                        <span>Username</span>
                        <span>Status</span>
                        <span>Role</span>
                        <span>Linked worker</span>
                        <span>Created</span>
                        <span>Actions</span>
                      </div>

                      {users.length ? (
                        users.map((user) => {
                          const isActive = user.status === 'ACTIVE';
                          const isCurrentEditing = user.id === editingUserId;

                          return (
                            <article key={user.id} className="settings-users-table settings-users-table--row">
                              <div className="settings-user-cell settings-user-cell--name">
                                <div>
                                  <strong>{user.displayName}</strong>
                                  {user.id === currentUser.id ? (
                                    <small className="settings-field-note">Current session</small>
                                  ) : null}
                                </div>
                              </div>

                              <div className="settings-user-cell">
                                <span className="settings-user-inline">@{user.username}</span>
                              </div>

                              <div className="settings-user-cell">
                                <span className={`pill ${isActive ? 'tone-success' : 'tone-neutral'}`}>
                                  {user.status}
                                </span>
                              </div>

                              <div className="settings-user-cell">
                                <span className="pill tone-lilac">{user.role}</span>
                              </div>

                              <div className="settings-user-cell">
                                <span className="settings-user-inline">
                                  {user.linkedWorker?.name ?? 'None'}
                                </span>
                              </div>

                              <div className="settings-user-cell">
                                <span className="settings-user-inline">
                                  {new Date(user.createdAt).toLocaleDateString('en-US')}
                                </span>
                              </div>

                              <div className="settings-user-actions">
                                <button
                                  type="button"
                                  className={`ghost-button ${isCurrentEditing ? 'is-active' : ''}`}
                                  onClick={() => onStartEdit(user.id)}
                                >
                                  <UiIcon name="refresh" />
                                  {isCurrentEditing ? 'Editing' : 'Edit'}
                                </button>
                                <button
                                  type="button"
                                  className="ghost-button"
                                  onClick={() => onToggleUserStatus(user.id, isActive ? 'INACTIVE' : 'ACTIVE')}
                                >
                                  <UiIcon name={isActive ? 'userMinus' : 'userCheck'} />
                                  {isActive ? 'Disable' : 'Enable'}
                                </button>
                                {user.id !== currentUser.id ? (
                                  <button
                                    type="button"
                                    className="ghost-button danger"
                                    onClick={() => onDeleteUser(user.id)}
                                  >
                                    <UiIcon name="trash" />
                                    Delete
                                  </button>
                                ) : null}
                              </div>
                            </article>
                          );
                        })
                      ) : (
                        <div className="empty-box">No users created yet.</div>
                      )}
                    </div>
                  </div>
                </div>

                <article className="settings-admin-card settings-admin-card--full">
                  <div className="panel-head">
                    <div>
                      <h3 className="title-with-icon title-with-icon--sm">
                        <UiIcon name="image" />
                        <span>Photo storage audit</span>
                      </h3>
                      <p>
                        Check managed photos and covers, detect missing files and flag images
                        recovered from legacy upload paths.
                      </p>
                    </div>
                    <div className="settings-admin-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => setIsPhotoAuditOpen((current) => !current)}
                      >
                        <UiIcon name="image" />
                        {isPhotoAuditOpen ? 'Hide audit' : 'Show audit'}
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={onSyncStorageBackups}
                        disabled={isSyncingStorageBackups}
                      >
                        <UiIcon name="shield" />
                        {isSyncingStorageBackups ? 'Creating copies...' : 'Create backup copies'}
                      </button>
                      <button type="button" onClick={onRunPhotoAudit} disabled={isRunningPhotoAudit}>
                        <UiIcon name="refresh" />
                        {isRunningPhotoAudit ? 'Checking...' : 'Run audit'}
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={exportPhotoAudit}
                        disabled={!photoAudit}
                      >
                        <UiIcon name="download" />
                        Export CSV
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={exportStorageBackupResult}
                        disabled={!storageBackupResult}
                      >
                        <UiIcon name="download" />
                        Export backup CSV
                      </button>
                    </div>
                  </div>

                  <div className="settings-history-summary">
                    {photoAudit ? (
                      <p>
                        {photoAudit.summary.missingPhotos} missing photo file(s) and{' '}
                        {photoAudit.summary.recoveredFromLegacyPath} recovered item(s){' '}
                        {isPhotoAuditOpen ? 'visible below.' : 'hidden to keep this section compact.'}
                      </p>
                    ) : storageBackupOverview ? (
                      <p>
                        {storageBackupOverview.summary.managedRefs} managed ref(s) tracked and{' '}
                        {storageBackupOverview.summary.unbackedManagedRefs} still missing a backup copy.
                      </p>
                    ) : (
                      <p>Run the audit or create backup copies to inspect managed file coverage.</p>
                    )}
                  </div>

                  {isPhotoAuditOpen ? (
                    <>
                      {storageBackupResult ? (
                        <div className="settings-helper-grid">
                          <article className="settings-helper-item">
                            <strong>{storageBackupResult.summary.createdBackups}</strong>
                            <p>New backup copies created in the latest sync.</p>
                          </article>
                          <article className="settings-helper-item">
                            <strong>{storageBackupResult.summary.alreadyBackedUp}</strong>
                            <p>Files already protected by a database copy.</p>
                          </article>
                          <article className="settings-helper-item">
                            <strong>{storageBackupResult.summary.missingSources}</strong>
                            <p>Files that could not be copied because the source is already missing.</p>
                          </article>
                          <article className="settings-helper-item">
                            <strong>{Math.round(storageBackupResult.summary.totalBytesStored / 1024)}</strong>
                            <p>KB written into backup storage in the latest sync.</p>
                          </article>
                        </div>
                      ) : null}

                      {storageBackupOverview ? (
                        <div className="settings-helper-grid">
                          <article className="settings-helper-item">
                            <strong>{storageBackupOverview.summary.managedRefs}</strong>
                            <p>Managed file refs currently tracked across jobs and property covers.</p>
                          </article>
                          <article className="settings-helper-item">
                            <strong>{storageBackupOverview.summary.backupRows}</strong>
                            <p>Backup rows stored inside the database.</p>
                          </article>
                          <article className="settings-helper-item">
                            <strong>{storageBackupOverview.summary.unbackedManagedRefs}</strong>
                            <p>Managed refs still missing a backup copy.</p>
                          </article>
                          <article className="settings-helper-item">
                            <strong>{storageBackupOverview.summary.compressionRatio}%</strong>
                            <p>Average space saved by compression across backed-up files.</p>
                          </article>
                        </div>
                      ) : null}

                      {storageBackupOverview ? (
                        <p className="settings-field-note">
                          Backup footprint: {Math.round(storageBackupOverview.summary.totalStoredBytes / 1024)} KB stored
                          from {Math.round(storageBackupOverview.summary.totalOriginalBytes / 1024)} KB original. Saved{' '}
                          {Math.round(storageBackupOverview.summary.spaceSavedBytes / 1024)} KB. Last summary:{' '}
                          {new Date(storageBackupOverview.checkedAt).toLocaleString('en-US')}.
                        </p>
                      ) : null}

                      {photoAudit ? (
                        <>
                          <div className="settings-helper-grid">
                            <article className="settings-helper-item">
                              <strong>{photoAudit.summary.totalPhotos}</strong>
                              <p>Managed photos checked.</p>
                            </article>
                            <article className="settings-helper-item">
                              <strong>{photoAudit.summary.missingPhotos}</strong>
                              <p>Missing files still referenced by the database.</p>
                            </article>
                            <article className="settings-helper-item">
                              <strong>{photoAudit.summary.recoveredFromLegacyPath}</strong>
                              <p>Files found in a legacy uploads path.</p>
                            </article>
                            <article className="settings-helper-item">
                              <strong>{photoAudit.summary.externalCoverUrls}</strong>
                              <p>External cover URLs excluded from the audit.</p>
                            </article>
                          </div>

                          <div className="settings-helper-grid">
                            <article className="settings-helper-item">
                              <strong>{photoAudit.summary.totalJobPhotos}</strong>
                              <p>Job photos reviewed.</p>
                            </article>
                            <article className="settings-helper-item">
                              <strong>{photoAudit.summary.missingJobPhotos}</strong>
                              <p>Missing job photos.</p>
                            </article>
                            <article className="settings-helper-item">
                              <strong>{photoAudit.summary.totalPropertyCovers}</strong>
                              <p>Managed property covers reviewed.</p>
                            </article>
                            <article className="settings-helper-item">
                              <strong>{photoAudit.summary.missingPropertyCovers}</strong>
                              <p>Missing managed covers.</p>
                            </article>
                          </div>

                          <p className="settings-field-note">
                            Last check: {new Date(photoAudit.checkedAt).toLocaleString('en-US')}. Local
                            refs: {photoAudit.summary.localRefs}. Supabase refs:{' '}
                            {photoAudit.summary.supabaseRefs}.
                          </p>

                          {photoAudit.missingItems.length ? (
                            <div className="settings-audit-list">
                              {photoAudit.missingItems.map((item) => (
                                <article key={`missing-${item.kind}-${item.fileId ?? item.propertyId}`} className="settings-audit-item">
                                  <div className="settings-audit-main">
                                    <div className="settings-audit-topline">
                                      <span className="pill tone-danger">Missing</span>
                                      <span className="pill tone-neutral">{item.category}</span>
                                      <span className="pill tone-sky">{item.storage}</span>
                                    </div>
                                    <strong>{item.locationLabel}</strong>
                                    <p>
                                      {item.fileName} {item.message ? `- ${item.message}` : ''}
                                    </p>
                                  </div>
                                </article>
                              ))}
                            </div>
                          ) : (
                            <div className="empty-box">No missing managed photos were detected in the latest audit.</div>
                          )}

                          {photoAudit.recoveredItems.length ? (
                            <div className="settings-audit-list">
                              {photoAudit.recoveredItems.map((item) => (
                                <article key={`recovered-${item.kind}-${item.fileId ?? item.propertyId}`} className="settings-audit-item">
                                  <div className="settings-audit-main">
                                    <div className="settings-audit-topline">
                                      <span className="pill tone-success">Recovered</span>
                                      <span className="pill tone-neutral">{item.category}</span>
                                      <span className="pill tone-sky">{item.storage}</span>
                                    </div>
                                    <strong>{item.locationLabel}</strong>
                                    <p>
                                      {item.fileName} {item.message ? `- ${item.message}` : ''}
                                    </p>
                                  </div>
                                </article>
                              ))}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <div className="empty-box">
                          Run the audit to see which managed photos are missing and which ones were
                          recovered from legacy upload paths.
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="settings-history-collapsed">
                      <span className="pill tone-neutral">Collapsed</span>
                    </div>
                  )}
                </article>

                <article className="settings-admin-card settings-admin-card--full">
                  <div className="panel-head">
                    <div>
                      <h3 className="title-with-icon title-with-icon--sm">
                        <UiIcon name="activity" />
                        <span>Audit activity</span>
                      </h3>
                      <p>Recent administrative actions across users, jobs, properties and documents.</p>
                    </div>
                    <div className="settings-admin-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => setIsAuditHistoryOpen((current) => !current)}
                      >
                        <UiIcon name="activity" />
                        {isAuditHistoryOpen ? 'Hide history' : 'Show history'}
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={exportAuditLogs}
                        disabled={!auditLogs.length}
                      >
                        <UiIcon name="download" />
                        Export CSV
                      </button>
                      <button
                        type="button"
                        className="ghost-button danger"
                        onClick={onClearAuditLogs}
                        disabled={!auditLogs.length}
                      >
                        <UiIcon name="trash" />
                        Delete history
                      </button>
                    </div>
                  </div>

                  <div className="settings-history-summary">
                    {auditLogs.length ? (
                      <p>
                        {recentAuditCount} audit entr{recentAuditCount === 1 ? 'y' : 'ies'}{' '}
                        {isAuditHistoryOpen ? 'visible below.' : 'hidden to keep this section compact.'}
                      </p>
                    ) : (
                      <p>No audit activity recorded yet.</p>
                    )}
                  </div>

                  {isAuditHistoryOpen ? (
                    auditLogs.length ? (
                      <div className="settings-audit-list">
                        {auditLogs.map((item) => (
                          <article key={item.id} className="settings-audit-item">
                            <div className="settings-audit-main">
                              <div className="settings-audit-topline">
                                <span className="pill tone-sky">{item.entityType}</span>
                                <span className="pill tone-neutral">{item.action}</span>
                                <span className="settings-user-inline">
                                  {new Date(item.date).toLocaleString('en-US')}
                                </span>
                              </div>
                              <strong>{item.summary}</strong>
                              <p>
                                {item.entityLabel ? `${item.entityLabel} - ` : ''}
                                by {item.performedBy}
                              </p>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-box">No audit activity recorded yet.</div>
                    )
                  ) : (
                    <div className="settings-history-collapsed">
                      <span className="pill tone-neutral">Collapsed</span>
                    </div>
                  )}
                </article>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
