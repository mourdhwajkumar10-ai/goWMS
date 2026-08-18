import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import GRN from "./pages/GRN";
import ReceivingWizard from "./pages/ReceivingWizard";
import ReceivingManagement from "./pages/ReceivingManagement";
import GRNExceptions from "./pages/GRNExceptions";
import GRNFollowUps from "./pages/GRNFollowUps";
import GRNAudit from "./pages/GRNAudit";
import Pick from "./pages/Pick";
import Pack from "./pages/Pack";
import Dispatch from "./pages/Dispatch";
import CycleCount from "./pages/CycleCount";
import StockScan from "./pages/StockScan";
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
import Transports from "./pages/Transports";
import Notifications from "./pages/Notifications";
import Qi from "./pages/Qi";
import Serial from "./pages/Serial";
import PutawayWizard from "./pages/PutawayWizard";
import PutawayLogs from "./pages/PutawayLogs";
import Batches from "./pages/Batches";
import DeliveryNotes from "./pages/DeliveryNotes";
import PurchaseInvoices from "./pages/PurchaseInvoices";
import StockEntries from "./pages/StockEntries";
import StockReconciliations from "./pages/StockReconciliations";
import SalesOrders from "./pages/SalesOrders";
import Employees from "./pages/Employees";
import Roles from "./pages/Roles";
import Returns from "./pages/Returns";
import Backorders from "./pages/Backorders";
import AuditLogs from "./pages/AuditLogs";
import { getRole, getToken } from "./services/api";
import { homePathForRole, isDeskRole } from "./utils/roleAccess";

function RoleHome() {
  const role = getRole();
  if (!isDeskRole(role)) return <Navigate to={homePathForRole(role)} replace />;
  return <Dashboard />;
}

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
        <Route index element={<RoleHome />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="grn" element={<GRN />} />
        <Route path="grn/:id" element={<GRN />} />
        <Route path="receiving" element={<ReceivingWizard />} />
        <Route path="receiving-management" element={<ReceivingManagement />} />
        <Route path="exceptions" element={<GRNExceptions />} />
        <Route path="grn-exceptions" element={<GRNExceptions />} />
        <Route path="follow-up" element={<GRNFollowUps />} />
        <Route path="followups" element={<GRNFollowUps />} />
        <Route path="grn-followups" element={<GRNFollowUps />} />
        <Route path="grn-audit" element={<GRNAudit />} />
        <Route path="audit" element={<GRNAudit />} />
        <Route path="pick" element={<Pick />} />
        <Route path="pack" element={<Pack />} />
        <Route path="dispatch" element={<Dispatch />} />
        <Route path="cycle-count" element={<CycleCount />} />
        <Route path="stock-scan" element={<StockScan />} />
        <Route path="inventory-health" element={<InventoryHealth />} />
        <Route path="transfers" element={<Transfers />} />
        <Route path="po" element={<PurchaseOrders />} />
        <Route path="sales-orders" element={<SalesOrders />} />
        <Route path="backorders" element={<Backorders />} />
        <Route path="returns" element={<Returns />} />
        <Route path="employees" element={<Employees />} />
        <Route path="roles" element={<Roles />} />
        <Route path="workflow" element={<Workflow />} />
        <Route path="reports" element={<Reports />} />
        <Route path="audit-logs" element={<AuditLogs />} />
        <Route path="items" element={<Items />} />
        <Route path="locations" element={<Locations />} />
        <Route path="warehouses" element={<Warehouses />} />
        <Route path="customers" element={<Customers />} />
        <Route path="suppliers" element={<Suppliers />} />
        <Route path="transports" element={<Transports />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="qi" element={<Qi />} />
        <Route path="serial" element={<Serial />} />
        <Route path="putaway" element={<PutawayWizard />} />
        <Route path="putaway/logs" element={<PutawayLogs />} />
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
