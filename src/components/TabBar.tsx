import { NavLink } from 'react-router-dom';
import { Icon } from './Icon';

export function TabBar() {
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
      <NavLink to="/settings" viewTransition className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
        <Icon name="gear" />
        <span>Settings</span>
      </NavLink>
    </nav>
  );
}
