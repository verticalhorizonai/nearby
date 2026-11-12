// The client's routes (spec 3.11 Screens). The toaster sits outside the routes so a toast survives navigation
// (the failed-payment toast shows on the pick it returns to; REQ-08-06). Each page fades in over 200 ms when the
// route changes, Switch seat included (F6.4); no motion under reduced motion (REQ-08-03).
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { AppointmentDetailPage } from '@/pages/AppointmentDetailPage';
import { ChooseSeatPage } from '@/pages/ChooseSeatPage';
import { ConnectPage } from '@/pages/ConnectPage';
import { HandoffPage } from '@/pages/HandoffPage';
import { HomePage } from '@/pages/HomePage';
import { MerchantDashboardPage } from '@/pages/MerchantDashboardPage';
import { MerchantListPage } from '@/pages/MerchantListPage';
import { MyWeekPage } from '@/pages/MyWeekPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { PaymentResultPage } from '@/pages/PaymentResultPage';

export function AppRoutes() {
  const location = useLocation();
  return (
    <div key={location.pathname} className="duration-200 animate-in fade-in motion-reduce:animate-none" data-testid="page-transition">
      <Routes location={location}>
        <Route path="/" element={<HomePage />} />
        <Route path="/seats" element={<ChooseSeatPage />} />
        <Route path="/connect" element={<ConnectPage />} />
        <Route path="/week" element={<MyWeekPage />} />
        <Route path="/appointments/:appointmentId" element={<AppointmentDetailPage />} />
        <Route path="/handoff" element={<HandoffPage />} />
        <Route path="/pay/return" element={<PaymentResultPage kind="return" />} />
        <Route path="/pay/cancel" element={<PaymentResultPage kind="cancel" />} />
        <Route path="/merchant" element={<MerchantListPage />} />
        <Route path="/merchant/:merchantId" element={<MerchantDashboardPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppRoutes />
      <Toaster />
    </BrowserRouter>
  );
}
