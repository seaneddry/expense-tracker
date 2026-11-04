import { Navigate, Outlet, RouterProvider, createBrowserRouter } from 'react-router-dom';
import { useAuth } from './auth';
import { TabBar } from './components/TabBar';
import { AskProvider } from './components/AskProvider';
import { Home } from './screens/Home';
import { History } from './screens/History';
import { TransactionForm } from './screens/TransactionForm';
import { Settings } from './screens/Settings';
import { Categories } from './screens/Categories';
import { Budgets } from './screens/Budgets';
import { Import } from './screens/Import';
import { Login } from './screens/Login';
import { Notifications } from './screens/Notifications';
import { Subscriptions } from './screens/Subscriptions';
import { SubscriptionDetail } from './screens/SubscriptionDetail';
import { SubscriptionForm } from './screens/SubscriptionForm';
import { Friends } from './screens/Friends';
import { FriendDetail } from './screens/FriendDetail';
import { FriendForm } from './screens/FriendForm';
import { LoanEntryForm } from './screens/LoanEntryForm';

function RequireAuth() {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="splash">
        <div className="spinner" />
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function Shell() {
  return (
    <AskProvider>
      <Outlet />
      <TabBar />
    </AskProvider>
  );
}

const router = createBrowserRouter(
  [
    { path: '/login', element: <Login /> },
    {
      element: <RequireAuth />,
      children: [
        {
          element: <Shell />,
          children: [
            { path: '/', element: <Home /> },
            { path: '/history', element: <History /> },
            { path: '/subscriptions', element: <Subscriptions /> },
            { path: '/subscriptions/:id', element: <SubscriptionDetail /> },
            { path: '/settings', element: <Settings /> },
            { path: '/settings/categories', element: <Categories /> },
            { path: '/settings/budgets', element: <Budgets /> },
            { path: '/settings/notifications', element: <Notifications /> },
            { path: '/settings/import', element: <Import /> },
            // Friends & IOUs: not a tab. Opened from Home, Settings or a split expense.
            { path: '/friends', element: <Friends /> },
            { path: '/friends/:id', element: <FriendDetail /> },
          ],
        },
        { path: '/add', element: <TransactionForm /> },
        { path: '/edit/:id', element: <TransactionForm /> },
        { path: '/subscriptions/new', element: <SubscriptionForm /> },
        { path: '/subscriptions/:id/edit', element: <SubscriptionForm /> },
        { path: '/friends/new', element: <FriendForm /> },
        { path: '/friends/:id/edit', element: <FriendForm /> },
        { path: '/friends/:id/add/:kind', element: <LoanEntryForm /> },
        { path: '/friends/:id/item/:entryId', element: <LoanEntryForm /> },
        { path: '/friends/:id/repayment/:paymentId', element: <LoanEntryForm /> },
        { path: '*', element: <Navigate to="/" replace /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') },
);

export function App() {
  return <RouterProvider router={router} />;
}
