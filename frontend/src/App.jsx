import React from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, useParams } from 'react-router-dom';
import BracketPage from './pages/BracketPage';
import VotingPage from './pages/VotingPage';

// Key wrapper forces full remount when matchupId changes (clean state)
function VotingPageKeyed() {
  const { matchupId } = useParams();
  return <VotingPage key={matchupId} />;
}
import AdminPage from './pages/AdminPage';
import StreamPage from './pages/StreamPage';
import EmbedPage from './pages/EmbedPage';
import SeedingIntakePage from './pages/SeedingIntakePage';
import SeedingBallotPage from './pages/SeedingBallotPage';

// Toggle dark theme on body for admin routes
function ThemeToggle() {
  const loc = useLocation();
  React.useEffect(() => {
    if (loc.pathname.startsWith('/admin')) {
      document.body.classList.add('theme-dark');
    } else {
      document.body.classList.remove('theme-dark');
    }
    return () => document.body.classList.remove('theme-dark');
  }, [loc.pathname]);
  return null;
}

function Nav() {
  const loc = useLocation();
  // Hide nav on stream and embed pages
  if (loc.pathname === '/stream' || loc.pathname === '/embed') return null;
  return (
    <nav className="site-nav">
      <div className="nav-inner">
        <Link to="/" className="nav-brand">
          <img src="/Middle-earth-March-Madness-2026.png" alt="Middle-earth March Madness 2026" className="nav-logo-img" />
        </Link>
        <div className="nav-links">
          <Link to="/" className={loc.pathname === '/' ? 'active' : ''}>Bracket</Link>
          <Link to="/admin" className={loc.pathname.startsWith('/admin') ? 'active' : ''}>Admin</Link>
        </div>
      </div>
      <style>{`
        .nav-brand {
          display: flex;
          align-items: center;
          text-decoration: none;
        }
        .nav-logo-img {
          height: 80px;
          width: auto;
        }
        @media (max-width: 640px) {
          .nav-inner { height: 70px; }
          .nav-logo-img { height: 60px; }
          .nav-links { gap: 16px; }
          .nav-links a { font-size: 0.75rem; letter-spacing: 0.06em; }
          .nav-stream-link { display: none; }
        }
      `}</style>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeToggle />
      <Nav />
      <Routes>
        <Route path="/" element={<BracketPage />} />
        <Route path="/vote/:matchupId" element={<VotingPageKeyed />} />
        <Route path="/admin/*" element={<AdminPage />} />
        <Route path="/seeding" element={<SeedingBallotPage />} />
        <Route path="/seeding/intake" element={<SeedingIntakePage />} />
        <Route path="/stream" element={<StreamPage />} />
        <Route path="/embed" element={<EmbedPage />} />
      </Routes>
    </BrowserRouter>
  );
}
