import { useTheme } from '@/contexts/ThemeContext';
import { useRouter } from 'next/router';

interface ThemeToggleProps {
  placement?: 'floating' | 'sidebar' | 'inline';
}

export default function ThemeToggle({ placement = 'floating' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const isLight = theme === 'light';
  const isMessagesPage = router.pathname === '/messages';
  const isDashboardPage = router.pathname === '/dashboard';

  if (placement === 'floating' && (isMessagesPage || isDashboardPage)) {
    return null;
  }

  if (placement === 'sidebar') {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
        title={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
        className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-slate-200 hover:text-cyan-100 hover:bg-cyan-500/20 transition flex items-center justify-center"
      >
        {isLight ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M17 12a5 5 0 11-10 0 5 5 0 0110 0z" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9 9 0 1020.354 15.354z" />
          </svg>
        )}
      </button>
    );
  }

  if (placement === 'inline') {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
        title={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
        className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-500/20 transition"
      >
        {isLight ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M17 12a5 5 0 11-10 0 5 5 0 0110 0z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9 9 0 1020.354 15.354z" />
          </svg>
        )}
        {isLight ? 'Light' : 'Dark'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
      title={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
      className="fixed z-[100] group top-6 right-5 hidden md:block"
    >
      <div className="relative w-14 h-8 sm:w-16 sm:h-9 rounded-full border border-cyan-300/40 bg-gradient-to-r from-slate-800 to-slate-700 shadow-[0_8px_28px_rgba(8,47,73,0.35)] transition-all duration-300 group-hover:scale-105 data-[light=true]:from-sky-100 data-[light=true]:to-cyan-50 data-[light=true]:border-cyan-500/40" data-light={isLight}>
        <div className={`absolute top-1 h-6 w-6 sm:h-7 sm:w-7 rounded-full transition-all duration-300 ${
          isLight
            ? 'left-7 sm:left-8 bg-gradient-to-br from-amber-300 to-orange-400 shadow-[0_0_16px_rgba(251,191,36,0.8)]'
            : 'left-1 bg-gradient-to-br from-cyan-200 to-cyan-400 shadow-[0_0_16px_rgba(34,211,238,0.6)]'
        }`}>
          <span className="absolute inset-0 flex items-center justify-center text-[9px] sm:text-[10px]">
            {isLight ? '☀' : '☾'}
          </span>
        </div>
      </div>
    </button>
  );
}
