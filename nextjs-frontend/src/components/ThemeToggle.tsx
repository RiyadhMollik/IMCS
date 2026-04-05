import { useTheme } from '@/contexts/ThemeContext';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
      title={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
      className="fixed top-6 right-5 z-[100] group"
    >
      <div className="relative w-16 h-9 rounded-full border border-cyan-300/40 bg-gradient-to-r from-slate-800 to-slate-700 shadow-[0_8px_28px_rgba(8,47,73,0.35)] transition-all duration-300 group-hover:scale-105 data-[light=true]:from-sky-100 data-[light=true]:to-cyan-50 data-[light=true]:border-cyan-500/40" data-light={isLight}>
        <div className={`absolute top-1 h-7 w-7 rounded-full transition-all duration-300 ${
          isLight
            ? 'left-8 bg-gradient-to-br from-amber-300 to-orange-400 shadow-[0_0_16px_rgba(251,191,36,0.8)]'
            : 'left-1 bg-gradient-to-br from-cyan-200 to-cyan-400 shadow-[0_0_16px_rgba(34,211,238,0.6)]'
        }`}>
          <span className="absolute inset-0 flex items-center justify-center text-[10px]">
            {isLight ? '☀' : '☾'}
          </span>
        </div>
      </div>
    </button>
  );
}
