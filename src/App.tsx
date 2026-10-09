import { Navigate, Outlet, RouterProvider, createBrowserRouter } from 'react-router-dom';
import { useAuth } from './auth';
import { TabBar } from './components/TabBar';
import { Home } from './screens/Home';
import { History } from './screens/History';
import { TransactionForm } from './screens/TransactionForm';
import { Settings } from './screens/Settings';
import { Categories } from './screens/Categories';
import { Budgets } from './screens/Budgets';
import { Import } from './screens/Import';
import { Login } from './screens/Login';

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
    <>
      <Outlet />
      <TabBar />
    </>
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
            { path: '/settings', element: <Settings /> },
            { path: '/settings/categories', element: <Categories /> },
            { path: '/settings/budgets', element: <Budgets /> },
            { path: '/settings/import', element: <Import /> },
          ],
        },
        { path: '/add', element: <TransactionForm /> },
        { path: '/edit/:id', element: <TransactionForm /> },
        { path: '*', element: <Navigate to="/" replace /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') },
);

export function App() {
  return <RouterProvider router={router} />;
}
