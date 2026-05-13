import { useEffect, useMemo, useState } from 'react';
import {
  deleteAdminProfile,
  fetchAdminDashboard,
  fetchContactSubmissions,
  markContactSubmissionRead,
  rejectAdminRestaurantApplication,
  rejectAdminRiderApplication,
  setAdminProfileStatus,
  verifyAdminRestaurantApplication,
  verifyAdminRiderApplication,
} from '@repo/api';
import { Logo } from '@repo/ui';
import { formatNpr, USER_ROLES } from '@repo/utils';
import './AdminDashboardPage.css';

const ADMIN_TAB = {
  OVERVIEW: 'overview',
  APPROVALS: 'approvals',
  USERS: 'users',
  MESSAGES: 'messages',
  ANALYTICS: 'analytics',
};

const tabCopy = {
  [ADMIN_TAB.OVERVIEW]: {
    title: 'Platform dashboard',
    description: 'Monitor overall platform health and active operations.',
  },
  [ADMIN_TAB.APPROVALS]: {
    title: 'Verification queue',
    description: 'Review and approve pending restaurant and rider applications.',
  },
  [ADMIN_TAB.USERS]: {
    title: 'User management',
    description: 'Manage platform accounts, roles, and access status.',
  },
  [ADMIN_TAB.MESSAGES]: {
    title: 'Contact messages',
    description: 'View messages submitted through the landing page contact form.',
  },
  [ADMIN_TAB.ANALYTICS]: {
    title: 'Global analytics',
    description: 'Track order volume, revenue trends, and system usage.',
  },
};

function IconGrid() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M16 19c0-2.2-1.8-4-4-4s-4 1.8-4 4" />
      <circle cx="12" cy="8" r="3.5" />
      <path d="M20 18c0-1.8-1.2-3.2-2.8-3.8M4 18c0-1.8 1.2-3.2 2.8-3.8" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 16v-5" />
      <path d="M12 16V8" />
      <path d="M16 16v-7" />
    </svg>
  );
}

function IconMail() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="3" />
      <path d="M2 7l10 6 10-6" />
    </svg>
  );
}

