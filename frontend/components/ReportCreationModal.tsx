import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle, Info } from 'lucide-react';
import { LLMParameters, Conversation, Skill } from '../types';
import { validateParameterCombination } from '../lib/llmParameterTracker';

interface ReportCreationModalProps {
  conversation: Conversation;
  availableSkills: Skill[];
  availableModels: string[];
  onSave: (config: ReportConfig) => void;
  onClose: () => void;
}

export interface ReportConfig {
  conversation_id: string;
  skill_id: string;
  skill_version?: string;
  model_name: string;
  llm_parameters: LLMParameters;
  enable_cache?: boolean;
  tags?: string[];
  notes?: string;
}

const ReportCreationModal: React.FC<ReportCreationModalProps> = ({
  conversation,
  availableSkills,
  availableModels,
  onSave,
  onClose
}) => {
  const [skillId, setSkillId] = useState<string>(availableSkills[0]?.id || '');
  const [modelName, setModelName] = useState<string>(availableModels[0] || '');
  const [enableCache, setEnableCache] = useState(true);
  const [tags, setTags] = useState<string>('');
  const [notes, setNotes] = useState('');
  
  // LLM Parameters
  const [temperature, setTemperature] = useState<number | ''>(0.7);
  const [topP, setTopP] = useState<number | ''>('');
  const [topK, setTopK] = useState<number | ''>('');
  const [maxTokens, setMaxTokens] = useState<number | ''>(4096);
  const [presencePenalty, setPresencePenalty] = useState<number | ''>('');
  const [frequencyPenalty, setFrequencyPenalty] = useState<number | ''>('');
  const [seed, setSeed] = useState<number | ''>('');
  const [thinkingBudget, setThinkingBudget] = useState<number | ''>('');
  
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);

  useEffect(() => {
    validateParameters();
  }, [temperature, topP, topK, maxTokens, presencePenalty, frequencyPenalty, seed, thinkingBudget]);

  const validateParameters = () => {
    const params: LLMParameters = {
      temperature: temperature !== '' ? temperature : undefined,
      top_p: topP !== '' ? topP : undefined,
      top_k: topK !== '' ? topK : undefined,
      max_tokens: maxTokens !== '' ? maxTokens : undefined,
      presence_penalty: presencePenalty !== '' ? presencePenalty : undefined,
      frequency_penalty: frequencyPenalty !== '' ? frequencyPenalty : undefined,
      seed: seed !== '' ? seed : undefined,
      thinking_budget: thinkingBudget !== '' ? thinkingBudget : undefined
    };

    const validation = validateParameterCombination(params);
    setValidationErrors(validation.errors);
    setValidationWarnings(validation.warnings);
  };

  const handleSave = () => {
    if (validationErrors.length > 0) {
      return; // Don't save if there are errors
    }

    const params: LLMParameters = {
      temperature: temperature !== '' ? temperature : undefined,
      top_p: topP !== '' ? topP : undefined,
      top_k: topK !== '' ? topK : undefined,
      max_tokens: maxTokens !== '' ? maxTokens : undefined,
      presence_penalty: presencePenalty !== '' ? presencePenalty : undefined,
      frequency_penalty: frequencyPenalty !== '' ? frequencyPenalty : undefined,
      seed: seed !== '' ? seed : undefined,
      thinking_budget: thinkingBudget !== '' ? thinkingBudget : undefined
    };

    const config: ReportConfig = {
      conversation_id: conversation.conversation_id,
      skill_id: skillId,
      model_name: modelName,
      llm_parameters: params,
      enable_cache: enableCache,
      tags: tags.split(',').map(t => t.trim()).filter(t => t.length > 0),
      notes: notes.trim() || undefined
    };

    onSave(config);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-xl border border-slate-700 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-slate-100">Create Audit Report</h2>
            <p className="text-sm text-slate-400 mt-1">
              Conversation: {conversation.conversation_id.substring(0, 16)}...
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Validation Errors/Warnings */}
          {validationErrors.length > 0 && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-red-400 mb-2">Validation Errors</h4>
                  <ul className="space-y-1 text-sm text-red-300">
                    {validationErrors.map((error, idx) => (
                      <li key={idx}>• {error}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {validationWarnings.length > 0 && (
            <div className="bg-amber-500/20 border border-amber-500/50 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <Info size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-amber-400 mb-2">Warnings</h4>
                  <ul className="space-y-1 text-sm text-amber-300">
                    {validationWarnings.map((warning, idx) => (
                      <li key={idx}>• {warning}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Basic Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-200">Basic Configuration</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Skill</label>
                <select
                  value={skillId}
                  onChange={(e) => setSkillId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  {availableSkills.map(skill => (
                    <option key={skill.id} value={skill.id}>{skill.name || skill.id}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">Model</label>
                <select
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  {availableModels.map(model => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm text-slate-400">
                <input
                  type="checkbox"
                  checked={enableCache}
                  onChange={(e) => setEnableCache(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
                />
                Enable caching for this report
              </label>
            </div>
          </div>

          {/* LLM Parameters */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-200">LLM Parameters</h3>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Temperature</label>
                <input
                  type="number"
                  min="0"
                  max="2"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value ? parseFloat(e.target.value) : '')}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  placeholder="0.7"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">Top P</label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={topP}
                  onChange={(e) => setTopP(e.target.value ? parseFloat(e.target.value) : '')}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  placeholder="0.9"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">Top K</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={topK}
                  onChange={(e) => setTopK(e.target.value ? parseInt(e.target.value) : '')}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  placeholder="40"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">Max Tokens</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(e.target.value ? parseInt(e.target.value) : '')}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  placeholder="4096"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">Presence Penalty</label>
                <input
                  type="number"
                  min="-2"
                  max="2"
                  step="0.1"
                  value={presencePenalty}
                  onChange={(e) => setPresencePenalty(e.target.value ? parseFloat(e.target.value) : '')}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  placeholder="0.0"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">Frequency Penalty</label>
                <input
                  type="number"
                  min="-2"
                  max="2"
                  step="0.1"
                  value={frequencyPenalty}
                  onChange={(e) => setFrequencyPenalty(e.target.value ? parseFloat(e.target.value) : '')}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  placeholder="0.0"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">Seed</label>
                <input
                  type="number"
                  step="1"
                  value={seed}
                  onChange={(e) => setSeed(e.target.value ? parseInt(e.target.value) : '')}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  placeholder="Random"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">Thinking Budget</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={thinkingBudget}
                  onChange={(e) => setThinkingBudget(e.target.value ? parseInt(e.target.value) : '')}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>

          {/* Tags and Notes */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-200">Metadata</h3>
            
            <div>
              <label className="block text-sm text-slate-400 mb-2">Tags (comma-separated)</label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="experiment, baseline, test"
              />
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-2">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="Additional notes about this report..."
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={validationErrors.length > 0}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <Save size={16} />
            Create Report
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportCreationModal;

