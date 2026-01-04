import React from 'react';
import { Settings as SettingsIcon, Sliders, AlertCircle, ToggleLeft, ToggleRight } from 'lucide-react';
import { AppSettings, DetectionCategory } from '../types';
import { CATEGORY_STYLES } from '../constants';
import { AVAILABLE_SKILLS, CATEGORY_TO_SKILL } from '../lib/skillsRegistry';

interface SettingsProps {
  settings: AppSettings;
  onUpdate: (newSettings: AppSettings) => void;
}

const Settings: React.FC<SettingsProps> = ({ settings, onUpdate }) => {
  
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

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
          <SettingsIcon className="text-slate-400" />
          System Configuration
        </h2>
        <p className="text-slate-500 mt-2">Manage detection parameters and alerting thresholds.</p>
      </div>

      <div className="space-y-8">
        
        {/* Category Toggles */}
        <div className="glass-panel p-6 rounded-xl border-slate-800">
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
        <div className="glass-panel p-6 rounded-xl border-slate-800">
          <h3 className="text-lg font-semibold text-slate-200 mb-6 flex items-center gap-2">
            <Sliders size={20} className="text-cyan-500" />
            Auditor Configuration
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Auditor Model
              </label>
              <select
                value={settings.auditorModel || 'gemini-3-flash-preview'}
                onChange={(e) => onUpdate({ ...settings, auditorModel: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              >
                <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
                <option value="gemini-3-pro-preview">Gemini 3 Pro Preview</option>
                <option value="gemini-flash-lite-latest">Gemini Flash Lite</option>
                <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash Experimental</option>
              </select>
              <p className="text-xs text-slate-500 mt-1">Model used for running audits</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
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
                  placeholder="Optional"
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
                <button
                  onClick={() => onUpdate({ ...settings, thinkingBudget: undefined })}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors"
                >
                  Clear
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">Token budget for reasoning models (optional)</p>
            </div>
            
            <div className="md:col-span-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.includeValidatorCoT !== false}
                  onChange={(e) => onUpdate({ ...settings, includeValidatorCoT: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500 focus:ring-2"
                />
                <div>
                  <span className="text-sm font-medium text-slate-300">Include Validator Chain-of-Thought</span>
                  <p className="text-xs text-slate-500 mt-0.5">
                    When enabled, the auditor will analyze both the conversation and any internal reasoning traces (fullCoT) from validators
                  </p>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Sliders & Thresholds */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
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

      </div>
    </div>
  );
};

export default Settings;