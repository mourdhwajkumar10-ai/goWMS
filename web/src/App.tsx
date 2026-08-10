import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import GRN from "./pages/GRN";
import Pick from "./pages/Pick";
import Pack from "./pages/Pack";
import Dispatch from "./pages/Dispatch";
import CycleCount from "./pages/CycleCount";
import PurchaseOrders from "./pages/PurchaseOrders";
import Workflow from "./pages/Workflow";
import Reports from "./pages/Reports";
import Analytics from "./pages/Analytics";
import InventoryHealth from "./pages/InventoryHealth";
import Transfers from "./pages/Transfers";
import Items from "./pages/Items";
import Locations from "./pages/Locations";
import Warehouses from "./pages/Warehouses";
import Customers from "./pages/Customers";
import Suppliers from "./pages/Suppliers";
import Notifications from "./pages/Notifications";
import Qi from "./pages/Qi";
import Serial from "./pages/Serial";
import Putaway from "./pages/Putaway";
import Batches from "./pages/Batches";
import DeliveryNotes from "./pages/DeliveryNotes";
import PurchaseInvoices from "./pages/PurchaseInvoices";
import StockEntries from "./pages/StockEntries";
import StockReconciliations from "./pages/StockReconciliations";
import { getToken } from "./services/api";

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="grn" element={<GRN />} />
        <Route path="pick" element={<Pick />} />
        <Route path="pack" element={<Pack />} />
        <Route path="dispatch" element={<Dispatch />} />
        <Route path="cycle-count" element={<CycleCount />} />
        <Route path="inventory-health" element={<InventoryHealth />} />
        <Route path="transfers" element={<Transfers />} />
        <Route path="po" element={<PurchaseOrders />} />
        <Route path="workflow" element={<Workflow />} />
        <Route path="reports" element={<Reports />} />
        <Route path="items" element={<Items />} />
        <Route path="locations" element={<Locations />} />
        <Route path="warehouses" element={<Warehouses />} />
        <Route path="customers" element={<Customers />} />
        <Route path="suppliers" element={<Suppliers />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="qi" element={<Qi />} />
        <Route path="serial" element={<Serial />} />
        <Route path="putaway" element={<Putaway />} />
        <Route path="batches" element={<Batches />} />
        <Route path="delivery-notes" element={<DeliveryNotes />} />
        <Route path="purchase-invoices" element={<PurchaseInvoices />} />
        <Route path="stock-entries" element={<StockEntries />} />
        <Route path="stock-reconciliations" element={<StockReconciliations />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
