import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Settings as SettingsIcon, Sliders, AlertCircle, Eye, EyeOff, Database, Loader2 } from 'lucide-react';
import { AppSettings } from '../types';

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
  const [activeSection, setActiveSection] = useState<string>('auditor-config');
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
      } else if (key === 'anthropic') {
        // Test Anthropic API key with a simple messages request
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': value,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'Hi' }]
          })
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          if (response.status === 401) {
            throw new Error('Invalid API key');
          } else if (response.status === 403) {
            throw new Error('API key lacks permissions');
          }
          throw new Error(error.error?.message || `API returned ${response.status}`);
        }

        setApiKeyValidation(prev => ({
          ...prev,
          [key]: {
            status: 'valid',
            message: '✓ Valid (Claude API connected)'
          }
        }));
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

  const sections = [
    { id: 'auditor-config', label: 'Auditor Configuration', icon: Sliders },
    { id: 'api-keys', label: 'API Key Configuration', icon: Sliders },
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
            {/* LLM Judge Configuration */}
            <div className="md:col-span-2 space-y-4">
              <label className="block text-sm font-medium text-slate-300">
                LLM Judge Models
              </label>
              <p className="text-xs text-slate-500 mb-2">
                Select which models to use for audit judgments. If Judge B is selected, both judges run and results are cross-validated.
              </p>

              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 space-y-4">
                {/* Judge A (Primary) */}
                <div>
                  <label className="block text-xs text-slate-400 mb-2">Judge A (Primary)</label>
                  <select
                    value={settings.auditorModel || 'claude-sonnet-4-20250514'}
                    onChange={(e) => onUpdate({ ...settings, auditorModel: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  >
                    <optgroup label="Claude">
                      <option value="claude-sonnet-4-20250514">Claude Sonnet 4 (Recommended)</option>
                      <option value="claude-3-5-sonnet-latest">Claude 3.5 Sonnet</option>
                    </optgroup>
                    <optgroup label="Gemini">
                      <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                      <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                      <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                    </optgroup>
                  </select>
                </div>

                {/* Judge B (Optional) */}
                <div>
                  <label className="block text-xs text-slate-400 mb-2">Judge B (Optional - enables cross-validation)</label>
                  <select
                    value={settings.secondaryJudgeModel || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      onUpdate({
                        ...settings,
                        secondaryJudgeModel: value || undefined,
                        enableCrossValidation: !!value // Auto-enable if judge B selected
                      });
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  >
                    <option value="">None (single judge)</option>
                    <optgroup label="Claude">
                      <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                      <option value="claude-3-5-sonnet-latest">Claude 3.5 Sonnet</option>
                    </optgroup>
                    <optgroup label="Gemini">
                      <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                      <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                      <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                    </optgroup>
                  </select>
                  {settings.secondaryJudgeModel && (
                    <p className="text-xs text-cyan-400 mt-2">
                      Cross-validation enabled: Both judges will analyze the conversation and results will be compared.
                    </p>
                  )}
                </div>
              </div>
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
                    API keys are stored in your browser's localStorage. For production deployment, set environment variables in Cloudflare.
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
                  <div className="relative flex-1">
                    <input
                      type={showApiKeys.anthropic ? 'text' : 'password'}
                      value={apiKeys.anthropic}
                      onChange={(e) => updateApiKey('anthropic', e.target.value)}
                      placeholder="Enter Anthropic API key (optional)"
                      className={`w-full bg-slate-950 border rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 ${
                        apiKeyValidation.anthropic?.status === 'valid'
                          ? 'border-green-500/50'
                          : apiKeyValidation.anthropic?.status === 'invalid'
                          ? 'border-red-500/50'
                          : 'border-slate-700'
                      }`}
                    />
                    {apiKeyValidation.anthropic?.status === 'validating' && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Loader2 size={16} className="animate-spin text-cyan-500" />
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setShowApiKeys({ ...showApiKeys, anthropic: !showApiKeys.anthropic })}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors"
                    title={showApiKeys.anthropic ? "Hide" : "Show"}
                  >
                    {showApiKeys.anthropic ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                  {apiKeys.anthropic && (
                    <button
                      onClick={() => validateApiKey('anthropic', apiKeys.anthropic)}
                      disabled={apiKeyValidation.anthropic?.status === 'validating'}
                      className="px-3 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg text-sm transition-colors"
                      title="Test API key"
                    >
                      {apiKeyValidation.anthropic?.status === 'validating' ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        'Test'
                      )}
                    </button>
                  )}
                </div>
                {apiKeyValidation.anthropic?.message && (
                  <p className={`text-xs mt-1 ${
                    apiKeyValidation.anthropic.status === 'valid'
                      ? 'text-green-400'
                      : apiKeyValidation.anthropic.status === 'invalid'
                      ? 'text-red-400'
                      : 'text-slate-500'
                  }`}>
                    {apiKeyValidation.anthropic.message}
                  </p>
                )}
                {!apiKeyValidation.anthropic?.message && (
                  <p className="text-xs text-slate-500 mt-1">For Claude models (used as Judge A or B)</p>
                )}
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
                GEMINI_API_KEY
              </code>
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
            Import Conversations
          </h3>
          <div className="space-y-4">
            <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
              <p className="text-sm text-slate-300 mb-2">
                Import conversation data from JSON files using the CLI. This supports both single files and directories.
              </p>
              <p className="text-xs text-amber-400 mb-4">
                Each conversation must have a unique <code className="bg-slate-950 px-1 rounded">conversation_id</code>. Duplicates will be overwritten.
              </p>

              <div className="space-y-3">
                <div>
                  <p className="text-xs text-slate-400 mb-2">Import a single file:</p>
                  <code className="block bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-cyan-300 font-mono">
                    npm run import -- ./path/to/conversation.json
                  </code>
                </div>

                <div>
                  <p className="text-xs text-slate-400 mb-2">Import an entire directory:</p>
                  <code className="block bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-cyan-300 font-mono">
                    npm run import -- ./mock_data/
                  </code>
                </div>

                <div>
                  <p className="text-xs text-slate-400 mb-2">Import to production:</p>
                  <code className="block bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-cyan-300 font-mono">
                    npm run import -- ./mock_data/ --api https://your-app.pages.dev
                  </code>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-700">
                <p className="text-xs text-slate-500">
                  <strong>JSON Format:</strong> Each file should contain either:
                </p>
                <ul className="text-xs text-slate-500 mt-2 space-y-1 list-disc list-inside">
                  <li>A single conversation with <code className="bg-slate-950 px-1 rounded">turns</code> array</li>
                  <li>A dataset with <code className="bg-slate-950 px-1 rounded">conversations</code> array</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;