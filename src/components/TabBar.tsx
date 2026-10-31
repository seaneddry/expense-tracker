import { NavLink } from 'react-router-dom';
import { Icon } from './Icon';
import { getRecurringSummary } from '../api';
import { useQuery } from '../lib/useQuery';

/**
 * Floating glass capsule with the four main screens (Garage style), plus the
 * round + button beside it for adding an expense. Five items in total.
 */
export function TabBar() {
  const summary = useQuery(getRecurringSummary, []);
  const alerts = summary.data?.alert_count ?? 0;
  const cls = ({ isActive }: { isActive: boolean }) => `tab ${isActive ? 'active' : ''}`;

  return (
    <nav className="tabbar" aria-label="Main">
      <div className="tab-capsule">
        <NavLink to="/" end viewTransition className={cls}>
          <Icon name="home" />
          <span>Home</span>
        </NavLink>
        <NavLink to="/history" viewTransition className={cls}>
          <Icon name="list" />
          <span>History</span>
        </NavLink>
        <NavLink
          to="/subscriptions"
          viewTransition
          className={cls}
          aria-label={alerts > 0 ? `Subscriptions, ${alerts} due soon` : 'Subscriptions'}
        >
          <span className="tab-icon">
            <Icon name="repeat" />
            {alerts > 0 ? <span className="tab-badge">{alerts}</span> : null}
          </span>
          <span>Subscriptions</span>
        </NavLink>
        <NavLink to="/settings" viewTransition className={cls}>
          <Icon name="gear" />
          <span>Settings</span>
        </NavLink>
      </div>
      <NavLink to="/add" viewTransition className="tab-fab" aria-label="Add expense">
        <Icon name="plus" size={26} strokeWidth={2.4} />
      </NavLink>
    </nav>
  );
}
