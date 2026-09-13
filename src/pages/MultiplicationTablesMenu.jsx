import { Navigate } from 'react-router-dom';

/*
 * `/multiplication-tables` used to be a second, parallel menu for the tables
 * mode. Nothing linked forwards to it (Home sends "Multiplication Tables" to
 * `/menu/Multiplication Tables`), so it was only ever reachable by pressing
 * Back out of `/multiplication-tables/practice` - and its own "Learn" button
 * pointed at `/multiplication-tables/learn`, which is not a route at all.
 *
 * ModeMenu is now the single menu for every practice mode, so this route just
 * forwards there. Backing out of the tables settings screen (which still uses
 * backTo="/multiplication-tables") lands on the real menu, and the route stays
 * valid for anyone with the old URL bookmarked.
 */
const TABLES_MENU = `/menu/${encodeURIComponent('Multiplication Tables')}`;

export default function MultiplicationTablesMenu() {
  return <Navigate to={TABLES_MENU} replace />;
}
