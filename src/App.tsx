/**
 * src/App.tsx
 * Main application — React Router + DataContext.
 * Bridges the DataContext to existing prop-based components.
 */

import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { DataProvider, useData } from './context/DataContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';

// Public pages
import { HomePage } from './pages/HomePage';
import { ServicesPage } from './pages/ServicesPage';
import { HowItWorksPage } from './pages/HowItWorksPage';
import { WhyOnSitePage } from './pages/WhyOnSitePage';
import { WhoWeServePage } from './pages/WhoWeServePage';
import { BulkWindowsPage } from './pages/BulkWindowsPage';
import { AboutPage } from './pages/AboutPage';
import { ProblemsSolutionsPage } from './pages/ProblemsSolutionsPage';
import { FAQPage } from './pages/FAQPage';
import { ContactPage } from './pages/ContactPage';
import { TrackRequestPage } from './pages/TrackRequestPage';

// Admin — lazy loaded
const AdminProtectedRoute = lazy(() =>
  import('./components/admin/AdminProtectedRoute').then((m) => ({
    default: m.AdminProtectedRoute,
  }))
);

function AdminLoadingFallback() {
  return (
    <div className="min-h-screen bg-[#090b10] flex items-center justify-center">
      <div className="text-amber-400 text-sm animate-pulse">Loading admin panel…</div>
    </div>
  );
}

// ─── Active page name from path ───────────────────────────────────────────────

function getActivePage(pathname: string): string {
  if (pathname === '/' || pathname === '') return 'home';
  const clean = pathname.replace(/^\//, '').toLowerCase();
  if (clean.includes('admin')) return 'admin';
  if (clean === 'services') return 'services';
  if (clean === 'how-it-works') return 'how-it-works';
  if (clean === 'why-on-site') return 'why-on-site';
  if (clean === 'who-we-serve') return 'who-we-serve';
  if (clean === 'bulk-windows') return 'bulk-windows';
  if (clean === 'technician' || clean === 'about') return 'about';
  if (clean === 'problems-solutions') return 'problems-solutions';
  if (clean === 'faq') return 'faq';
  if (clean === 'contact') return 'contact';
  if (clean === 'track-request') return 'track-request';
  return 'home';
}

// ─── Layout wrapper — reads from DataContext, passes props to legacy components ──

function AppShell({ children }: { children: React.ReactNode }) {
  const { settings, services, serviceAreas, navigate, setSelectedServiceForBooking } = useData();
  const { pathname } = useLocation();
  const activePage = getActivePage(pathname);

  const handleOpenBooking = (serviceName?: string) => {
    if (serviceName) setSelectedServiceForBooking(serviceName);
    navigate('contact');
  };

  const handleOpenTracking = () => navigate('track-request');

  return (
    <div className="min-h-screen bg-[#090b10] text-slate-100 flex flex-col">
      <Navbar
        settings={settings}
        activePage={activePage}
        onNavigate={navigate}
        onOpenBooking={handleOpenBooking}
        onOpenTracking={handleOpenTracking}
      />
      <main className="flex-1">{children}</main>
      <Footer
        settings={settings}
        onNavigate={navigate}
        onOpenBooking={handleOpenBooking}
      />
    </div>
  );
}

// ─── Individual page wrappers — each pulls what it needs from DataContext ─────

function HomePageWrapper() {
  const { settings, services, problemCategories, navigate } = useData();
  return (
    <HomePage
      settings={settings}
      services={services}
      problemCategories={problemCategories}
      onNavigate={navigate}
    />
  );
}

function ServicesPageWrapper() {
  const { services, settings, navigate } = useData();
  return <ServicesPage services={services} settings={settings} onNavigate={navigate} />;
}

function HowItWorksPageWrapper() {
  const { settings, caseStudies, pageSections, navigate } = useData();
  return <HowItWorksPage settings={settings} caseStudies={caseStudies} pageSections={pageSections} onNavigate={navigate} />;
}

function WhyOnSitePageWrapper() {
  const { settings, navigate } = useData();
  return <WhyOnSitePage settings={settings} onNavigate={navigate} />;
}

function WhoWeServePageWrapper() {
  const { settings, navigate } = useData();
  return <WhoWeServePage settings={settings} onNavigate={navigate} />;
}

function BulkWindowsPageWrapper() {
  const { settings, navigate } = useData();
  return <BulkWindowsPage settings={settings} onNavigate={navigate} />;
}

function AboutPageWrapper() {
  const { settings, navigate } = useData();
  return <AboutPage settings={settings} onNavigate={navigate} />;
}

function ProblemsSolutionsPageWrapper() {
  const { settings, pageSections, navigate } = useData();
  return (
    <ProblemsSolutionsPage
      settings={settings}
      pageSections={pageSections}
      onNavigate={navigate}
    />
  );
}

function FAQPageWrapper() {
  const { faqs, settings, pageSections, navigate } = useData();
  return <FAQPage faqs={faqs} settings={settings} pageSections={pageSections} onNavigate={navigate} />;
}

function ContactPageWrapper() {
  const { settings, services, serviceAreas, navigate } = useData();
  return (
    <ContactPage
      settings={settings}
      services={services}
      serviceAreas={serviceAreas}
      onNavigate={navigate}
    />
  );
}

function TrackRequestPageWrapper() {
  const { settings, navigate } = useData();
  return <TrackRequestPage settings={settings} onNavigate={navigate} />;
}

function AdminPageWrapper() {
  const { settings, services, loadData, navigate } = useData();
  return (
    <Suspense fallback={<AdminLoadingFallback />}>
      <AdminProtectedRoute
        isOpen={true}
        onClose={() => navigate('home')}
        onNavigateHome={() => navigate('home')}
        services={services}
        settings={settings}
        onRefreshData={loadData}
        isFullScreenPage={true}
      />
    </Suspense>
  );
}

// ─── Router ───────────────────────────────────────────────────────────────────

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<AppShell><HomePageWrapper /></AppShell>} />
      <Route path="/services" element={<AppShell><ServicesPageWrapper /></AppShell>} />
      <Route path="/how-it-works" element={<AppShell><HowItWorksPageWrapper /></AppShell>} />
      <Route path="/why-on-site" element={<AppShell><WhyOnSitePageWrapper /></AppShell>} />
      <Route path="/who-we-serve" element={<AppShell><WhoWeServePageWrapper /></AppShell>} />
      <Route path="/bulk-windows" element={<AppShell><BulkWindowsPageWrapper /></AppShell>} />
      <Route path="/technician" element={<AppShell><AboutPageWrapper /></AppShell>} />
      <Route path="/about" element={<Navigate to="/technician" replace />} />
      <Route path="/problems-solutions" element={<AppShell><ProblemsSolutionsPageWrapper /></AppShell>} />
      <Route path="/faq" element={<AppShell><FAQPageWrapper /></AppShell>} />
      <Route path="/contact" element={<AppShell><ContactPageWrapper /></AppShell>} />
      <Route path="/track-request" element={<AppShell><TrackRequestPageWrapper /></AppShell>} />
      <Route path="/techfixpeshawar007007/admin" element={<AdminPageWrapper />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <DataProvider>
        <AppRoutes />
      </DataProvider>
    </BrowserRouter>
  );
}
