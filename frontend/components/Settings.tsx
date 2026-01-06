import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Settings as SettingsIcon, Sliders, AlertCircle, ToggleLeft, ToggleRight, Eye, EyeOff, RefreshCw, Database, Loader2 } from 'lucide-react';
import { AppSettings, DetectionCategory } from '../types';
import { CATEGORY_STYLES } from '../constants';
import { AVAILABLE_SKILLS, CATEGORY_TO_SKILL } from '../lib/skillsRegistry';

interface SettingsProps {
  settings: AppSettings;
  onUpdate: (newSettings: AppSettings) => void;
}

const Settings: React.FC<SettingsProps> = ({ settings, onUpdate }) => {
  const [showApiKeys, setShowApiKeys] = useState<Record<string, boolean>>({});
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [apiKeyValidation, setApiKeyValidation] = useState<Record<string, {
    status: 'idle' | 'validating' | 'valid' | 'invalid';
    message?: string;
  }>>({});
  const [availableGeminiModels, setAvailableGeminiModels] = useState<Array<{ name: string; displayName: string }>>([]);
  const [syncStatus, setSyncStatus] = useState<{ 
    loading: boolean; 
    message?: string; 
    error?: string; 
    stats?: any; 
    isLocked?: boolean; 
    startedAt?: string;
    duration?: number;
    progress?: { filesProcessed: number; totalFiles: number; conversationsProcessed: number };
    successfulFiles?: string[];
    failedFiles?: Array<{ path: string; reason: string }>;
    detailedErrors?: Array<{
      message: string;
      sqlPreview?: string;
      sqlLength?: number;
      reference?: string;
      statementNumber?: number;
    }>;
    showDetails?: boolean;
    completed?: boolean;
    cancelled?: boolean;
  }>({ loading: false });
  
  const [activeSection, setActiveSection] = useState<string>('detection-models');
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const validateApiKey = useCallback(async (key: string, value: string): Promise<void> => {
    if (!value || value.trim() === '') {
      setApiKeyValidation(prev => ({ ...prev, [key]: { status: 'idle' } }));
      return;
    }

    setApiKeyValidation(prev => ({ ...prev, [key]: { status: 'validating', message: 'Validating...' } }));

    try {
      if (key === 'gemini') {
        // Test Gemini API key with a simple model list request
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${value}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.error?.message || `API returned ${response.status}`);
        }

        const data = await response.json();
        if (data.models && Array.isArray(data.models)) {
          // Filter models that support generateContent and are text models
          const textModels = data.models
            .filter((model: any) => {
              // Check if model supports generateContent
              const supportedMethods = model.supportedGenerationMethods || [];
              return supportedMethods.includes('generateContent') && 
                     !model.name.includes('embedding') && 
                     !model.name.includes('embed');
            })
            .map((model: any) => {
              // Extract display name (e.g., "gemini-3-flash-preview" -> "Gemini 3 Flash Preview")
              const name = model.name.replace('models/', '');
              const displayName = name
                .split('-')
                .map((word: string, idx: number) => {
                  if (idx === 0) return word.charAt(0).toUpperCase() + word.slice(1);
                  if (word === 'flash' || word === 'pro') return word.charAt(0).toUpperCase() + word.slice(1);
                  if (word === 'preview' || word === 'exp' || word === 'experimental') return word.charAt(0).toUpperCase() + word.slice(1);
                  return word;
                })
                .join(' ')
                .replace(/\bexp\b/gi, 'Experimental')
                .replace(/\bpreview\b/gi, 'Preview');
              
              return { name, displayName };
            })
            .sort((a: any, b: any) => {
              // Sort by version number (3.x before 2.x before 1.x)
              const aVersion = parseInt(a.name.match(/gemini-(\d+)/)?.[1] || '0');
              const bVersion = parseInt(b.name.match(/gemini-(\d+)/)?.[1] || '0');
              if (bVersion !== aVersion) return bVersion - aVersion;
              // Then by name
              return a.name.localeCompare(b.name);
            });
          
          setAvailableGeminiModels(textModels);
          setApiKeyValidation(prev => ({ 
            ...prev, 
            [key]: { 
              status: 'valid', 
              message: `✓ Valid (${textModels.length} text models available)` 
            } 
          }));
        } else {
          throw new Error('Invalid API response');
        }
      } else {
        // For other providers, we could add validation later
        setApiKeyValidation(prev => ({ 
          ...prev, 
          [key]: { status: 'idle' } 
      }));
    }
    } catch (error: any) {
      const errorMessage = error.message || 'Validation failed';
      setApiKeyValidation(prev => ({ 
        ...prev, 
        [key]: { 
          status: 'invalid', 
          message: `✗ ${errorMessage}` 
        } 
      }));
      // Clear available models on validation error
      if (key === 'gemini') {
        setAvailableGeminiModels([]);
      }
    }
  }, []);

  // Load API keys from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const loadedKeys = {
        gemini: localStorage.getItem('BYOK_API_KEY') || localStorage.getItem('GEMINI_API_KEY') || '',
        deepseek: localStorage.getItem('DEEPSEEK_API_KEY') || '',
        anthropic: localStorage.getItem('ANTHROPIC_API_KEY') || '',
        openai: localStorage.getItem('OPENAI_API_KEY') || ''
      };
      setApiKeys(loadedKeys);
      
      // Validate Gemini key if it exists
      if (loadedKeys.gemini) {
        validateApiKey('gemini', loadedKeys.gemini);
      }
    }
  }, [validateApiKey]);

  // Handle scroll to detect active section
  useEffect(() => {
    const handleScroll = () => {
      const sections = [
        'detection-models',
        'auditor-config',
        'sensitivity-threshold',
        'api-keys',
        'chatbot-config',
        'database-management'
      ];
      
      const scrollPosition = window.scrollY + 200; // Offset for header
      
      for (let i = sections.length - 1; i >= 0; i--) {
        const sectionId = sections[i];
        const element = sectionRefs.current[sectionId];
        if (element) {
          const offsetTop = element.offsetTop;
          if (scrollPosition >= offsetTop) {
            setActiveSection(sectionId);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Check on mount
    
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (sectionId: string) => {
    const element = sectionRefs.current[sectionId];
    if (element) {
      const offsetTop = element.offsetTop - 100; // Account for sticky header
      window.scrollTo({
        top: offsetTop,
        behavior: 'smooth'
      });
      setActiveSection(sectionId);
      // Update URL hash for direct navigation
      window.history.replaceState(null, '', `#settings/${sectionId}`);
    }
  };

  // Handle URL hash on mount and when hash changes
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#settings/')) {
        const sectionId = hash.replace('#settings/', '');
        if (sectionRefs.current[sectionId]) {
          scrollToSection(sectionId);
        }
      }
    };

    // Check hash on mount
    handleHashChange();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Poll for sync status
  useEffect(() => {
    const checkSyncStatus = async () => {
      try {
        const response = await fetch('/api/sync-conversations');
        if (response.ok) {
          const data = await response.json();
          // Debug logging to verify errors are being received
          if (data.detailedErrors && data.detailedErrors.length > 0) {
            console.log('[Sync UI] Received detailed errors:', data.detailedErrors.length);
            console.log('[Sync UI] First error:', data.detailedErrors[0].message?.substring(0, 100));
          } else {
            console.log('[Sync UI] No detailed errors in response (isLocked:', data.isLocked, ', completed:', data.completed, ')');
          }
          if (data.isLocked) {
            const duration = data.duration || 0;
            const minutes = Math.floor(duration / 60);
            const seconds = duration % 60;
            const durationText = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
            
            let message = `Sync in progress (${durationText})...`;
            if (data.progress && data.progress.totalFiles > 0) {
              const percent = Math.round((data.progress.filesProcessed / data.progress.totalFiles) * 100);
              const successful = data.progress.successfulFiles?.length || 0;
              const failed = data.progress.failedFiles?.length || 0;
              const sqlErrorCount = data.detailedErrors?.length || data.progress?.sqlErrorCount || 0;
              
              if (data.progress.currentPhase === 'sql-execution' && data.progress.sqlStatementsTotal) {
                const sqlPercent = Math.round((data.progress.sqlStatementsExecuted || 0) / data.progress.sqlStatementsTotal * 100);
                message = `Executing SQL... ${data.progress.sqlStatementsExecuted || 0}/${data.progress.sqlStatementsTotal} statements (${sqlPercent}%)`;
                if (sqlErrorCount > 0) {
                  message += ` - ✗ ${sqlErrorCount} SQL errors`;
                }
              } else {
                message = `Syncing... ${data.progress.filesProcessed}/${data.progress.totalFiles} files (${percent}%) - ${data.progress.conversationsProcessed} conversations`;
                // Always show passed/failed counts if available, including SQL errors
                if (successful > 0 || failed > 0 || sqlErrorCount > 0) {
                  message += ` - ✓ ${successful} passed`;
                  if (failed > 0 || sqlErrorCount > 0) {
                    message += `, ✗ ${failed} failed`;
                    if (sqlErrorCount > 0) {
                      message += ` (${sqlErrorCount} SQL errors)`;
                    }
                  }
                }
              }
            }
            
            setSyncStatus(prev => ({
              ...prev,
              loading: true,
              isLocked: true,
              startedAt: data.startedAt,
              duration: duration,
              progress: data.progress,
              message: message,
              // Include detailed errors if available (for real-time display during sync)
              detailedErrors: data.detailedErrors || prev.detailedErrors || []
            }));
          } else if (data.completed) {
            // Sync completed (check completed flag first)
            const hasErrors = (data.errors && data.errors.length > 0) || (data.detailedErrors && data.detailedErrors.length > 0);
            const message = data.cancelled 
              ? `Sync cancelled. Processed ${data.stats?.conversationsProcessed || 0} conversations from ${data.stats?.successfulFiles || 0} files before cancellation. ${data.stats?.failedFiles || 0} files failed.`
              : hasErrors
              ? `Sync completed with ${data.errors?.length || data.detailedErrors?.length || 0} errors. Processed ${data.stats?.conversationsProcessed || 0} conversations from ${data.stats?.successfulFiles || 0} files. ${data.stats?.failedFiles || 0} files failed.`
              : `Sync completed! Processed ${data.stats?.conversationsProcessed || 0} conversations from ${data.stats?.successfulFiles || 0} files. ${data.stats?.failedFiles || 0} files failed.`;
            
            console.log('[Sync UI] Detected completion:', { completed: data.completed, hasErrors, errors: data.errors?.length, detailedErrors: data.detailedErrors?.length });
            
            setSyncStatus({
              loading: false,
              isLocked: false,
              completed: true,
              cancelled: data.cancelled || false,
              message: message,
              stats: data.stats,
              successfulFiles: data.successfulFiles || [],
              failedFiles: data.failedFiles || [],
              detailedErrors: data.detailedErrors || [],
              showDetails: (data.failedFiles && data.failedFiles.length > 0) || hasErrors || false,
              duration: data.duration
            });
            // Stop polling - sync is complete
            // Only refresh if not cancelled and no errors
            if (!data.cancelled && !hasErrors) {
              setTimeout(() => {
                window.location.reload();
              }, 3000);
            }
          } else if (!data.isLocked && data.stats && !data.isLocked) {
            // Lock was released and we have stats - sync completed
            const hasErrors = (data.errors && data.errors.length > 0) || (data.detailedErrors && data.detailedErrors.length > 0);
            const message = hasErrors
              ? `Sync completed with ${data.errors?.length || data.detailedErrors?.length || 0} errors. Processed ${data.stats?.conversationsProcessed || 0} conversations from ${data.stats?.successfulFiles || 0} files. ${data.stats?.failedFiles || 0} files failed.`
              : `Sync completed! Processed ${data.stats?.conversationsProcessed || 0} conversations from ${data.stats?.successfulFiles || 0} files. ${data.stats?.failedFiles || 0} files failed.`;
            
            console.log('[Sync UI] Detected completion via stats:', { hasStats: !!data.stats, hasErrors });
            
            setSyncStatus({
              loading: false,
              isLocked: false,
              completed: true,
              message: message,
              stats: data.stats,
              successfulFiles: data.successfulFiles || [],
              failedFiles: data.failedFiles || [],
              detailedErrors: data.detailedErrors || [],
              showDetails: (data.failedFiles && data.failedFiles.length > 0) || hasErrors || false,
              duration: data.duration
            });
            // Only refresh if no errors
            if (!hasErrors) {
              setTimeout(() => {
                window.location.reload();
              }, 3000);
            }
          } else if (data.error) {
            // Sync failed
            setSyncStatus({
              loading: false,
              isLocked: false,
              error: data.error
            });
          } else if (syncStatus.loading && !syncStatus.stats) {
            // Sync was running but now completed (we'll get the result from the POST response)
            setSyncStatus(prev => ({ ...prev, isLocked: false }));
          }
        }
      } catch (error) {
        // Ignore errors when checking status
      }
    };

    // Check immediately
    checkSyncStatus();

    // Poll every 1 second if sync is in progress for better progress updates
    const interval = setInterval(() => {
      // Continue polling if loading, locked, or if we're waiting for completion data
      if (syncStatus.loading || syncStatus.isLocked || (!syncStatus.completed && syncStatus.loading)) {
        checkSyncStatus();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [syncStatus.loading, syncStatus.isLocked, syncStatus.completed]);

  const updateApiKey = (key: string, value: string) => {
    if (typeof window === 'undefined') return;
    
    const newKeys = { ...apiKeys, [key]: value };
    setApiKeys(newKeys);

    // Save to localStorage
    if (key === 'gemini') {
      if (value) {
        localStorage.setItem('BYOK_API_KEY', value);
        localStorage.setItem('GEMINI_API_KEY', value);
      } else {
        localStorage.removeItem('BYOK_API_KEY');
        localStorage.removeItem('GEMINI_API_KEY');
      }
    } else {
      const storageKey = key.toUpperCase() + '_API_KEY';
      if (value) {
        localStorage.setItem(storageKey, value);
      } else {
        localStorage.removeItem(storageKey);
      }
    }

    // Reset validation status when key changes
    setApiKeyValidation(prev => ({ ...prev, [key]: { status: 'idle' } }));
  };

  const handleApiKeyBlur = async (key: string, value: string) => {
    if (value && value.trim() !== '') {
      await validateApiKey(key, value);
    }
  };
  
  const toggleCategory = (cat: DetectionCategory) => {
    onUpdate({
      ...settings,
      categories: {
        ...settings.categories,
        [cat]: !settings.categories[cat]
      }
    });
  };

  const setSensitivity = (val: 'low' | 'medium' | 'high') => {
    onUpdate({ ...settings, sensitivity: val });
  };

  const setThreshold = (val: number) => {
    onUpdate({ ...settings, riskThreshold: val });
  };

  const setSkillForCategory = (cat: DetectionCategory, skillId: string) => {
    onUpdate({
      ...settings,
      activeSkills: {
        ...settings.activeSkills,
        [cat]: skillId
      }
    });
  };

  const handleCancelSync = async () => {
    try {
      const response = await fetch('/api/sync-conversations', {
        method: 'DELETE'
      });
      const data = await response.json();
      if (data.success) {
        setSyncStatus(prev => ({
          ...prev,
          message: 'Cancellation requested...',
          isLocked: true // Keep locked until it actually stops
        }));
      }
    } catch (error: any) {
      console.error('Failed to cancel sync:', error);
    }
  };

  const handleSyncConversations = async () => {
    // Check if sync is already in progress
    if (syncStatus.isLocked || syncStatus.loading) {
      return;
    }

    setSyncStatus({ loading: true, isLocked: false, message: 'Starting sync...', duration: 0 });
    try {
      const response = await fetch('/api/sync-conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteMissing: false })
      });

      // Check if response is JSON before parsing
      let data: any;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          data = await response.json();
        } catch (jsonError: any) {
          const text = await response.text();
          setSyncStatus({
            loading: false,
            isLocked: false,
            error: `Invalid JSON response: ${text.substring(0, 200)}`
          });
          return;
        }
      } else {
        const text = await response.text();
        setSyncStatus({
          loading: false,
          isLocked: false,
          error: `Unexpected response: ${text.substring(0, 200)}`
        });
        return;
      }
      
      if (response.status === 409) {
        // Conflict - sync already in progress
        setSyncStatus({
          loading: true,
          isLocked: true,
          message: data.message || 'Sync already in progress',
          startedAt: data.startedAt
        });
        return;
      }
      
      if (data.success) {
        // Sync started - polling will handle completion
        setSyncStatus({
          loading: true,
          isLocked: true,
          message: data.message || 'Sync started',
          startedAt: data.startedAt
        });
      } else {
        setSyncStatus({
          loading: false,
          isLocked: false,
          error: data.message || data.error || 'Sync failed'
        });
      }
    } catch (error: any) {
      setSyncStatus({
        loading: false,
        isLocked: false,
        error: error.message || 'Failed to sync conversations'
      });
    }
  };

  const sections = [
    { id: 'detection-models', label: 'Active Detection Models', icon: Sliders },
    { id: 'auditor-config', label: 'Auditor Configuration', icon: Sliders },
    { id: 'sensitivity-threshold', label: 'Sensitivity & Threshold', icon: AlertCircle },
    { id: 'api-keys', label: 'API Key Configuration', icon: Sliders },
    { id: 'chatbot-config', label: 'Chatbot Configuration', icon: Sliders },
    { id: 'database-management', label: 'Database Management', icon: Database },
  ];

  return (
    <div className="flex gap-8 max-w-7xl mx-auto py-8">
      {/* Sidebar Navigation */}
      <div className="w-64 flex-shrink-0 sticky top-24 h-fit">
        <div className="glass-panel p-4 rounded-xl border-slate-800">
          <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">
            Sections
          </h3>
          <nav className="space-y-1">
            {sections.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  data-testid={`settings-section-${section.id}`}
                  data-automation={`settings-section-${section.id}`}
                  onClick={() => scrollToSection(section.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                    isActive
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                  aria-label={`Navigate to ${section.label} section`}
                >
                  <Icon size={16} />
                  <span className="text-left">{section.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 space-y-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
            <SettingsIcon className="text-slate-400" />
            System Configuration
          </h2>
          <p className="text-slate-500 mt-2">Manage detection parameters and alerting thresholds.</p>
        </div>

        {/* Category Toggles */}
        <div 
          id="detection-models"
          ref={(el) => (sectionRefs.current['detection-models'] = el)}
          className="glass-panel p-6 rounded-xl border-slate-800 scroll-mt-24"
        >
          <h3 className="text-lg font-semibold text-slate-200 mb-6 flex items-center gap-2">
            <Sliders size={20} className="text-cyan-500" />
            Active Detection Models
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(CATEGORY_STYLES).map(([key, style]) => {
              const category = key as DetectionCategory;
              const isEnabled = settings.categories[category];
              const currentSkillId = settings.activeSkills?.[category] || CATEGORY_TO_SKILL[category] || AVAILABLE_SKILLS[0].id;
              const currentSkill = AVAILABLE_SKILLS.find(s => s.id === currentSkillId);
              
              return (
                <div 
                  key={key}
                  className={`
                    p-4 rounded-lg border transition-all
                    ${isEnabled 
                      ? 'bg-slate-900/50 border-slate-700' 
                      : 'bg-slate-950 border-slate-800 opacity-60'
                    }
                  `}
                >
                  <div 
                    onClick={() => toggleCategory(category)}
                    className="flex items-center justify-between mb-3 cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                       <div className={`p-2 rounded ${isEnabled ? style.bgColor : 'bg-slate-800'}`}>
                          <div className={`w-4 h-4 rounded-full ${isEnabled ? style.color.replace('text-', 'bg-') : 'bg-slate-600'}`}></div>
                       </div>
                       <span className={`font-medium ${isEnabled ? 'text-slate-200' : 'text-slate-500'}`}>{style.label}</span>
                    </div>
                    {isEnabled 
                      ? <ToggleRight size={28} className="text-cyan-500" /> 
                      : <ToggleLeft size={28} className="text-slate-600" />
                    }
                  </div>
                  
                  {isEnabled && (
                    <div className="mt-3 pt-3 border-t border-slate-700">
                      <label className="text-xs text-slate-400 mb-2 block">Audit Skill</label>
                      <select
                        value={currentSkillId}
                        onChange={(e) => setSkillForCategory(category, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                      >
                        {AVAILABLE_SKILLS.map(skill => (
                          <option key={skill.id} value={skill.id}>
                            {skill.name}
                          </option>
                        ))}
                      </select>
                      {currentSkill && (
                        <p className="text-xs text-slate-500 mt-1">{currentSkill.description}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Auditor Configuration */}
        <div 
          id="auditor-config"
          ref={(el) => (sectionRefs.current['auditor-config'] = el)}
          className={`glass-panel p-6 rounded-xl border-slate-800 scroll-mt-24 ${
            !apiKeys.gemini || apiKeys.gemini.trim() === '' ? 'opacity-60' : ''
          }`}
        >
          <h3 className="text-lg font-semibold text-slate-200 mb-6 flex items-center gap-2">
            <Sliders size={20} className="text-cyan-500" />
            Auditor Configuration
          </h3>
          
          {(!apiKeys.gemini || apiKeys.gemini.trim() === '') ? (
            <div className="bg-amber-500/10 border border-amber-500/50 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <AlertCircle size={18} className="text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-300 mb-1">Gemini API Key Required</p>
                  <p className="text-xs text-amber-200/80">
                    Please enter a Google Gemini API Key in the <a 
                      href="#api-keys" 
                      onClick={(e) => {
                        e.preventDefault();
                        scrollToSection('api-keys');
                      }}
                      className="underline hover:text-amber-300"
                    >API Key Configuration</a> section to use the auditor features.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
          
          <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 ${(!apiKeys.gemini || apiKeys.gemini.trim() === '') ? 'pointer-events-none' : ''}`}>
            <div>
              <label className={`block text-sm font-medium mb-2 ${(!apiKeys.gemini || apiKeys.gemini.trim() === '') ? 'text-slate-500' : 'text-slate-300'}`}>
                Auditor Model
              </label>
              <select
                value={settings.auditorModel || (availableGeminiModels.length > 0 ? availableGeminiModels[0].name : 'gemini-3-flash-preview')}
                onChange={(e) => onUpdate({ ...settings, auditorModel: e.target.value })}
                disabled={!apiKeys.gemini || apiKeys.gemini.trim() === '' || (availableGeminiModels.length === 0 && apiKeyValidation.gemini?.status !== 'validating')}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {availableGeminiModels.length > 0 ? (
                  availableGeminiModels.map((model) => (
                    <option key={model.name} value={model.name}>
                      {model.displayName}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
                    <option value="gemini-3-pro-preview">Gemini 3 Pro Preview</option>
                    <option value="gemini-flash-lite-latest">Gemini Flash Lite</option>
                    <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash Experimental</option>
                  </>
                )}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                {availableGeminiModels.length > 0 
                  ? `Model used for running audits (${availableGeminiModels.length} models available for your API key)`
                  : 'Model used for running audits. Enter and validate your API key to see available models.'}
              </p>
            </div>
            
            <div>
              <label className={`block text-sm font-medium mb-2 ${(!apiKeys.gemini || apiKeys.gemini.trim() === '') ? 'text-slate-500' : 'text-slate-300'}`}>
                Thinking Budget {settings.thinkingBudget !== undefined && `(${settings.thinkingBudget})`}
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  max="10000"
                  step="100"
                  value={settings.thinkingBudget || ''}
                  onChange={(e) => onUpdate({ 
                    ...settings, 
                    thinkingBudget: e.target.value ? parseInt(e.target.value) : undefined 
                  })}
                  disabled={!apiKeys.gemini || apiKeys.gemini.trim() === ''}
                  placeholder="Optional"
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <button
                  onClick={() => onUpdate({ ...settings, thinkingBudget: undefined })}
                  disabled={!apiKeys.gemini || apiKeys.gemini.trim() === ''}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Clear
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">Token budget for reasoning models (optional)</p>
            </div>

            {/* Multi-Run Statistical Analysis */}
            <div className="md:col-span-2 space-y-2">
              <label className="block text-sm font-medium text-slate-300">
                Multi-Run Statistical Analysis
              </label>
              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-2">
                    Number of Runs (1 = single-run, no statistical analysis)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={settings.multiRunCount || 1}
                    onChange={(e) => onUpdate({ 
                      ...settings, 
                      multiRunCount: Math.max(1, parseInt(e.target.value) || 1)
                    })}
                    disabled={!apiKeys.gemini || apiKeys.gemini.trim() === ''}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Run multiple audits with variation to calculate statistical distributions (mean, stddev, quantiles, confidence intervals)
                  </p>
                </div>
                
                {(settings.multiRunCount || 1) > 1 && (
                  <>
                    <div>
                      <label className="block text-xs text-slate-400 mb-2">
                        Temperature (optional, for variation)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="2"
                        step="0.1"
                        value={settings.multiRunTemperature || ''}
                        onChange={(e) => onUpdate({ 
                          ...settings, 
                          multiRunTemperature: e.target.value ? parseFloat(e.target.value) : undefined 
                        })}
                        disabled={!apiKeys.gemini || apiKeys.gemini.trim() === ''}
                        placeholder="Optional (e.g., 0.7)"
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs text-slate-400 mb-2">
                        Seed (optional, for reproducibility)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={settings.multiRunSeed || ''}
                        onChange={(e) => onUpdate({ 
                          ...settings, 
                          multiRunSeed: e.target.value ? parseInt(e.target.value) : undefined 
                        })}
                        disabled={!apiKeys.gemini || apiKeys.gemini.trim() === ''}
                        placeholder="Optional (e.g., 42)"
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
            
            <div className="md:col-span-2">
              <label className={`flex items-center gap-3 ${(!apiKeys.gemini || apiKeys.gemini.trim() === '') ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  checked={settings.includeValidatorCoT !== false}
                  onChange={(e) => onUpdate({ ...settings, includeValidatorCoT: e.target.checked })}
                  disabled={!apiKeys.gemini || apiKeys.gemini.trim() === ''}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <div>
                  <span className={`text-sm font-medium ${(!apiKeys.gemini || apiKeys.gemini.trim() === '') ? 'text-slate-500' : 'text-slate-300'}`}>Include Validator Chain-of-Thought</span>
                  <p className="text-xs text-slate-500 mt-0.5">
                    When enabled, the auditor will analyze both the conversation and any internal reasoning traces (fullCoT) from validators
                  </p>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Sliders & Thresholds */}
        <div 
          id="sensitivity-threshold"
          ref={(el) => (sectionRefs.current['sensitivity-threshold'] = el)}
          className="grid grid-cols-1 md:grid-cols-2 gap-8 scroll-mt-24"
        >
          
          <div className="glass-panel p-6 rounded-xl border-slate-800">
            <h3 className="text-lg font-semibold text-slate-200 mb-6">Model Sensitivity</h3>
            <div className="space-y-6">
              <div className="flex justify-between text-sm font-medium text-slate-400 uppercase tracking-wider">
                <span>Low</span>
                <span>Medium</span>
                <span>High</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="2" 
                step="1"
                value={settings.sensitivity === 'low' ? 0 : settings.sensitivity === 'medium' ? 1 : 2}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setSensitivity(val === 0 ? 'low' : val === 1 ? 'medium' : 'high');
                }}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
              <p className="text-sm text-slate-500">
                Current setting: <strong className="text-cyan-400 uppercase">{settings.sensitivity}</strong>. 
                {settings.sensitivity === 'high' 
                  ? ' Will flag minor anomalies. Expect higher false positive rate.'
                  : settings.sensitivity === 'low'
                  ? ' Only flags critical, high-confidence manipulation attempts.'
                  : ' Balanced configuration for production monitoring.'
                }
              </p>
            </div>
          </div>

          <div className="glass-panel p-6 rounded-xl border-slate-800">
            <h3 className="text-lg font-semibold text-slate-200 mb-6 flex items-center gap-2">
              <AlertCircle size={20} className="text-amber-500" />
              Risk Threshold
            </h3>
            <div className="space-y-4">
              <div className="flex items-end gap-2 mb-2">
                <span className="text-4xl font-bold text-white">{settings.riskThreshold}</span>
                <span className="text-slate-500 mb-1">/ 100</span>
              </div>
              <input 
                type="number" 
                value={settings.riskThreshold}
                onChange={(e) => setThreshold(parseInt(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors"
              />
              <p className="text-sm text-slate-500">
                Alerts below this score will be logged silently without triggering operator notifications.
              </p>
            </div>
          </div>

        </div>

        {/* API Key Configuration */}
        <div 
          id="api-keys"
          ref={(el) => (sectionRefs.current['api-keys'] = el)}
          className="glass-panel p-6 rounded-xl border-slate-800 scroll-mt-24"
        >
          <h3 className="text-lg font-semibold text-slate-200 mb-6 flex items-center gap-2">
            <Sliders size={20} className="text-cyan-500" />
            API Key Configuration
          </h3>
          <div className="space-y-4">
            <div className="bg-amber-500/10 border border-amber-500/50 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle size={18} className="text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-300 mb-1">API Keys Required</p>
                  <p className="text-xs text-amber-200/80">
                    API keys are stored in your browser's localStorage. For production deployment, set environment variables via <code className="bg-slate-900/50 px-1 rounded">wrangler secret put</code> or Cloudflare dashboard.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Google Gemini API Key
                </label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <input
                      type={showApiKeys.gemini ? 'text' : 'password'}
                      value={apiKeys.gemini}
                      onChange={(e) => updateApiKey('gemini', e.target.value)}
                      onBlur={() => handleApiKeyBlur('gemini', apiKeys.gemini)}
                      placeholder="Enter Gemini API key"
                      className={`w-full bg-slate-950 border rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 ${
                        apiKeyValidation.gemini?.status === 'valid' 
                          ? 'border-green-500/50' 
                          : apiKeyValidation.gemini?.status === 'invalid'
                          ? 'border-red-500/50'
                          : 'border-slate-700'
                      }`}
                    />
                    {apiKeyValidation.gemini?.status === 'validating' && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Loader2 size={16} className="animate-spin text-cyan-500" />
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setShowApiKeys({ ...showApiKeys, gemini: !showApiKeys.gemini })}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors"
                    title={showApiKeys.gemini ? "Hide" : "Show"}
                  >
                    {showApiKeys.gemini ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                  {apiKeys.gemini && (
                    <button
                      onClick={() => validateApiKey('gemini', apiKeys.gemini)}
                      disabled={apiKeyValidation.gemini?.status === 'validating'}
                      className="px-3 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg text-sm transition-colors"
                      title="Test API key"
                    >
                      {apiKeyValidation.gemini?.status === 'validating' ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        'Test'
                      )}
                    </button>
                  )}
                </div>
                {apiKeyValidation.gemini?.message && (
                  <p className={`text-xs mt-1 ${
                    apiKeyValidation.gemini.status === 'valid' 
                      ? 'text-green-400' 
                      : apiKeyValidation.gemini.status === 'invalid'
                      ? 'text-red-400'
                      : 'text-slate-500'
                  }`}>
                    {apiKeyValidation.gemini.message}
                  </p>
                )}
                {!apiKeyValidation.gemini?.message && (
                  <p className="text-xs text-slate-500 mt-1">Used for audit operations and chat (if no server-side key set)</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  DeepSeek API Key (Optional)
                </label>
                <div className="flex gap-2">
                  <input
                    type={showApiKeys.deepseek ? 'text' : 'password'}
                    value={apiKeys.deepseek}
                    onChange={(e) => updateApiKey('deepseek', e.target.value)}
                    placeholder="Enter DeepSeek API key (optional)"
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                  <button
                    onClick={() => setShowApiKeys({ ...showApiKeys, deepseek: !showApiKeys.deepseek })}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors"
                    title={showApiKeys.deepseek ? "Hide" : "Show"}
                  >
                    {showApiKeys.deepseek ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1">For DeepSeek R1 models</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Anthropic Claude API Key (Optional)
                </label>
                <div className="flex gap-2">
                  <input
                    type={showApiKeys.anthropic ? 'text' : 'password'}
                    value={apiKeys.anthropic}
                    onChange={(e) => updateApiKey('anthropic', e.target.value)}
                    placeholder="Enter Anthropic API key (optional)"
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                  <button
                    onClick={() => setShowApiKeys({ ...showApiKeys, anthropic: !showApiKeys.anthropic })}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors"
                    title={showApiKeys.anthropic ? "Hide" : "Show"}
                  >
                    {showApiKeys.anthropic ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1">For Claude models</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  OpenAI API Key (Optional)
                </label>
                <div className="flex gap-2">
                  <input
                    type={showApiKeys.openai ? 'text' : 'password'}
                    value={apiKeys.openai}
                    onChange={(e) => updateApiKey('openai', e.target.value)}
                    placeholder="Enter OpenAI API key (optional)"
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                  <button
                    onClick={() => setShowApiKeys({ ...showApiKeys, openai: !showApiKeys.openai })}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors"
                    title={showApiKeys.openai ? "Hide" : "Show"}
                  >
                    {showApiKeys.openai ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1">For GPT and o-series models</p>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-700">
              <p className="text-xs text-slate-500 mb-2">
                <strong>Note:</strong> For server-side chat API, set environment variables in Cloudflare:
              </p>
              <code className="block bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-slate-300 font-mono">
                wrangler secret put GEMINI_API_KEY
              </code>
            </div>
          </div>
        </div>

        {/* Chatbot Configuration */}
        <div 
          id="chatbot-config"
          ref={(el) => (sectionRefs.current['chatbot-config'] = el)}
          className="glass-panel p-6 rounded-xl border-slate-800 scroll-mt-24"
        >
          <h3 className="text-lg font-semibold text-slate-200 mb-6 flex items-center gap-2">
            <Sliders size={20} className="text-cyan-500" />
            Chatbot Configuration
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Default Chatbot Mode
              </label>
              <select
                value={settings.chatbotMode || 'helpful'}
                onChange={(e) => onUpdate({ ...settings, chatbotMode: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              >
                <option value="helpful">Helpful & Honest</option>
                <option value="conversion_optimized">Conversion Optimized</option>
                <option value="retention_focused">Retention Focused</option>
                <option value="metric_gamer">Metric Gamer</option>
              </select>
              <p className="text-xs text-slate-500 mt-1">Default mode for customer chat</p>
            </div>
          </div>
        </div>

        {/* Database Management */}
        <div 
          id="database-management"
          data-testid="database-management-section"
          data-automation="database-management-section"
          ref={(el) => (sectionRefs.current['database-management'] = el)}
          className="glass-panel p-6 rounded-xl border-slate-800 scroll-mt-24"
        >
          <h3 className="text-lg font-semibold text-slate-200 mb-6 flex items-center gap-2">
            <Database size={20} className="text-cyan-500" />
            Database Management
          </h3>
          <div className="space-y-4">
            <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
              <p className="text-sm text-slate-300 mb-4">
                Sync conversations from <code className="bg-slate-950 px-2 py-1 rounded text-xs">mock_data</code> folder to the database.
                This will update existing conversations and add new ones.
              </p>
              
              <div className="flex items-center gap-2">
                <button
                  data-testid="sync-conversations-button"
                  data-automation="sync-conversations"
                  onClick={handleSyncConversations}
                  disabled={(syncStatus.loading || syncStatus.isLocked) && !syncStatus.completed}
                  className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Sync conversations from mock_data folder to database"
                >
                  {(syncStatus.loading || syncStatus.isLocked) ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>Syncing...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw size={18} />
                      <span>Sync Conversations</span>
                    </>
                  )}
                </button>

                {(syncStatus.loading || syncStatus.isLocked) && (
                  <button
                    data-testid="cancel-sync-button"
                    data-automation="cancel-sync"
                    onClick={handleCancelSync}
                    className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/50 rounded-lg transition-colors text-sm"
                    aria-label="Cancel sync operation"
                  >
                    Cancel
                  </button>
                )}
              </div>

              {syncStatus.isLocked && syncStatus.startedAt && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-slate-400">
                    Started: {new Date(syncStatus.startedAt).toLocaleString()}
                  </p>
                  {syncStatus.duration !== undefined && (
                    <p className="text-xs text-slate-400">
                      Duration: {Math.floor((syncStatus.duration || 0) / 60)}m {(syncStatus.duration || 0) % 60}s
                    </p>
                  )}
                  {syncStatus.progress && syncStatus.progress.totalFiles > 0 && (
                    <div className="mt-2">
                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div 
                          className="bg-cyan-500 h-2 transition-all duration-300"
                          style={{ width: `${(syncStatus.progress.filesProcessed / syncStatus.progress.totalFiles) * 100}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-xs text-slate-400">
                          {syncStatus.progress.filesProcessed} / {syncStatus.progress.totalFiles} files
                        </p>
                        <div className="flex items-center gap-3 text-xs">
                          {syncStatus.progress.successfulFiles && syncStatus.progress.successfulFiles.length > 0 && (
                            <span className="text-green-400">✓ {syncStatus.progress.successfulFiles.length} passed</span>
                          )}
                          {/* Show failed files if any */}
                          {syncStatus.progress.failedFiles && syncStatus.progress.failedFiles.length > 0 && (
                            <span className="text-red-400">
                              ✗ {syncStatus.progress.failedFiles.length} failed files
                            </span>
                          )}
                          {/* Show SQL errors separately (these are different from failed files) */}
                          {syncStatus.stats?.filesWithSqlErrors && syncStatus.stats.filesWithSqlErrors > 0 && (
                            <span className="text-amber-400">⚠ {syncStatus.stats.filesWithSqlErrors} files had SQL errors</span>
                          )}
                        </div>
                      </div>
                      {syncStatus.progress.currentPhase === 'sql-execution' && syncStatus.progress.sqlStatementsTotal && (
                        <div className="mt-2">
                          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                            <div 
                              className="bg-purple-500 h-2 transition-all duration-300"
                              style={{ width: `${((syncStatus.progress.sqlStatementsExecuted || 0) / syncStatus.progress.sqlStatementsTotal) * 100}%` }}
                            />
                          </div>
                          <p className="text-xs text-slate-400 mt-1">
                            SQL: {syncStatus.progress.sqlStatementsExecuted || 0} / {syncStatus.progress.sqlStatementsTotal} statements
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {syncStatus.message && (
                <div className="mt-4 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
                  <p className="text-sm text-cyan-300">{syncStatus.message}</p>
                  {syncStatus.stats && (
                    <div className="mt-2 text-xs text-cyan-400/80 space-y-1">
                      <p>Files processed: {syncStatus.stats.filesProcessed}</p>
                      <p>Successful files: {syncStatus.stats.successfulFiles || 0}</p>
                      {(syncStatus.stats.failedFiles > 0 || (syncStatus.stats.filesWithSqlErrors && syncStatus.stats.filesWithSqlErrors > 0)) && (
                        <p className="text-amber-400">
                          Failed files: {syncStatus.stats.failedFiles || 0}
                          {syncStatus.stats.filesWithSqlErrors && syncStatus.stats.filesWithSqlErrors > 0 && ` (${syncStatus.stats.filesWithSqlErrors} files had SQL errors)`}
                        </p>
                      )}
                      <p>Conversations processed: {syncStatus.stats.conversationsProcessed}</p>
                      <p>SQL statements executed: {syncStatus.stats.sqlStatementsExecuted}</p>
                      {(syncStatus.stats.errors > 0 || (syncStatus.detailedErrors && syncStatus.detailedErrors.length > 0)) && (
                        <p className="text-amber-400">
                          Total errors: {syncStatus.stats.errors || syncStatus.detailedErrors?.length || 0}
                          {syncStatus.stats.sqlErrors > 0 && ` (${syncStatus.stats.sqlErrors} SQL, ${syncStatus.stats.errors - (syncStatus.stats.sqlErrors || 0)} parsing)`}
                        </p>
                      )}
                    </div>
                  )}
                  
                  {/* Show/Hide Details Button */}
                  {(syncStatus.failedFiles && syncStatus.failedFiles.length > 0) || (syncStatus.detailedErrors && syncStatus.detailedErrors.length > 0) ? (
                    <button
                      data-testid="sync-show-details-button"
                      data-automation="sync-show-details"
                      onClick={() => setSyncStatus(prev => ({ ...prev, showDetails: !prev.showDetails }))}
                      className="mt-3 text-xs text-cyan-400 hover:text-cyan-300 underline"
                      aria-label={syncStatus.showDetails ? 'Hide sync details' : 'Show sync details'}
                    >
                      {syncStatus.showDetails ? 'Hide' : 'Show'} details (
                      {syncStatus.failedFiles?.length || 0} failed files
                      {syncStatus.stats?.filesWithSqlErrors && syncStatus.stats.filesWithSqlErrors > 0 && `, ${syncStatus.stats.filesWithSqlErrors} files had SQL errors`}
                      )
                    </button>
                  ) : null}
                  
                  {/* Failed Files List */}
                  {syncStatus.showDetails && syncStatus.failedFiles && syncStatus.failedFiles.length > 0 && (
                    <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                      <p className="text-xs font-semibold text-red-300 mb-2">Failed Files:</p>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {syncStatus.failedFiles.map((file, idx) => (
                          <div key={idx} className="text-xs text-red-400/80">
                            <p className="font-mono">{file.path}</p>
                            <p className="text-red-500/60 ml-2">→ {file.reason}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* SQL Errors List */}
                  {syncStatus.showDetails && syncStatus.detailedErrors && syncStatus.detailedErrors.length > 0 && (
                    <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                      <p className="text-xs font-semibold text-amber-300 mb-2">SQL Errors ({syncStatus.detailedErrors.length}):</p>
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {syncStatus.detailedErrors.map((err, idx) => (
                          <div key={idx} className="text-xs bg-slate-900/50 p-2 rounded border border-amber-500/20">
                            <p className="text-amber-400 font-semibold mb-1">
                              Error #{err.statementNumber || idx + 1}: {err.message}
                            </p>
                            {err.reference && (
                              <p className="text-amber-300/70 mb-1">
                                Reference: <code className="bg-slate-950 px-1 rounded">{err.reference}</code>
                              </p>
                            )}
                            {err.sqlLength && (
                              <p className="text-amber-300/70 mb-1">
                                SQL Length: {err.sqlLength.toLocaleString()} chars
                              </p>
                            )}
                            {err.sqlPreview && (
                              <details className="mt-1">
                                <summary className="text-amber-300/80 cursor-pointer hover:text-amber-300">
                                  Show SQL Preview
                                </summary>
                                <pre className="mt-1 p-2 bg-slate-950 rounded text-amber-200/80 text-[10px] overflow-x-auto max-w-full">
                                  {err.sqlPreview}
                                </pre>
                              </details>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Successful Files Summary (optional, can be expanded) */}
                  {syncStatus.successfulFiles && syncStatus.successfulFiles.length > 0 && syncStatus.showDetails && (
                    <div className="mt-3 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                      <p className="text-xs font-semibold text-green-300 mb-2">
                        Successful Files: {syncStatus.successfulFiles.length}
                      </p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {syncStatus.successfulFiles.slice(0, 10).map((file, idx) => (
                          <p key={idx} className="text-xs text-green-400/80 font-mono">{file}</p>
                        ))}
                        {syncStatus.successfulFiles.length > 10 && (
                          <p className="text-xs text-green-400/60">... and {syncStatus.successfulFiles.length - 10} more</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {syncStatus.error && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-sm text-red-300">{syncStatus.error}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;