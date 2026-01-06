import React from 'react';
import { LayoutDashboard, List, Settings, Shield, FileText } from 'lucide-react';
import { AppView } from '../types';

interface LeftNavProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
}

const LeftNav: React.FC<LeftNavProps> = ({ currentView, onNavigate }) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'traces', label: 'Traces', icon: List },
    { id: 'audit', label: 'Queue', icon: FileText },
    { id: 'settings', label: 'Settings', icon: Settings },
  ] as const;

  return (
    <div className="w-64 h-screen fixed left-0 top-0 bg-slate-950 border-r border-slate-800 flex flex-col z-50">
      {/* Brand */}
      <div className="h-16 flex items-center px-6 border-b border-slate-800 gap-3">
        <div className="bg-gradient-to-tr from-cyan-500 to-blue-600 p-1.5 rounded-lg shadow-[0_0_15px_rgba(6,182,212,0.3)]">
          <Shield className="text-white w-5 h-5" />
        </div>
        <span className="font-bold text-slate-100 tracking-tight">Thought Guards</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-6 px-3 space-y-1">
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id as AppView)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-cyan-900/20 text-cyan-400 border border-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <item.icon size={18} className={isActive ? 'text-cyan-400' : 'text-slate-500'} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* User / Footer */}
      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600 flex items-center justify-center text-xs font-bold text-slate-300">
            AD
          </div>
          <div className="flex-1">
            <p className="text-xs font-medium text-slate-200">Admin User</p>
            <p className="text-[10px] text-slate-500">Security Ops</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeftNav;