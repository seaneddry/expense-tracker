import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { ErrorNotice, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { getHomeCards, saveHomeCards } from '../api';
import { cardLabel, normaliseCards } from '../lib/homeCards';
import type { HomeCardPref } from '../lib/homeCards';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';

/** Settings > Home cards: show, hide and reorder the cards in Home's grid. Saves on every change. */
export function HomeCards() {
  const toast = useToast();
  const bump = useBump();
  const saved = useQuery(getHomeCards, []);
  const [cards, setCards] = useState<HomeCardPref[] | null>(null);

  // Take the saved layout once; after that the screen keeps its own copy so taps feel instant.
  useEffect(() => {
    if (saved.data && cards === null) setCards(saved.data);
  }, [saved.data, cards]);

  async function persist(next: HomeCardPref[] | null, done?: string) {
    const before = cards;
    setCards(next ?? normaliseCards(null));
    try {
      await saveHomeCards(next);
      bump();
      if (done) toast(done);
    } catch (e) {
      setCards(before);
      toast(errorMessage(e));
    }
  }

  function move(index: number, by: -1 | 1) {
    if (!cards) return;
    const to = index + by;
    if (to < 0 || to >= cards.length) return;
    const next = [...cards];
    [next[index], next[to]] = [next[to], next[index]];
    void persist(next);
  }

  function toggle(index: number) {
    if (!cards) return;
    void persist(cards.map((c, i) => (i === index ? { ...c, visible: !c.visible } : c)));
  }

  const shown = cards?.filter((c) => c.visible).length ?? 0;

  return (
    <Screen
      title="Home cards"
      left={
        <Link to="/settings" viewTransition className="nav-button">
          <Icon name="chevron-left" size={22} /> Settings
        </Link>
      }
    >
      <main className="page stack">
        {saved.error && !cards ? <ErrorNotice message={saved.error} onRetry={saved.reload} /> : null}
        {!cards && !saved.error ? <Loading /> : null}

        {cards ? (
          <>
            <div className="group">
              <div className="group-header">
                {shown} of {cards.length} shown
              </div>
              <div className="group-body">
                {cards.map((c, i) => (
                  <div key={c.id} className={`row card-pref ${c.visible ? '' : 'is-off'}`}>
                    <span className="row-label">{cardLabel(c.id)}</span>
                    <button className="icon-button" aria-label={`Move ${cardLabel(c.id)} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                      <Icon name="arrow-up" size={18} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Move ${cardLabel(c.id)} down`}
                      disabled={i === cards.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <Icon name="arrow-down" size={18} />
                    </button>
                    <label className="switch" aria-label={`Show ${cardLabel(c.id)}`}>
                      <input type="checkbox" checked={c.visible} onChange={() => toggle(i)} />
                      <span className="switch-track" />
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="group">
              <div className="group-body">
                <button className="row row-center" onClick={() => void persist(null, 'Back to the default layout')}>
                  Reset to default
                </button>
              </div>
            </div>
          </>
        ) : null}
      </main>
    </Screen>
  );
}
