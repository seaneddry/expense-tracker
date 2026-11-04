import { Link } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { Empty, ErrorNotice, Loading } from '../components/States';
import { listFriendBalances } from '../api';
import { useQuery } from '../lib/useQuery';
import { rm, shortDate } from '../lib/format';
import { totals } from '../lib/loans';
import type { FriendBalance } from '../types';

/** Friends & IOUs. Not a tab: opened from the Home card, Settings, or a split expense. */
export function Friends() {
  const friends = useQuery(listFriendBalances, []);
  const list = friends.data ?? [];
  const t = totals(list);

  const owesYou = list.filter((f) => f.net > 0.004).sort((a, b) => b.net - a.net);
  const youOwe = list.filter((f) => f.net < -0.004).sort((a, b) => a.net - b.net);
  const settled = list.filter((f) => Math.abs(f.net) <= 0.004);

  const back = (
    <Link to="/" viewTransition className="nav-button">
      <Icon name="chevron-left" size={22} /> Home
    </Link>
  );
  const add = (
    <Link to="/friends/new" viewTransition className="nav-icon-button" aria-label="Add friend">
      <Icon name="plus" />
    </Link>
  );

  return (
    <Screen title="Friends" sub="Money between you and friends" left={back} right={add}>
      <main className="page stack">
        {friends.error ? <ErrorNotice message={friends.error} onRetry={friends.reload} /> : null}
        {!friends.data && !friends.error ? <Loading /> : null}

        {friends.data && list.length === 0 ? (
          <Empty
            icon="users"
            title="No friends yet"
            text="Paid for someone, or someone paid for you? Add them here, or turn on “Split with friends” when you add an expense."
            action={
              <Link to="/friends/new" className="button button-primary">
                Add a friend
              </Link>
            }
          />
        ) : null}

        {list.length > 0 ? (
          <>
            <section className="hero" aria-label="Balances">
              <div className="hero-label">Friends owe you</div>
              <div className="hero-amount num">{rm(t.owed)}</div>
              <div className="hero-sub">
                {t.owe > 0 ? (
                  <>
                    You owe <strong className="loan-owe">{rm(t.owe)}</strong>
                    {' · '}
                  </>
                ) : null}
                {owesYou.length === 0 && youOwe.length === 0
                  ? 'Everyone is settled'
                  : `${owesYou.length + youOwe.length} ${owesYou.length + youOwe.length === 1 ? 'person' : 'people'} not settled`}
              </div>
            </section>

            <FriendGroup title="Owe you" friends={owesYou} />
            <FriendGroup title="You owe" friends={youOwe} />
            <FriendGroup title="Settled" friends={settled} faded />
          </>
        ) : null}
      </main>
    </Screen>
  );
}

function FriendGroup({ title, friends, faded }: { title: string; friends: FriendBalance[]; faded?: boolean }) {
  if (friends.length === 0) return null;
  return (
    <section className="group">
      <div className="group-header">{title}</div>
      <div className="group-body">
        {friends.map((f) => (
          <Link key={f.id} to={`/friends/${f.id}`} viewTransition className={`sub-row ${faded ? 'sub-row-faded' : ''}`}>
            <span className="sub-initial" aria-hidden="true">
              {f.name.charAt(0).toUpperCase()}
            </span>
            <span className="sub-main">
              <span className="sub-title">
                <span>{f.name}</span>
              </span>
              <span className="sub-sub">{f.last_activity ? `Last: ${shortDate(f.last_activity)}` : 'Nothing recorded yet'}</span>
            </span>
            <span className={`sub-amount num ${f.net > 0.004 ? 'loan-owed' : f.net < -0.004 ? 'loan-owe' : ''}`}>
              {rm(Math.abs(f.net))}
              <small>{f.net > 0.004 ? 'owes you' : f.net < -0.004 ? 'you owe' : 'settled'}</small>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
