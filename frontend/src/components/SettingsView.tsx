import type { FormEvent } from 'react';
import type { AuditLogRow, AuthUser, ManagedUser, WorkerSummary } from '../types';
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
  draft,
  editingUserId,
  isSavingUser,
  passwordDraft,
  isChangingPassword,
  onSubmit,
  onPasswordSubmit,
  onFieldChange,
  onPasswordFieldChange,
  onStartEdit,
  onCancelEdit,
  onCancelPasswordEdit,
  onToggleUserStatus,
  onDeleteUser,
  onLogout,
}: {
  currentUser: AuthUser;
  users: ManagedUser[];
  workers: WorkerSummary[];
  auditLogs: AuditLogRow[];
  draft: UserDraft;
  editingUserId: string | null;
  isSavingUser: boolean;
  passwordDraft: PasswordChangeDraft;
  isChangingPassword: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onPasswordSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onFieldChange: (field: keyof UserDraft, value: string) => void;
  onPasswordFieldChange: (field: keyof PasswordChangeDraft, value: string) => void;
  onStartEdit: (userId: string) => void;
  onCancelEdit: () => void;
  onCancelPasswordEdit: () => void;
  onToggleUserStatus: (userId: string, status: 'ACTIVE' | 'INACTIVE') => void;
  onDeleteUser: (userId: string) => void;
  onLogout: () => void;
}) {
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
                        <UiIcon name="activity" />
                        <span>Audit activity</span>
                      </h3>
                      <p>Recent administrative actions across users, jobs, properties and documents.</p>
                    </div>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={exportAuditLogs}
                      disabled={!auditLogs.length}
                    >
                      <UiIcon name="download" />
                      Export CSV
                    </button>
                  </div>

                  {auditLogs.length ? (
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
