import { createBrowserRouter } from 'react-router-dom';
import { CustomerLayout } from '@/layouts/CustomerLayout';
import { StaffLayout } from '@/layouts/StaffLayout';
import HomePage from '@/pages/customer/HomePage';
import MenuPage from '@/pages/customer/MenuPage';
import CartPage from '@/pages/customer/CartPage';
import CheckoutPage from '@/pages/customer/CheckoutPage';
import OrderTrackingPage from '@/pages/customer/OrderTrackingPage';
import DineInLandingPage from '@/pages/customer/DineInLandingPage';
import AccountPage from '@/pages/customer/AccountPage';
import OrdersPage from '@/pages/customer/OrdersPage';
import PartyRequestPage from '@/pages/customer/PartyRequestPage';
import StaffLoginPage from '@/pages/staff/StaffLoginPage';
import POSPage from '@/pages/staff/POSPage';
import KDSPage from '@/pages/staff/KDSPage';
import CurrentOrdersPage from '@/pages/staff/CurrentOrdersPage';
import DeliveryPage from '@/pages/staff/DeliveryPage';
import InventoryLayout from '@/pages/staff/inventory/InventoryLayout';
import InventoryDashboardPage from '@/pages/staff/inventory/InventoryDashboardPage';
import InventoryItemsPage from '@/pages/staff/inventory/InventoryItemsPage';
import InventoryTransactionsPage from '@/pages/staff/inventory/InventoryTransactionsPage';
import PurchasesPage from '@/pages/staff/inventory/PurchasesPage';
import SuppliersPage from '@/pages/staff/inventory/SuppliersPage';
import WastagePage from '@/pages/staff/inventory/WastagePage';
import RecipesPage from '@/pages/staff/inventory/RecipesPage';
import AdminLayout from '@/pages/staff/admin/AdminLayout';
import AdminDashboardPage from '@/pages/staff/admin/AdminDashboardPage';
import MenuManagementPage from '@/pages/staff/admin/MenuManagementPage';
import AnalyticsPage from '@/pages/staff/admin/AnalyticsPage';
import CouponsPage from '@/pages/staff/admin/CouponsPage';
import LoyaltyPage from '@/pages/staff/admin/LoyaltyPage';
import PartyOrdersPage from '@/pages/staff/admin/PartyOrdersPage';
import StaffManagementPage from '@/pages/staff/admin/StaffManagementPage';
import OutletSettingsPage from '@/pages/staff/admin/OutletSettingsPage';
import TableManagementPage from '@/pages/staff/admin/TableManagementPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <CustomerLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'menu', element: <MenuPage /> },
      { path: 'cart', element: <CartPage /> },
      { path: 'checkout', element: <CheckoutPage /> },
      { path: 'track/:orderId', element: <OrderTrackingPage /> },
      { path: 'account', element: <AccountPage /> },
      { path: 'orders', element: <OrdersPage /> },
      { path: 'party', element: <PartyRequestPage /> },
    ],
  },
  {
    // Table QR codes point here: /t/:qrToken
    path: '/t/:qrToken',
    element: <DineInLandingPage />,
  },
  {
    path: '/staff/login',
    element: <StaffLoginPage />,
  },
  {
    path: '/',
    element: <StaffLayout />,
    children: [
      { path: 'pos', element: <POSPage /> },
      { path: 'orders-live', element: <CurrentOrdersPage /> },
      { path: 'kds', element: <KDSPage /> },
      { path: 'delivery', element: <DeliveryPage /> },
      {
        path: 'inventory',
        element: <InventoryLayout />,
        children: [
          { index: true, element: <InventoryDashboardPage /> },
          { path: 'items', element: <InventoryItemsPage /> },
          { path: 'transactions', element: <InventoryTransactionsPage /> },
          { path: 'purchases', element: <PurchasesPage /> },
          { path: 'suppliers', element: <SuppliersPage /> },
          { path: 'wastage', element: <WastagePage /> },
          { path: 'recipes', element: <RecipesPage /> },
        ],
      },
      {
        path: 'admin',
        element: <AdminLayout />,
        children: [
          { index: true, element: <AdminDashboardPage /> },
          { path: 'menu', element: <MenuManagementPage /> },
          { path: 'analytics', element: <AnalyticsPage /> },
          { path: 'coupons', element: <CouponsPage /> },
          { path: 'loyalty', element: <LoyaltyPage /> },
          { path: 'party-orders', element: <PartyOrdersPage /> },
          { path: 'staff', element: <StaffManagementPage /> },
          { path: 'outlet-settings', element: <OutletSettingsPage /> },
          { path: 'tables', element: <TableManagementPage /> },
        ],
      },
    ],
  },
]);
