import { NavLink } from 'react-router-dom';
import { Icon } from './Icon';
import { getRecurringSummary } from '../api';
import { useQuery } from '../lib/useQuery';

export function TabBar() {
  const summary = useQuery(getRecurringSummary, []);
  const alerts = summary.data?.alert_count ?? 0;

  return (
    <nav className="tabbar" aria-label="Main">
      <NavLink to="/" end viewTransition className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
        <Icon name="home" />
        <span>Home</span>
      </NavLink>
      <NavLink to="/history" viewTransition className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
        <Icon name="list" />
        <span>History</span>
      </NavLink>
      <NavLink to="/add" viewTransition className="tab tab-add" aria-label="Add expense">
        <span className="tab-add-button">
          <Icon name="plus" size={26} strokeWidth={2.4} />
        </span>
      </NavLink>
      <NavLink
        to="/subscriptions"
        viewTransition
        className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}
        aria-label={alerts > 0 ? `Subscriptions, ${alerts} due soon` : 'Subscriptions'}
      >
        <span className="tab-icon">
          <Icon name="repeat" />
          {alerts > 0 ? <span className="tab-badge">{alerts}</span> : null}
        </span>
        <span>Subscriptions</span>
      </NavLink>
      <NavLink to="/settings" viewTransition className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
        <Icon name="gear" />
        <span>Settings</span>
      </NavLink>
    </nav>
  );
}
