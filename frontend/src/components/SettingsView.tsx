import type { FormEvent } from 'react';
import type { AuthUser, ManagedUser } from '../types';
import { UiIcon } from './UiIcon';

type UserDraft = {
  username: string;
  displayName: string;
  password: string;
  role: AuthUser['role'];
};

export function SettingsView({
  currentUser,
  users,
  draft,
  isSavingUser,
  onSubmit,
  onFieldChange,
  onToggleUserStatus,
  onDeleteUser,
  onLogout,
}: {
  currentUser: AuthUser;
  users: ManagedUser[];
  draft: UserDraft;
  isSavingUser: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onFieldChange: (field: keyof UserDraft, value: string) => void;
  onToggleUserStatus: (userId: string, status: 'ACTIVE' | 'INACTIVE') => void;
  onDeleteUser: (userId: string) => void;
  onLogout: () => void;
}) {
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
                <span>Protected settings</span>
              </h3>
            </div>
            <span className="pill tone-success">Admin only</span>
          </div>

          <div className="settings-admin-grid">
            <div className="settings-admin-card">
              <div className="panel-head">
                <div>
                  <h3 className="title-with-icon title-with-icon--sm">
                    <UiIcon name="userPlus" />
                    <span>Register a user</span>
                  </h3>
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
                  />
                </label>

                <label>
                  Password
                  <input
                    type="password"
                    value={draft.password}
                    onChange={(event) => onFieldChange('password', event.target.value)}
                    placeholder="At least 6 characters"
                  />
                </label>

                <label>
                  Role
                  <select value={draft.role} onChange={(event) => onFieldChange('role', event.target.value)}>
                    <option value="ADMIN">Admin</option>
                    <option value="OFFICE">Office</option>
                    <option value="WORKER">Worker</option>
                    <option value="VIEWER">Viewer</option>
                  </select>
                </label>

                <div className="actions-row span-2">
                  <button type="submit" disabled={isSavingUser}>
                    <UiIcon name="userPlus" />
                    {isSavingUser ? 'Creating...' : 'Create user'}
                  </button>
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
                    return (
                      <article key={user.id} className="settings-users-table settings-users-table--row">
                        <div className="settings-user-cell settings-user-cell--name">
                          <div>
                            <strong>{user.displayName}</strong>
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

        </div>
      </div>
    </section>
  );
}
