import React, { useState, useEffect } from 'react';
import { Shield, Radio, Activity, LayoutDashboard, ShoppingCart, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { MOCK_DETECTIONS, MOCK_TRACES, CATEGORY_STYLES } from './constants';
import { DetectionCategory, AppView, AppSettings, Trace, TraceStatus } from './types';
import StatsCard from './components/StatsCard';
import DetectionCard from './components/DetectionCard';
import Sidebar from './components/Sidebar';
import LeftNav from './components/LeftNav';
import TraceDetail from './components/TraceDetail';
import TraceList from './components/TraceList';
import Settings from './components/Settings';
import SystemMetrics from './components/SystemMetrics';

const App: React.FC = () => {
  // Data State
  const [traces, setTraces] = useState<Trace[]>(MOCK_TRACES);

  // Navigation State
  const [currentView, setCurrentView] = useState<AppView>('dashboard');
  const [selectedTrace, setSelectedTrace] = useState<Trace | null>(null);

  // Filter State (Dashboard)
  const [activeCategories, setActiveCategories] = useState<DetectionCategory[]>(
    Object.keys(CATEGORY_STYLES) as DetectionCategory[]
  );

  // Settings State
  const [settings, setSettings] = useState<AppSettings>({
    categories: Object.keys(CATEGORY_STYLES).reduce((acc, key) => ({...acc, [key]: true}), {} as any),
    sensitivity: 'medium',
    riskThreshold: 70
  });

  // Notification State
  const [toast, setToast] = useState<{message: string, type: 'success' | 'alert' | 'info'} | null>(null);

  // Clear toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Derived Data
  const categoryCounts: Record<DetectionCategory, number> = Object.keys(CATEGORY_STYLES).reduce((acc, cat) => {
    acc[cat as DetectionCategory] = MOCK_DETECTIONS.filter(d => d.category === cat).length;
    return acc;
  }, {} as Record<DetectionCategory, number>);

  const filteredDetections = MOCK_DETECTIONS.filter(d => 
    activeCategories.includes(d.category) && 
    settings.categories[d.category] && 
    d.riskScore >= settings.riskThreshold 
  );

  // Handlers
  const handleNavigate = (view: AppView) => {
    setCurrentView(view);
    setSelectedTrace(null); // Clear selection when changing main views
  };

  const handleViewTraceFromDashboard = (eventId: string) => {
    const trace = traces.find(t => t.detectionEvent?.id === eventId);
    if (trace) {
      setSelectedTrace(trace);
      setCurrentView('traces');
    }
  };

  const handleSelectTraceFromList = (trace: Trace) => {
    setSelectedTrace(trace);
  };

  const handleBackToTraceList = () => {
    setSelectedTrace(null);
  };

  const handleTraceAction = (traceId: string, action: 'confirm' | 'review' | 'false_positive') => {
    let newStatus: TraceStatus = 'flagged';
    let message = '';
    let type: 'success' | 'alert' | 'info' = 'info';

    switch (action) {
      case 'confirm':
        newStatus = 'confirmed';
        message = 'Manipulation confirmed';
        type = 'alert';
        break;
      case 'review':
        newStatus = 'reviewed';
        message = 'Marked as reviewed';
        type = 'success';
        break;
      case 'false_positive':
        newStatus = 'false_positive';
        message = 'Marked as false positive';
        type = 'info';
        break;
    }

    // Update global trace list state
    const updatedTraces = traces.map(t => t.id === traceId ? { ...t, status: newStatus } : t);
    setTraces(updatedTraces);

    // Update currently selected trace if applicable
    if (selectedTrace && selectedTrace.id === traceId) {
      setSelectedTrace({ ...selectedTrace, status: newStatus });
    }

    setToast({ message, type });
  };

  const toggleCategory = (cat: DetectionCategory) => {
    setActiveCategories(prev => 
      prev.includes(cat) 
        ? prev.filter(c => c !== cat)
        : [...prev, cat]
    );
  };

  const handleSettingsUpdate = (newSettings: AppSettings) => {
    setSettings(newSettings);
  };

  // Render Logic
  const renderContent = () => {
    if (currentView === 'settings') {
      return <Settings settings={settings} onUpdate={handleSettingsUpdate} />;
    }

    if (currentView === 'traces') {
      if (selectedTrace) {
        return (
          <TraceDetail 
            trace={selectedTrace} 
            onBack={handleBackToTraceList} 
            onAction={handleTraceAction}
          />
        );
      }
      return <TraceList traces={traces} onSelectTrace={handleSelectTraceFromList} />;
    }

    // Default: Dashboard View
    return (
      <>
          {/* New Metrics Section */}
          <SystemMetrics counts={categoryCounts} />

          {/* Stats Cards Row (Retained for quick access to specific counts, but could be removed if redundant) */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            {(Object.keys(CATEGORY_STYLES) as DetectionCategory[]).map(cat => (
              <StatsCard key={cat} style={CATEGORY_STYLES[cat]} count={categoryCounts[cat]} />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            
            {/* Main Feed */}
            <div className="lg:col-span-3 space-y-4">
              <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                    <Radio size={18} className="text-cyan-500" />
                    Detection Feed
                  </h2>
                  <span className="text-xs text-slate-500">Showing {filteredDetections.length} events</span>
              </div>
              
              {filteredDetections.length > 0 ? (
                filteredDetections.map((event) => (
                  <DetectionCard 
                    key={event.id} 
                    event={event} 
                    onViewTrace={handleViewTraceFromDashboard}
                  />
                ))
              ) : (
                <div className="text-center py-20 text-slate-500 bg-slate-900/30 rounded-xl border border-dashed border-slate-800">
                  No detections found for selected filters or thresholds.
                </div>
              )}
            </div>

            {/* Right Sidebar */}
            <div className="lg:col-span-1">
              <Sidebar 
                  activeCategories={activeCategories}
                  toggleCategory={toggleCategory}
                  counts={categoryCounts}
              />
            </div>
          </div>
      </>
    );
  };

  const getPageTitle = () => {
    if (currentView === 'dashboard') return 'Live Monitoring Dashboard';
    if (currentView === 'traces') return selectedTrace ? `Investigation: ${selectedTrace.id}` : 'Trace History';
    return 'System Settings';
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black font-sans selection:bg-cyan-500/30 flex">
      
      {/* Navigation Sidebar */}
      <LeftNav currentView={currentView} onNavigate={handleNavigate} />

      {/* Main Content Area */}
      <div className="flex-1 ml-64 relative">
        
        {/* Global Header */}
        <header className="sticky top-0 z-40 glass-panel border-b border-slate-800 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-lg font-bold text-slate-200">
                {getPageTitle()}
              </h1>
              {currentView === 'dashboard' && (
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                  <span className="text-[10px] font-bold text-red-400 tracking-wider uppercase">Live</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-6">
               {/* Simplified Header - Removed Session Risk */}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="max-w-7xl mx-auto px-6 py-8">
          {renderContent()}
        </main>

        {/* Toast Notification */}
        {toast && (
          <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5 duration-300">
            <div className={`
              flex items-center gap-3 px-6 py-3 rounded-full shadow-lg border backdrop-blur-md
              ${toast.type === 'alert' ? 'bg-red-900/80 border-red-700 text-white' : 
                toast.type === 'success' ? 'bg-emerald-900/80 border-emerald-700 text-white' : 
                'bg-slate-800/90 border-slate-600 text-slate-200'}
            `}>
              {toast.type === 'alert' && <AlertTriangle size={18} />}
              {toast.type === 'success' && <CheckCircle size={18} />}
              {toast.type === 'info' && <Info size={18} />}
              <span className="font-medium text-sm">{toast.message}</span>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default App;