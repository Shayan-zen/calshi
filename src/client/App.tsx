import { useEffect } from "react";
import { Outlet, Route, Routes, useLocation } from "react-router";
import Nav from "./components/Nav";
import Footer from "./components/Footer";
import HomePage from "./pages/HomePage";
import EventPage from "./pages/EventPage";
import MarketRedirect from "./pages/MarketRedirect";
import PortfolioPage from "./pages/PortfolioPage";
import OrdersPage from "./pages/OrdersPage";
import LeaderboardPage from "./pages/LeaderboardPage";
import ActivityPage from "./pages/ActivityPage";
import LoginPage from "./pages/LoginPage";
import AdminPage from "./pages/AdminPage";
import NotFoundPage from "./pages/NotFoundPage";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function Layout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Nav />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-16 pt-5 sm:px-6 lg:px-8">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="events/:slug" element={<EventPage />} />
          <Route path="markets/:ticker" element={<MarketRedirect />} />
          <Route path="portfolio" element={<PortfolioPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="leaderboard" element={<LeaderboardPage />} />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </>
  );
}
