import { Icon } from './Icon';
import { useAsk } from '../lib/askContext';
import '../ask.css';

/** Sparkle icon for the navigation bar. Shows on every screen inside the main tabs. */
export function AskButton() {
  const { available, open } = useAsk();
  if (!available) return null;
  return (
    <button type="button" className="nav-icon-button" aria-label="Ask about your spending" onClick={open}>
      <Icon name="sparkle" size={22} />
    </button>
  );
}

/** The search-style bar at the top of Home. */
export function AskBar() {
  const { available, open } = useAsk();
  if (!available) return null;
  return (
    <button type="button" className="ask-bar" onClick={open}>
      <Icon name="sparkle" size={20} />
      <span>Ask about your spending</span>
    </button>
  );
}
