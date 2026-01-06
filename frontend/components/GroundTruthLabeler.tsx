import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, Save, Loader2, FileText, Users } from 'lucide-react';
import { Conversation } from '../lib/types';

interface GroundTruthLabel {
  label_id: string;
  conversation_id: string;
  is_manipulation: boolean;
  confidence: 'low' | 'medium' | 'high';
  annotator_id?: string;
  annotation_notes?: string;
  created_at: string;
}

interface GroundTruthLabelerProps {
  conversation: Conversation;
  annotatorId?: string;
  onSave?: (label: GroundTruthLabel) => void;
}

const GroundTruthLabeler: React.FC<GroundTruthLabelerProps> = ({ 
  conversation, 
  annotatorId = 'annotator-1',
  onSave 
}) => {
  const [isManipulation, setIsManipulation] = useState<boolean | null>(null);
  const [confidence, setConfidence] = useState<'low' | 'medium' | 'high'>('medium');
  const [notes, setNotes] = useState('');
  const [selectedPatterns, setSelectedPatterns] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [existingLabel, setExistingLabel] = useState<GroundTruthLabel | null>(null);

  // Load existing label if available
  useEffect(() => {
    const loadLabel = async () => {
      try {
        const response = await fetch(`/api/ground-truth-labels?conversation_id=${conversation.conversation_id}`);
        if (response.ok) {
          const data = await response.json();
          if (data.label) {
            setExistingLabel(data.label);
            setIsManipulation(data.label.is_manipulation === 1);
            setConfidence(data.label.confidence);
            setNotes(data.label.annotation_notes || '');
          }
        }
      } catch (error) {
        console.error('Failed to load existing label:', error);
      }
    };
    loadLabel();
  }, [conversation.conversation_id]);

  const handleSave = async () => {
    if (isManipulation === null) {
      alert('Please select whether this is manipulation or not');
      return;
    }

    setSaving(true);
    try {
      const label: GroundTruthLabel = {
        label_id: existingLabel?.label_id || `label-${conversation.conversation_id}-${Date.now()}`,
        conversation_id: conversation.conversation_id,
        is_manipulation: isManipulation,
        confidence,
        annotator_id: annotatorId,
        annotation_notes: notes,
        created_at: new Date().toISOString()
      };

      const response = await fetch('/api/ground-truth-labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(label)
      });

      if (!response.ok) {
        throw new Error('Failed to save label');
      }

      setExistingLabel(label);
      if (onSave) {
        onSave(label);
      }
    } catch (error: any) {
      console.error('Failed to save label:', error);
      alert('Failed to save label: ' + (error.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const manipulationPatterns = [
    'Goal Reasoning',
    'Deception Planning',
    'Reward Hacking',
    'Sabotage Planning',
    'Obfuscation & Evasion',
    'Persona Manipulation',
    'Sycophancy'
  ];

  return (
    <div className="glass-panel p-6 rounded-xl border-slate-800">
      <div className="flex items-center gap-2 mb-6">
        <FileText className="w-5 h-5 text-cyan-400" />
        <h3 className="text-lg font-semibold text-slate-200">Ground Truth Labeling</h3>
        {existingLabel && (
          <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">
            Labeled
          </span>
        )}
      </div>

      <div className="space-y-6">
        {/* Manipulation Yes/No/Unsure */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-3">
            Is this manipulation?
          </label>
          <div className="flex gap-4">
            <button
              onClick={() => setIsManipulation(true)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
                isManipulation === true
                  ? 'border-red-500 bg-red-500/20 text-red-400'
                  : 'border-slate-700 bg-slate-900/50 text-slate-400 hover:border-slate-600'
              }`}
            >
              <XCircle className="w-5 h-5" />
              <span>Yes</span>
            </button>
            <button
              onClick={() => setIsManipulation(false)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
                isManipulation === false
                  ? 'border-green-500 bg-green-500/20 text-green-400'
                  : 'border-slate-700 bg-slate-900/50 text-slate-400 hover:border-slate-600'
              }`}
            >
              <CheckCircle className="w-5 h-5" />
              <span>No</span>
            </button>
          </div>
        </div>

        {/* Confidence Level */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-3">
            Confidence Level
          </label>
          <div className="flex gap-2">
            {(['low', 'medium', 'high'] as const).map((level) => (
              <button
                key={level}
                onClick={() => setConfidence(level)}
                className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors capitalize ${
                  confidence === level
                    ? 'border-cyan-500 bg-cyan-500/20 text-cyan-400'
                    : 'border-slate-700 bg-slate-900/50 text-slate-400 hover:border-slate-600'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        {/* Pattern Selection */}
        {isManipulation === true && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-3">
              Patterns Present (multi-select)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {manipulationPatterns.map((pattern) => (
                <label
                  key={pattern}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 cursor-pointer transition-colors ${
                    selectedPatterns.includes(pattern)
                      ? 'border-cyan-500 bg-cyan-500/20 text-cyan-400'
                      : 'border-slate-700 bg-slate-900/50 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedPatterns.includes(pattern)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedPatterns([...selectedPatterns, pattern]);
                      } else {
                        setSelectedPatterns(selectedPatterns.filter(p => p !== pattern));
                      }
                    }}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                  />
                  <span className="text-sm">{pattern}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Free-text Explanation */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Explanation {isManipulation === true && <span className="text-red-400">*</span>}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={isManipulation === true ? "Required: Explain why this is manipulation" : "Optional: Add any notes or observations"}
            rows={4}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 resize-none"
          />
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving || isManipulation === null || (isManipulation === true && !notes.trim())}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>{existingLabel ? 'Update Label' : 'Save Label'}</span>
            </>
          )}
        </button>

        {/* Annotator Info */}
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Users className="w-4 h-4" />
          <span>Annotator: {annotatorId}</span>
        </div>
      </div>
    </div>
  );
};

export default GroundTruthLabeler;

