import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { listFriendBalances } from '../api';
import { useQuery } from '../lib/useQuery';
import { totals } from '../lib/loans';
import { rm } from '../lib/format';

/** One-line card on Home that opens Friends & IOUs. All-time balances, so the month switcher doesn't change it. */
export function FriendsCard() {
  const friends = useQuery(listFriendBalances, []);
  if (!friends.data) return null; // stay quiet while loading or if it fails; the dashboard is unaffected
  const t = totals(friends.data);

  let main = 'Friends & IOUs';
  let sub = 'Track money you paid for friends';
  if (friends.data.length > 0) {
    if (t.people === 0) {
      sub = 'Everyone is settled';
    } else {
      main = t.owed > 0 ? `Friends owe you ${rm(t.owed)}` : `You owe ${rm(t.owe)}`;
      const parts = [`${t.people} ${t.people === 1 ? 'person' : 'people'}`];
      if (t.owed > 0 && t.owe > 0) parts.push(`you owe ${rm(t.owe)}`);
      sub = parts.join(' · ');
    }
  }

  return (
    <div className="group-body">
      <Link to="/friends" viewTransition className="row friends-card">
        <span className="row-icon">
          <Icon name="users" size={18} />
        </span>
        <span className="row-label">
          <strong>{main}</strong>
          <span className="row-sub">{sub}</span>
        </span>
        <Icon name="chevron-right" size={18} />
      </Link>
    </div>
  );
}
