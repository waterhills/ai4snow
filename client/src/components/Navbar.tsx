import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';

export default function Navbar() {
  const { isLoggedIn, user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const navLinkStyle = (pathMatch: string) => {
    return location.pathname.startsWith(pathMatch) && (pathMatch !== '/' || location.pathname === '/')
      ? "text-[#72dcff] border-b-2 border-[#72dcff] pb-1"
      : "text-[#dbe6ff]/70 hover:text-[#72dcff] transition-colors p-2 hover:bg-[#72dcff]/10 rounded-lg";
  };

  return (
    <nav className="fixed top-0 w-full z-50 bg-[#010e24]/40 backdrop-blur-xl border-b border-[#72dcff]/15 shadow-[0_0_20px_rgba(114,220,255,0.05)]">
      <div className="flex justify-between items-center px-8 h-20 w-full max-w-screen-2xl mx-auto font-headline tracking-tight">
        <Link to="/" className="text-2xl font-bold tracking-tighter text-[#72dcff] uppercase">
          GLACIAL LAB
        </Link>

        {/* Core exactly 4 navigation pages mapping to templates */}
        <div className="hidden md:flex gap-10 items-center font-headline">
          <Link className={navLinkStyle('/')} to="/">Home</Link>
          <Link className={navLinkStyle('/upload')} to="/upload">Upload</Link>
          <Link className={navLinkStyle('/results')} to="/results">Results</Link>
          <Link className={navLinkStyle('/pricing')} to="/pricing">Pricing</Link>
        </div>

        <div className="flex items-center gap-4">
          {isLoggedIn ? (
            <div className="flex gap-4 items-center">
              <div className="hidden md:flex items-center px-3 py-1 bg-surface-container-high rounded-full border border-primary/20">
                <span className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest mr-2">Token Bank</span>
                <span className="text-primary text-sm font-headline font-bold">{user?.credits ?? 0}</span>
              </div>
              
              <button 
                title="Logout"
                onClick={handleLogout}
                className="p-2 text-on-surface-variant hover:text-error hover:bg-error/10 hover:shadow-[0_0_15px_rgba(255,113,108,0.3)] transition-all duration-300 rounded-full active:scale-95 flex items-center justify-center"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 24 }}>logout</span>
              </button>
            </div>
          ) : (
             <div className="flex gap-4 items-center font-headline">
               <Link to="/login" className="text-[#dbe6ff]/70 hover:text-[#72dcff] transition-colors text-sm font-medium uppercase tracking-wider">Log In</Link>
             </div>
          )}

          {isLoggedIn && (
            <Link to="/pricing" title="Profile Dashboard" className="material-symbols-outlined text-[#72dcff] hover:bg-[#72dcff]/10 hover:shadow-[0_0_15px_rgba(114,220,255,0.3)] transition-all duration-300 p-2 rounded-full active:scale-95">
              account_circle
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
