/**
 * src/context/DataContext.tsx
 * Global application state — settings, services, auth user, and page data.
 * Replaces the old App-level state that was coupled to routing.
 *
 * Usage:
 *   const { settings, services, currentUser, navigate } = useData();
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { onSnapshot, doc, getDocs } from 'firebase/firestore';
import {
  db,
  auth,
  servicesCol,
  migrateMockDataToFirestore,
} from '../lib/firebase';
import { fetchInitialData, getCachedAdminToken, setCachedAdminToken, clearCachedAdminToken } from '../utils/api';
import {
  fallbackProblemCategories,
  fallbackServiceAreas,
  fallbackFaqs,
  fallbackCaseStudies,
  defaultPageSections,
} from '../utils/fallbackData';
import type {
  ServiceItem,
  ProblemCategory,
  FAQItem,
  CaseStudy,
  PageSectionsData,
} from '../types';
import type { Settings, User } from '../types/firestore';

// ─── Settings cache (non-sensitive fields only) ───────────────────────────────

const SETTINGS_CACHE_KEY = 'techfix_settings_v3';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

const SENSITIVE_FIELDS: ReadonlyArray<string> = [
  'adminPassword', 'apiSecret', 'gmailAppPassword', 'gmailUser',
  'resendApiKey', 'resendFromEmail', 'resendTargetEmail',
  'smtpPassword', 'smtpUser',
];

function loadCachedSettings(): Partial<Settings> {
  try {
    const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
    if (!raw) return {};
    const { ts, data } = JSON.parse(raw) as { ts: number; data: Partial<Settings> };
    if (Date.now() - ts > CACHE_TTL_MS) {
      localStorage.removeItem(SETTINGS_CACHE_KEY);
      return {};
    }
    return data ?? {};
  } catch {
    return {};
  }
}

function persistSettingsCache(s: Partial<Settings>): void {
  try {
    const safe = { ...s } as Record<string, unknown>;
    SENSITIVE_FIELDS.forEach((f) => delete safe[f]);
    delete safe['isLoading'];
    localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: safe }));
  } catch {
    // localStorage quota exceeded — ignore
  }
}

// ─── Authoritative defaults ───────────────────────────────────────────────────

export const SITE_DEFAULTS: Settings = {
  isLoading: true,
  businessName: 'TechFix On-Site Computer Services',
  tagline: 'Contact Online — We Come To You. Professional Computer Support in Peshawar.',
  phoneNumber: '+92 327 5526107',
  whatsappNumber: '+92 327 5526107',
  email: 'techfixpeshawar@gmail.com',
  businessHours: 'Monday – Saturday: 9:00 AM – 8:00 PM',
  serviceAreaCity: 'Peshawar, Khyber Pakhtunkhwa',
  visitFeeStarting: 'Rs. 500',
  technicianName: 'Safiullah',
  technicianTitle: 'Computer Science & Cybersecurity Practitioner',
  technicianInstitution: 'University of Agriculture, Peshawar',
  technicianExperience: '5+ Years Practical Windows & Hardware Diagnostics',
  technicianBio:
    'Hi, I am Safiullah — a Computer Science and Cybersecurity learner at the University of Agriculture, Peshawar, with around 5 years of practical experience working with computers and Windows systems.',
  technicianQuote:
    'My goal is simple: solve computer problems efficiently while saving customers the time and inconvenience of taking their computer to a repair shop.',
  technicianPhoto: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  status: 'published',
};

// ─── Context shape ────────────────────────────────────────────────────────────

export interface DataContextType {
  // Site data
  settings: Settings;
  services: ServiceItem[];
  activeServices: ServiceItem[];
  problemCategories: ProblemCategory[];
  serviceAreas: string[];
  faqs: FAQItem[];
  caseStudies: CaseStudy[];
  pageSections: PageSectionsData;

  // Auth
  currentUser: User | null;
  isAdmin: boolean;

  // UI state
  loading: boolean;
  selectedServiceForBooking: string;
  selectedProblemForBooking: string;
  setSelectedServiceForBooking: (service: string) => void;
  setSelectedProblemForBooking: (problem: string) => void;

  // Navigation helper
  navigate: (page: string, params?: { service?: string; problem?: string }) => void;

  // Manual refresh
  loadData: () => Promise<void>;
}

// ─── Context + hook ───────────────────────────────────────────────────────────

const DataContext = createContext<DataContextType | null>(null);

export function useData(): DataContextType {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside <DataProvider>');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function DataProvider({ children }: { children: ReactNode }) {
  const reactNavigate = useNavigate();
  const location = useLocation();

  // Settings — start from cache so the UI is never blank on first paint
  const [settings, setSettings] = useState<Settings>(() => {
    const cached = loadCachedSettings();
    return {
      ...SITE_DEFAULTS,
      ...cached,
      isLoading: Object.keys(cached).length === 0,
      technicianPhoto:
        localStorage.getItem('techfix_technician_photo') ||
        cached.technicianPhoto ||
        '',
    };
  });

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [problemCategories, setProblemCategories] = useState<ProblemCategory[]>(fallbackProblemCategories);
  const [serviceAreas, setServiceAreas] = useState<string[]>(fallbackServiceAreas);
  const [faqs, setFaqs] = useState<FAQItem[]>(fallbackFaqs);
  const [caseStudies, setCaseStudies] = useState<CaseStudy[]>(fallbackCaseStudies);
  const [pageSections, setPageSections] = useState<PageSectionsData>(defaultPageSections);
  const [loading, setLoading] = useState(false);

  const [selectedServiceForBooking, setSelectedServiceForBooking] = useState('');
  const [selectedProblemForBooking, setSelectedProblemForBooking] = useState('');

  // ── Load data from API / Firestore ─────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Firestore settings (authoritative)
      try {
        const { getDoc } = await import('firebase/firestore');
        const snap = await getDoc(doc(db, 'settings', 'site_config'));
        if (snap.exists()) {
          const data = snap.data() as Partial<Settings>;
          // Strip sensitive fields from client state
          const safe = { ...data } as Record<string, unknown>;
          SENSITIVE_FIELDS.forEach((f) => delete safe[f]);
          const merged = { ...safe, isLoading: false } as Settings;
          setSettings((prev) => ({ ...prev, ...merged }));
          persistSettingsCache(merged);
        }
      } catch (err) {
        console.warn('[DataContext] Firestore settings fetch:', err);
      }

      // REST API fallback (served by Express / Vercel functions)
      const data = await fetchInitialData();
      if (data) {
        if (data.settings) {
          setSettings((prev) => {
            const merged = { ...prev, ...data.settings, isLoading: false };
            persistSettingsCache(merged);
            return merged;
          });
        }
        if (data.services?.length) setServices(data.services);
        if (data.problemCategories?.length) setProblemCategories(data.problemCategories);
        if (data.serviceAreas?.length) setServiceAreas(data.serviceAreas);
        if (data.faqs?.length) setFaqs(data.faqs);
        if (data.caseStudies?.length) setCaseStudies(data.caseStudies);
        if (data.pageSections) {
          setPageSections(data.pageSections);
        }
      }
    } catch (err) {
      console.warn('[DataContext] loadData error (handled gracefully):', err);
    } finally {
      setSettings((prev) => ({ ...prev, isLoading: false }));
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Auth state + real-time Firestore listeners ──────────────────────────────

  useEffect(() => {
    // Auth listener
    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (!firebaseUser) {
        // If no Firebase user, check if there is an active valid admin session token
        const cached = getCachedAdminToken();
        if (cached && (cached.startsWith('techfix_sess_') || cached.split('.').length === 3)) {
          setIsAdmin(true);
          setCurrentUser({
            uid: 'admin-master',
            email: 'techfixpeshawar@gmail.com',
            role: 'admin',
            adminClaim: true,
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        } else {
          setCurrentUser(null);
          setIsAdmin(false);
        }
        return;
      }

      try {
        const idToken = await firebaseUser.getIdToken();
        setCachedAdminToken(idToken);

        const tokenResult = await firebaseUser.getIdTokenResult();
        const emailLower = (firebaseUser.email || '').toLowerCase().trim();
        const isAuthorizedEmail = 
          emailLower === 'techfixpeshawar@gmail.com' ||
          emailLower === 'sullahjan40@gmail.com' ||
          emailLower === 'admin@peshawar-techsupport.pk';
        const adminClaim = !!tokenResult.claims['admin'] || isAuthorizedEmail;

        setIsAdmin(adminClaim);
        setCurrentUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email ?? '',
          role: adminClaim ? 'admin' : 'customer',
          adminClaim,
          displayName: firebaseUser.displayName ?? undefined,
          phoneNumber: firebaseUser.phoneNumber ?? undefined,
          photoURL: firebaseUser.photoURL ?? undefined,
          createdAt: firebaseUser.metadata.creationTime ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'active',
        });

        // Seed Firestore services on first admin login
        if (adminClaim) {
          try {
            const snap = await getDocs(servicesCol);
            if (snap.empty) {
              await migrateMockDataToFirestore();
            }
          } catch (seedErr) {
            console.warn('[DataContext] Firestore seed check:', seedErr);
          }
        }
      } catch (authErr) {
        console.warn('[DataContext] Auth token claim error:', authErr);
      }
    });

    // Real-time services listener
    const unsubServices = onSnapshot(
      servicesCol,
      (snapshot) => {
        if (!snapshot.empty) {
          const liveServices: ServiceItem[] = [];
          snapshot.forEach((docSnap) => {
            const d = docSnap.data() as Record<string, unknown>;
            liveServices.push({
              id: docSnap.id,
              key: (d['key'] as string) || docSnap.id,
              title: (d['title'] as string) || '',
              shortDesc: (d['shortDesc'] as string) || '',
              fullDesc: (d['fullDesc'] as string) || '',
              priceStarting: (d['priceStarting'] as string) || 'Contact for quote',
              priceNote: d['priceNote'] as string | undefined,
              turnaround: (d['turnaround'] as string) || '45 – 90 mins',
              icon: (d['icon'] as string) || 'Wrench',
              status: (d['status'] as ServiceItem['status']) || 'PUBLISHED',
              order: typeof d['order'] === 'number' ? (d['order'] as number) : 99,
              workflow: d['workflow'] as string[] | undefined,
              warningNote: d['warningNote'] as string | undefined,
              diagnosticSteps: d['diagnosticSteps'] as string[] | undefined,
            });
          });
          liveServices.sort((a, b) => a.order - b.order);
          setServices(liveServices);
        }
      },
      (err) => console.warn('[DataContext] Services snapshot error:', err),
    );

    // Real-time settings listener
    const unsubSettings = onSnapshot(
      doc(db, 'settings', 'site_config'),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as Record<string, unknown>;
          const safe = { ...data };
          SENSITIVE_FIELDS.forEach((f) => delete safe[f]);
          setSettings((prev) => ({ ...prev, ...(safe as Partial<Settings>) }));
          persistSettingsCache(safe as Partial<Settings>);
        }
      },
      (err) => console.warn('[DataContext] Settings snapshot error:', err),
    );

    return () => {
      unsubAuth();
      unsubServices();
      unsubSettings();
    };
  }, []);

  // ── Navigation helper ───────────────────────────────────────────────────────

  const navigate = useCallback(
    (page: string, params?: { service?: string; problem?: string }) => {
      if (params?.service) setSelectedServiceForBooking(params.service);
      if (params?.problem) setSelectedProblemForBooking(params.problem);

      const pageMap: Record<string, string> = {
        home: '/',
        admin: '/techfixpeshawar007007/admin',
        services: '/services',
        'how-it-works': '/how-it-works',
        'why-on-site': '/why-on-site',
        'who-we-serve': '/who-we-serve',
        'bulk-windows': '/bulk-windows',
        technician: '/technician',
        about: '/technician',
        'problems-solutions': '/problems-solutions',
        faq: '/faq',
        contact: '/contact',
        'track-request': '/track-request',
      };

      let path = pageMap[page] ?? `/${page.replace(/^\//, '')}`;

      if (params) {
        const sp = new URLSearchParams();
        if (params.service) sp.set('service', params.service);
        if (params.problem) sp.set('problem', params.problem);
        const qs = sp.toString();
        if (qs) path += `?${qs}`;
      }

      reactNavigate(path);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [reactNavigate],
  );

  // ── Derived state ───────────────────────────────────────────────────────────

  const activeServices = services.filter(
    (s) =>
      s.status === 'PUBLISHED' ||
      s.status === 'published' ||
      s.status === 'active' ||
      !['UNPUBLISHED', 'unpublished', 'DRAFT', 'ARCHIVED', 'inactive'].includes(s.status),
  );

  // Expose current page name derived from location
  void location; // location is tracked for future per-page logic

  return (
    <DataContext.Provider
      value={{
        settings,
        services,
        activeServices,
        problemCategories,
        serviceAreas,
        faqs,
        caseStudies,
        pageSections,
        currentUser,
        isAdmin,
        loading,
        selectedServiceForBooking,
        selectedProblemForBooking,
        setSelectedServiceForBooking,
        setSelectedProblemForBooking,
        navigate,
        loadData,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}