function formatDate(value) {
  if (!value) {
    return 'Unknown date';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function formatStatus(value = '') {
  return String(value || 'pending').replace(/_/g, ' ');
}

function formatVehicleType(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'bicycle') {
    return 'Bicycle';
  }
  if (normalized === 'scooter') {
    return 'Scooter';
  }
  if (normalized === 'motorbike') {
    return 'Motorbike';
  }
  return '';
}

function MetricCard({ label, value, detail }) {
  return (
    <article className="admin-dashboard-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function StatusPill({ status }) {
  return (
    <span className="admin-dashboard-status" data-status={status || 'pending'}>
      {formatStatus(status)}
    </span>
  );
}

function ApplicationCard({
  type,
  title,
  subtitle,
  meta,
  status,
  reason,
  detailItems = [],
  documents = [],
  busy,
  onVerify,
  onReject,
}) {
  return (
    <article className="admin-dashboard-application-card">
      <div>
        <span className="admin-dashboard-kicker">{type}</span>
        <h3>{title}</h3>
        <p>{subtitle}</p>
        <small>{meta}</small>
        {reason ? <small className="admin-dashboard-rejection-reason">Reason: {reason}</small> : null}
        {detailItems.length ? (
          <dl className="admin-dashboard-rider-details">
            {detailItems.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value || 'Not provided'}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {documents.length ? (
          <div className="admin-dashboard-rider-documents">
            {documents.map((document) => (
              <a
                key={document.label}
                href={document.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${document.label}`}
              >
                <img src={document.url} alt="" />
                <span>{document.label}</span>
              </a>
            ))}
          </div>
        ) : null}
      </div>
      <div className="admin-dashboard-card-actions">
        <StatusPill status={status} />
        <button type="button" className="admin-dashboard-primary" onClick={onVerify} disabled={busy}>
          {busy ? 'Verifying...' : 'Verify'}
        </button>
        <button type="button" className="admin-dashboard-danger" onClick={onReject} disabled={busy}>
          Reject
        </button>
      </div>
    </article>
  );
}

function UserRow({ profile, busy, onStatusChange, onDelete }) {
  const suspended = profile.verification_status === 'suspended';
  const nextStatus = suspended ? 'verified' : 'suspended';

  return (
    <article className="admin-dashboard-user-row">
      <div className="admin-dashboard-user-main">
        <div className="admin-dashboard-avatar">
          {(profile.full_name || profile.email || '?').slice(0, 1).toUpperCase()}
        </div>
        <div>
          <strong>{profile.full_name || 'Unnamed user'}</strong>
          <span>{profile.email || profile.phone || 'No contact saved'}</span>
        </div>
      </div>

      <div className="admin-dashboard-user-meta">
        <span>{profile.role || USER_ROLES.CUSTOMER}</span>
        <StatusPill status={profile.verification_status} />
      </div>

      <div className="admin-dashboard-row-actions">
        <button
          type="button"
          className="admin-dashboard-secondary"
          onClick={() => onStatusChange(profile.id, nextStatus)}
          disabled={busy}
        >
          {suspended ? 'Restore' : 'Suspend'}
        </button>
        <button
          type="button"
          className="admin-dashboard-danger"
          onClick={() => onDelete(profile)}
          disabled={busy}
        >
          Delete
        </button>
      </div>
    </article>
  );
}

function MessageRow({ submission, busy, onMarkRead }) {
  return (
    <article className="admin-dashboard-user-row">
      <div className="admin-dashboard-user-main">
        <div className={`admin-dashboard-avatar ${submission.is_read ? '' : 'is-unread'}`}>
          {(submission.name || '?').slice(0, 1).toUpperCase()}
        </div>
        <div>
          <strong>{submission.name}</strong>
          <span>{submission.email}</span>
        </div>
      </div>

      <div className="admin-dashboard-user-meta">
        <span>{formatDate(submission.created_at)}</span>
        <StatusPill status={submission.is_read ? 'verified' : 'pending'} />
      </div>

      <div className="admin-dashboard-row-actions">
        {!submission.is_read ? (
          <button
            type="button"
            className="admin-dashboard-secondary"
            onClick={() => onMarkRead(submission.id)}
            disabled={busy}
          >
            Mark read
          </button>
        ) : (
          <span style={{ color: 'var(--dark-muted)', fontSize: '0.85rem', fontWeight: 600 }}>Read</span>
        )}
      </div>
    </article>
  );
}

export default function AdminDashboardPage({ session, supabase, onLogout }) {
  const [activeTab, setActiveTab] = useState(ADMIN_TAB.OVERVIEW);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [contactSubmissions, setContactSubmissions] = useState([]);
  const [contactLoading, setContactLoading] = useState(false);

  const adminName = session?.user?.user_metadata?.full_name || session?.user?.email || 'Admin';
  const activeCopy = tabCopy[activeTab] || tabCopy[ADMIN_TAB.OVERVIEW];
  const metrics = dashboard?.metrics || {};
  const pendingRestaurants = dashboard?.pendingRestaurants || [];
  const pendingRiders = dashboard?.pendingRiders || [];
  const orderStatusBreakdown = dashboard?.orderStatusBreakdown || [];
  const pendingCount = pendingRestaurants.length + pendingRiders.length;
  const unreadMessages = contactSubmissions.filter((s) => !s.is_read).length;

  const sortedUsers = useMemo(() => {
    return [...(dashboard?.activeUsers || [])].sort((left, right) => {
      if (left.role === USER_ROLES.ADMIN && right.role !== USER_ROLES.ADMIN) {
        return -1;
      }
      if (right.role === USER_ROLES.ADMIN && left.role !== USER_ROLES.ADMIN) {
        return 1;
      }
      return String(left.full_name || left.email || '').localeCompare(String(right.full_name || right.email || ''));
    });
  }, [dashboard?.activeUsers]);

  const loadDashboard = async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }
    setError('');

    const { data, error: dashboardError } = await fetchAdminDashboard(supabase);

    if (dashboardError) {
      setError(dashboardError.message || 'Could not load admin dashboard.');
    } else {
      setDashboard(data);
      if (data?.partialError) {
        setMessage(data.partialError);
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    let active = true;

    async function loadInitialDashboard() {
      setLoading(true);
      const { data, error: dashboardError } = await fetchAdminDashboard(supabase);

      if (!active) {
        return;
      }

      if (dashboardError) {
        setError(dashboardError.message || 'Could not load admin dashboard.');
      } else {
        setDashboard(data);
        if (data?.partialError) {
          setMessage(data.partialError);
        }
      }
      setLoading(false);
    }

    loadInitialDashboard();

    return () => {
      active = false;
    };
  }, [supabase]);

  // Load contact submissions
  useEffect(() => {
    let active = true;

    async function loadContacts() {
      setContactLoading(true);
      const { data } = await fetchContactSubmissions(supabase);
      if (active) {
        setContactSubmissions(data || []);
        setContactLoading(false);
      }
    }

    loadContacts();

    return () => {
      active = false;
    };
  }, [supabase]);

  const handleVerifyRestaurant = async (restaurant) => {
    setBusyKey(`restaurant-${restaurant.id}`);
    setError('');
    setMessage('');

    const { error: verifyError } = await verifyAdminRestaurantApplication(supabase, restaurant.id);
    if (verifyError) {
      setError(verifyError.message || 'Could not verify restaurant.');
    } else {
      setMessage(`${restaurant.name} was verified.`);
      await loadDashboard({ silent: true });
    }

    setBusyKey('');
  };

  const handleVerifyRider = async (profile) => {
    setBusyKey(`rider-${profile.id}`);
    setError('');
    setMessage('');

    const { error: verifyError } = await verifyAdminRiderApplication(supabase, profile.id);
    if (verifyError) {
      setError(verifyError.message || 'Could not verify rider.');
    } else {
      setMessage(`${profile.full_name || 'Rider'} was verified.`);
      await loadDashboard({ silent: true });
    }

    setBusyKey('');
  };

  const handleRejectRestaurant = async (restaurant) => {
    const reason = window.prompt(`Why is ${restaurant.name || 'this restaurant'} being rejected?`);
    if (!reason || !reason.trim()) {
      return;
    }

    setBusyKey(`restaurant-${restaurant.id}`);
    setError('');
    setMessage('');

    const { error: rejectError } = await rejectAdminRestaurantApplication(supabase, restaurant.id, reason);
    if (rejectError) {
      setError(rejectError.message || 'Could not reject restaurant.');
    } else {
      setMessage(`${restaurant.name || 'Restaurant'} was rejected.`);
      await loadDashboard({ silent: true });
    }

    setBusyKey('');
  };

  const handleRejectRider = async (profile) => {
    const reason = window.prompt(`Why is ${profile.full_name || 'this rider'} being rejected?`);
    if (!reason || !reason.trim()) {
      return;
    }

    setBusyKey(`rider-${profile.id}`);
    setError('');
    setMessage('');

    const { error: rejectError } = await rejectAdminRiderApplication(supabase, profile.id, reason);
    if (rejectError) {
      setError(rejectError.message || 'Could not reject rider.');
    } else {
      setMessage(`${profile.full_name || 'Rider'} was rejected.`);
      await loadDashboard({ silent: true });
    }

    setBusyKey('');
  };

  const handleStatusChange = async (profileId, status) => {
    setBusyKey(`status-${profileId}`);
    setError('');
    setMessage('');

    const { data, error: statusError } = await setAdminProfileStatus(supabase, profileId, status);
    if (statusError) {
      setError(statusError.message || 'Could not update user status.');
    } else {
      setMessage(`${data?.full_name || 'User'} is now ${formatStatus(status)}.`);
      await loadDashboard({ silent: true });
    }

    setBusyKey('');
  };

  const handleDeleteUser = async (profile) => {
    const shouldDelete = window.confirm(`Delete ${profile.full_name || profile.email || 'this user'} from the platform?`);
    if (!shouldDelete) {
      return;
    }

    setBusyKey(`delete-${profile.id}`);
    setError('');
    setMessage('');

    const { error: deleteError } = await deleteAdminProfile(supabase, profile.id);
    if (deleteError) {
      setError(deleteError.message || 'Could not delete user.');
    } else {
      setMessage(`${profile.full_name || 'User'} was deleted.`);
      await loadDashboard({ silent: true });
    }

    setBusyKey('');
  };

  const handleMarkContactRead = async (submissionId) => {
    setBusyKey(`contact-${submissionId}`);
    const { error: readError } = await markContactSubmissionRead(supabase, submissionId);
    if (!readError) {
      setContactSubmissions((prev) =>
        prev.map((s) => (s.id === submissionId ? { ...s, is_read: true } : s)),
      );
    }
    setBusyKey('');
  };

  if (loading && !dashboard) {
    return (
      <main className="admin-dashboard-shell">
        <div className="admin-dashboard-loading">
          <div className="pulse" />
          <p>Loading admin dashboard...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-dashboard-shell">
      <nav className="admin-dashboard-nav">
        <div className="admin-dashboard-nav-inner">
          <button type="button" className="admin-dashboard-brand" onClick={() => setActiveTab(ADMIN_TAB.OVERVIEW)}>
            <img src={Logo} alt="Chito Mitho logo" />
            <span>Admin Console</span>
          </button>

          <div className="admin-dashboard-nav-actions">
            <button type="button" className="admin-dashboard-secondary" onClick={() => loadDashboard()} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
            <button type="button" className="admin-dashboard-logout" onClick={onLogout}>Logout</button>
          </div>
        </div>
      </nav>

      <div className="admin-dashboard-layout">
        <aside className="admin-dashboard-tabs">
          <div className="admin-dashboard-profile-card">
            <div className="admin-dashboard-avatar">{adminName.slice(0, 1).toUpperCase()}</div>
            <div>
              <strong>{adminName}</strong>
              <span>Platform administrator</span>
            </div>
          </div>

          <button type="button" className={activeTab === ADMIN_TAB.OVERVIEW ? 'is-active' : ''} onClick={() => setActiveTab(ADMIN_TAB.OVERVIEW)}>
            <IconGrid />
            Overview
          </button>
          <button type="button" className={activeTab === ADMIN_TAB.APPROVALS ? 'is-active' : ''} onClick={() => setActiveTab(ADMIN_TAB.APPROVALS)}>
            <IconCheck />
            Approvals
            {pendingCount ? <span>{pendingCount}</span> : null}
          </button>
          <button type="button" className={activeTab === ADMIN_TAB.USERS ? 'is-active' : ''} onClick={() => setActiveTab(ADMIN_TAB.USERS)}>
            <IconUsers />
            Users
          </button>
          <button type="button" className={activeTab === ADMIN_TAB.MESSAGES ? 'is-active' : ''} onClick={() => setActiveTab(ADMIN_TAB.MESSAGES)}>
            <IconMail />
            Messages
            {unreadMessages ? <span>{unreadMessages}</span> : null}
          </button>
          <button type="button" className={activeTab === ADMIN_TAB.ANALYTICS ? 'is-active' : ''} onClick={() => setActiveTab(ADMIN_TAB.ANALYTICS)}>
            <IconChart />
            Analytics
          </button>
        </aside>

        <section className="admin-dashboard-main">
          <header className="admin-dashboard-stage">
            <div>
              <span className="admin-dashboard-kicker">Admin Platform</span>
              <h1>{activeCopy.title}</h1>
              <p>{activeCopy.description}</p>
            </div>
            <div className="admin-dashboard-live">
              <IconCheck />
              <span>{pendingCount ? `${pendingCount} applications waiting` : 'Approval queue is clear'}</span>
            </div>
          </header>

          {error ? <p className="admin-dashboard-alert" data-state="error">{error}</p> : null}
          {message ? <p className="admin-dashboard-alert" data-state="success">{message}</p> : null}

          {activeTab === ADMIN_TAB.OVERVIEW ? (
            <>
              <section className="admin-dashboard-metrics">
                <MetricCard label="Total users" value={metrics.totalUsers || 0} detail={`${metrics.verifiedUsers || 0} verified accounts`} />
                <MetricCard label="Restaurants" value={metrics.totalRestaurants || 0} detail="Registered food places" />
                <MetricCard label="Pending" value={metrics.pendingApplications || 0} detail="Applications to review" />
                <MetricCard label="Active orders" value={metrics.activeOrders || 0} detail="Not delivered or cancelled" />
                <MetricCard label="Revenue" value={formatNpr(metrics.revenue || 0)} detail="Gross non-cancelled orders" />
              </section>

              <section className="admin-dashboard-grid">
                <div className="admin-dashboard-panel">
                  <div className="admin-dashboard-panel-head">
                    <div>
                      <span className="admin-dashboard-kicker">Approval queue</span>
                      <h2>Needs review</h2>
                    </div>
                    <button type="button" className="admin-dashboard-link" onClick={() => setActiveTab(ADMIN_TAB.APPROVALS)}>Review all</button>
                  </div>
                  <div className="admin-dashboard-mini-list">
                    {[...pendingRestaurants.slice(0, 3), ...pendingRiders.slice(0, 3)].slice(0, 5).map((item) => (
                      <div key={item.id}>
                        <strong>{item.name || item.full_name || 'Pending application'}</strong>
                        <span>{item.owner ? 'Restaurant' : 'Rider'} · {formatDate(item.created_at)}</span>
                      </div>
                    ))}
                    {!pendingCount ? <p className="admin-dashboard-note">No pending applications right now.</p> : null}
                  </div>
                </div>

                <div className="admin-dashboard-panel">
                  <div className="admin-dashboard-panel-head">
                    <div>
                      <span className="admin-dashboard-kicker">Orders</span>
                      <h2>Status breakdown</h2>
                    </div>
                    <button type="button" className="admin-dashboard-link" onClick={() => setActiveTab(ADMIN_TAB.ANALYTICS)}>Analyze</button>
                  </div>
                  <div className="admin-dashboard-mini-list">
                    {orderStatusBreakdown.slice(0, 5).map((item) => (
                      <div key={item.status}>
                        <strong>{formatStatus(item.status)}</strong>
                        <span>{item.count} orders</span>
                      </div>
                    ))}
                    {!orderStatusBreakdown.length ? <p className="admin-dashboard-note">No order data available yet.</p> : null}
                  </div>
                </div>
              </section>
            </>
          ) : null}

          {activeTab === ADMIN_TAB.APPROVALS ? (
            <section className="admin-dashboard-approvals">
              <div className="admin-dashboard-panel admin-dashboard-list-panel">
                <div className="admin-dashboard-panel-head">
                  <div>
                    <span className="admin-dashboard-kicker">Restaurants</span>
                    <h2>{pendingRestaurants.length} pending</h2>
                  </div>
                </div>
                {pendingRestaurants.map((restaurant) => (
                  <ApplicationCard
                    key={restaurant.id}
                    type="Restaurant"
                    title={restaurant.name}
                    subtitle={restaurant.address || 'No location saved'}
                    meta={`${restaurant.owner?.full_name || 'Owner'} · ${restaurant.contact_phone || restaurant.owner?.phone || 'No phone'}`}
                    status={restaurant.verification_status}
                    reason={restaurant.rejection_reason}
                    busy={busyKey === `restaurant-${restaurant.id}`}
                    onVerify={() => handleVerifyRestaurant(restaurant)}
                    onReject={() => handleRejectRestaurant(restaurant)}
                  />
                ))}
                {!pendingRestaurants.length ? <p className="admin-dashboard-note">Restaurant queue is clear.</p> : null}
              </div>

              <div className="admin-dashboard-panel admin-dashboard-list-panel">
                <div className="admin-dashboard-panel-head">
                  <div>
                    <span className="admin-dashboard-kicker">Riders</span>
                    <h2>{pendingRiders.length} pending</h2>
                  </div>
                </div>
                {pendingRiders.map((profile) => {
                  const vehicleType = String(profile.vehicle_type || '').toLowerCase();
                  const documents = [
                    profile.license_front_url ? { label: 'License front', url: profile.license_front_url } : null,
                    profile.license_back_url ? { label: 'License back', url: profile.license_back_url } : null,
                  ].filter(Boolean);
                  const detailItems = [
                    { label: 'Vehicle', value: formatVehicleType(profile.vehicle_type) },
                    ...(vehicleType === 'bicycle' ? [] : [
                      { label: 'Model', value: profile.bike_model },
                      { label: 'Condition', value: profile.bike_condition },
                    ]),
                  ];

                  return (
                    <ApplicationCard
                      key={profile.id}
                      type="Rider"
                      title={profile.full_name || 'Rider application'}
                      subtitle={profile.phone || profile.email || 'No contact saved'}
                      meta={profile.vehicle_details || `Applied ${formatDate(profile.created_at)}`}
                      status={profile.verification_status}
                      reason={profile.rejection_reason}
                      detailItems={detailItems}
                      documents={documents}
                      busy={busyKey === `rider-${profile.id}`}
                      onVerify={() => handleVerifyRider(profile)}
                      onReject={() => handleRejectRider(profile)}
                    />
                  );
                })}
                {!pendingRiders.length ? <p className="admin-dashboard-note">Rider queue is clear.</p> : null}
              </div>
            </section>
          ) : null}

          {activeTab === ADMIN_TAB.USERS ? (
            <section className="admin-dashboard-panel admin-dashboard-list-panel">
              <div className="admin-dashboard-panel-head">
                <div>
                  <span className="admin-dashboard-kicker">Accounts</span>
                  <h2>{sortedUsers.length} users</h2>
                </div>
              </div>
              <div className="admin-dashboard-user-list">
                {sortedUsers.map((profile) => (
                  <UserRow
                    key={profile.id}
                    profile={profile}
                    busy={busyKey.endsWith(profile.id)}
                    onStatusChange={handleStatusChange}
                    onDelete={handleDeleteUser}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {activeTab === ADMIN_TAB.MESSAGES ? (
            <section className="admin-dashboard-panel admin-dashboard-list-panel">
              <div className="admin-dashboard-panel-head">
                <div>
                  <span className="admin-dashboard-kicker">Contact form</span>
                  <h2>{contactSubmissions.length} messages</h2>
                </div>
              </div>
              {contactLoading ? <p className="admin-dashboard-note">Loading messages...</p> : null}
              <div className="admin-dashboard-user-list">
                {contactSubmissions.map((submission) => (
                  <div key={submission.id}>
                    <MessageRow
                      submission={submission}
                      busy={busyKey === `contact-${submission.id}`}
                      onMarkRead={handleMarkContactRead}
                    />
                    <div className="admin-dashboard-message-body">
                      <p>{submission.message}</p>
                    </div>
                  </div>
                ))}
              </div>
              {!contactLoading && !contactSubmissions.length ? <p className="admin-dashboard-note">No contact messages yet.</p> : null}
            </section>
          ) : null}

          {activeTab === ADMIN_TAB.ANALYTICS ? (
            <section className="admin-dashboard-panel admin-dashboard-list-panel">
              <div className="admin-dashboard-panel-head">
                <div>
                  <span className="admin-dashboard-kicker">Order analytics</span>
                  <h2>Status distribution</h2>
                </div>
              </div>
              <div className="admin-dashboard-status-bars">
                {orderStatusBreakdown.map((item) => {
                  const maxCount = Math.max(...orderStatusBreakdown.map((statusItem) => statusItem.count), 1);
                  const width = `${Math.max(8, (item.count / maxCount) * 100)}%`;
                  return (
                    <div key={item.status} className="admin-dashboard-status-bar-row">
                      <div>
                        <strong>{formatStatus(item.status)}</strong>
                        <span>{item.count} orders</span>
                      </div>
                      <div className="admin-dashboard-status-track">
                        <span style={{ width }} />
                      </div>
                    </div>
                  );
                })}
                {!orderStatusBreakdown.length ? <p className="admin-dashboard-note">No orders have been placed yet.</p> : null}
              </div>
            </section>
          ) : null}
        </section>
      </div>
    </main>
  );
}
