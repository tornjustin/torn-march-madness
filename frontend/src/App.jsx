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

function Nav() {
  const loc = useLocation();
  // Hide nav on stream and embed pages
  if (loc.pathname === '/stream' || loc.pathname === '/embed') return null;
  return (
    <nav className="site-nav">
      <div className="nav-inner">
        <div className="nav-brand">
          <a href="https://www.theonering.net" target="_blank" rel="noopener noreferrer" className="nav-torn-logo">
            <img src="/torn-logo.png" alt="TheOneRing.net" />
          </a>
          <Link to="/" className="nav-logo">
            <span className="nav-logo-main">Middle-earth</span>
            <span className="nav-logo-sub">March Madness</span>
          </Link>
        </div>
        <div className="nav-links">
          <Link to="/" className={loc.pathname === '/' ? 'active' : ''}>Bracket</Link>
          <Link to="/admin" className={loc.pathname.startsWith('/admin') ? 'active' : ''}>Admin</Link>
        </div>
      </div>
      <style>{`
        .nav-brand {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .nav-torn-logo {
          display: flex;
          align-items: center;
          flex-shrink: 0;
        }
        .nav-torn-logo img {
          height: 44px;
          width: auto;
        }
        @media (max-width: 640px) {
          .nav-inner { height: 56px; }
          .nav-logo-main { font-size: 0.9rem; }
          .nav-logo-sub { font-size: 0.6rem; }
          .nav-links { gap: 16px; }
          .nav-links a { font-size: 0.75rem; letter-spacing: 0.06em; }
          .nav-stream-link { display: none; }
          .nav-torn-logo img { height: 36px; }
          .nav-brand { gap: 8px; }
        }
      `}</style>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
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
