import type { FormEvent } from 'react';
import { UiIcon } from './UiIcon';
import logoMark from '../assets/all-avenues-realty-logo.png';

export function LoginView({
  username,
  password,
  error,
  busy,
  onUsernameChange,
  onPasswordChange,
  onSubmit,
}: {
  username: string;
  password: string;
  error: string;
  busy: boolean;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="login-shell">
      <div className="login-orb login-orb--one" />
      <div className="login-orb login-orb--two" />
      <section className="login-card">
        <div className="login-hero">
          <div className="login-brand">
            <div className="login-brand-copy">
              <p className="page-kicker">Secure Access</p>
              <img className="login-brand-logo" src={logoMark} alt="All Avenues Realty logo" />
            </div>
          </div>

          <div className="login-copy">
            <h2>Protected property operations for your team.</h2>
            <p>
              Access jobs, invoices, quotes and files from one controlled workspace with
              role-based permissions.
            </p>
          </div>

          <div className="login-feature-grid">
            <article className="login-feature-card">
              <span className="login-feature-icon">
                <UiIcon name="briefcase" size={18} />
              </span>
              <div>
                <strong>Job control</strong>
                <p>Track work, assignments, dates and evidence in one place.</p>
              </div>
            </article>

            <article className="login-feature-card">
              <span className="login-feature-icon">
                <UiIcon name="receipt" size={18} />
              </span>
              <div>
                <strong>Document flow</strong>
                <p>Generate invoices and quotes with searchable document history.</p>
              </div>
            </article>

            <article className="login-feature-card">
              <span className="login-feature-icon">
                <UiIcon name="users" size={18} />
              </span>
              <div>
                <strong>Role access</strong>
                <p>Admins manage accounts. Workers only see their assigned work.</p>
              </div>
            </article>
          </div>
        </div>

        <div className="login-panel">
          <div className="login-panel-header">
            <p className="page-kicker">Sign in</p>
            <h2 className="title-with-icon">
              <UiIcon name="lock" />
              <span>Open workspace</span>
            </h2>
            <p>Use your assigned account to access your jobs, documents and property data.</p>
          </div>

          <form className="login-form" onSubmit={onSubmit}>
            <label>
              Username
              <input
                autoComplete="username"
                value={username}
                onChange={(event) => onUsernameChange(event.target.value)}
                placeholder="Enter your username"
              />
            </label>

            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => onPasswordChange(event.target.value)}
                placeholder="Enter your password"
              />
            </label>

            {error ? <div className="flash error">{error}</div> : null}

            <button type="submit" className="login-submit" disabled={busy}>
              <UiIcon name="shield" />
              {busy ? 'Signing in...' : 'Open workspace'}
            </button>
          </form>

          <div className="login-panel-note">
            <UiIcon name="shield" size={16} />
            <span>Accounts are managed by the administrator and protected by role permissions.</span>
          </div>
        </div>
      </section>
    </main>
  );
}
