/**
 * Customer Chat Component
 * Enhanced with persona selection, autocomplete, and cot-generator features
 */

import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2, Eye, EyeOff, User, Bot, ChevronDown, Sparkles } from 'lucide-react';
import { getCustomerId, setCustomerId, getConversationId, setConversationId, clearConversation } from '../lib/customerContext';
import { PERSONAS, getPersonaByCustomerId, getPersona, getRandomOpeningMessage, listPersonaIds, type Persona } from '../lib/personas';
import { CHATBOT_MODES, getAvailableModes, type ChatbotMode } from '../lib/chatbotModes';

interface Message {
  id: string;
  role: 'customer' | 'assistant';
  content: string;
  reasoning_content?: string;
  timestamp: string;
}

interface CustomerChatProps {
  chatbotMode?: string;
  model?: string;
  thinkingBudget?: number;
}

// Available models (matching cot-generator config)
const AVAILABLE_MODELS = [
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', provider: 'google' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'google' },
  { id: 'deepseek-reasoner', name: 'DeepSeek R1', provider: 'deepseek' },
  { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', provider: 'claude' },
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'claude' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
  { id: 'o1-preview', name: 'O1 Preview', provider: 'openai' },
  { id: 'o1-mini', name: 'O1 Mini', provider: 'openai' },
];

const CustomerChat: React.FC<CustomerChatProps> = ({ 
  chatbotMode: initialMode = 'helpful',
  model: initialModel = 'gemini-3-flash-preview',
  thinkingBudget
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerId, setCustomerIdState] = useState<string>(getCustomerId() || 'CUST-5001');
  const [conversationId, setConversationIdState] = useState<string | null>(getConversationId());
  const [showReasoning, setShowReasoning] = useState<Record<string, boolean>>({});
  
  // Enhanced controls
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [chatbotMode, setChatbotMode] = useState<string>(initialMode);
  const [model, setModel] = useState<string>(initialModel);
  const [showPersonaDropdown, setShowPersonaDropdown] = useState(false);
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [customerIdInput, setCustomerIdInput] = useState<string>(customerId);
  const [customerIdSuggestions, setCustomerIdSuggestions] = useState<string[]>([]);
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const customerInputRef = useRef<HTMLInputElement>(null);
  const personaDropdownRef = useRef<HTMLDivElement>(null);
  const modeDropdownRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  // Initialize persona from customer ID
  useEffect(() => {
    const persona = getPersonaByCustomerId(customerId);
    if (persona) {
      setSelectedPersona(persona);
      setCustomerIdInput(customerId);
    }
  }, []);

  // Update customer ID when persona changes
  useEffect(() => {
    if (selectedPersona) {
      const newCustomerId = selectedPersona.customer_id;
      setCustomerIdState(newCustomerId);
      setCustomerIdInput(newCustomerId);
      setCustomerId(newCustomerId); // This is the function from customerContext
    }
  }, [selectedPersona]);

  // Set customer ID in localStorage when it changes
  useEffect(() => {
    if (customerId) {
      setCustomerId(customerId);
    }
  }, [customerId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (personaDropdownRef.current && !personaDropdownRef.current.contains(event.target as Node)) {
        setShowPersonaDropdown(false);
      }
      if (modeDropdownRef.current && !modeDropdownRef.current.contains(event.target as Node)) {
        setShowModeDropdown(false);
      }
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
        setShowModelDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle customer ID input with autocomplete
  const handleCustomerIdChange = (value: string) => {
    setCustomerIdInput(value);
    
    if (value.length > 0) {
      const suggestions = PERSONAS
        .filter(p => 
          p.customer_id.toLowerCase().includes(value.toLowerCase()) ||
          p.name.toLowerCase().includes(value.toLowerCase())
        )
        .slice(0, 5)
        .map(p => p.customer_id);
      setCustomerIdSuggestions(suggestions);
      setShowCustomerSuggestions(suggestions.length > 0);
    } else {
      setShowCustomerSuggestions(false);
    }

    // Update persona if customer ID matches
    const persona = getPersonaByCustomerId(value);
    if (persona) {
      setSelectedPersona(persona);
    }
  };

  const handleCustomerIdSelect = (customerId: string) => {
    setCustomerIdInput(customerId);
    setCustomerIdState(customerId);
    setShowCustomerSuggestions(false);
    const persona = getPersonaByCustomerId(customerId);
    if (persona) {
      setSelectedPersona(persona);
    }
  };

  // Suggest opening message from persona
  const handleUsePersonaOpening = () => {
    if (selectedPersona) {
      const opening = getRandomOpeningMessage(selectedPersona);
      setInput(opening);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: `msg-${Date.now()}-user`,
      role: 'customer',
      content: input,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      // Get API key from localStorage (if available) to send with request
      const apiKey = typeof window !== 'undefined' 
        ? (localStorage.getItem('BYOK_API_KEY') || localStorage.getItem('GEMINI_API_KEY') || '')
        : '';

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: input,
          customer_id: customerId,
          chatbot_mode: chatbotMode,
          conversation_id: conversationId,
          model,
          thinking_budget: thinkingBudget,
          ...(apiKey ? { api_key: apiKey } : {})
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send message');
      }

      const data = await response.json();

      // Update conversation ID
      if (data.conversation_id && data.conversation_id !== conversationId) {
        setConversationIdState(data.conversation_id);
        setConversationId(data.conversation_id);
      }

      // Add assistant response
      const assistantMessage: Message = {
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        content: data.response,
        reasoning_content: data.reasoning_content,
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err: any) {
      setError(err.message || 'Failed to send message');
      console.error('Chat error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleReasoning = (messageId: string) => {
    setShowReasoning(prev => ({
      ...prev,
      [messageId]: !prev[messageId]
    }));
  };

  const handleNewConversation = () => {
    clearConversation();
    setConversationIdState(null);
    setMessages([]);
  };

  const currentMode = CHATBOT_MODES[chatbotMode];
  const currentModelInfo = AVAILABLE_MODELS.find(m => m.id === model);

  return (
    <div className="flex flex-col h-full bg-slate-950 relative">
      {/* Enhanced Header */}
      <div className="flex-shrink-0 bg-slate-900 border-b border-slate-800 p-4 z-10">
        <div className="space-y-3">
          {/* Title Row */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Customer Support Chat</h2>
              {typeof window !== 'undefined' && !localStorage.getItem('BYOK_API_KEY') && !localStorage.getItem('GEMINI_API_KEY') && (
                <p className="text-xs text-amber-400 mt-1">
                  ⚠️ No API key found. Set it in Settings or .dev.vars file.
                </p>
              )}
            </div>
            <button
              onClick={handleNewConversation}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm transition-colors"
            >
              New Chat
            </button>
          </div>

          {/* Controls Row */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Persona Selection */}
            <div className="relative" ref={personaDropdownRef}>
              <label className="text-xs text-slate-400 mr-2">Persona:</label>
              <button
                onClick={() => setShowPersonaDropdown(!showPersonaDropdown)}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-sm transition-colors min-w-[200px] justify-between"
              >
                <span className="truncate">
                  {selectedPersona ? `${selectedPersona.name} (${selectedPersona.customer_id})` : 'Select Persona...'}
                </span>
                <ChevronDown size={14} />
              </button>
              {showPersonaDropdown && (
                <div className="absolute z-50 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-lg max-h-96 overflow-y-auto min-w-[300px]">
                  {PERSONAS.map(persona => (
                    <button
                      key={persona.id}
                      onClick={() => {
                        setSelectedPersona(persona);
                        setShowPersonaDropdown(false);
                      }}
                      className={`w-full text-left px-3 py-2 hover:bg-slate-700 transition-colors ${
                        selectedPersona?.id === persona.id ? 'bg-slate-700' : ''
                      }`}
                    >
                      <div className="text-sm text-slate-200 font-medium">{persona.name}</div>
                      <div className="text-xs text-slate-400">{persona.customer_id}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        {persona.tags.slice(0, 3).join(', ')}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Customer ID with Autocomplete */}
            <div className="relative flex-1 min-w-[200px]">
              <label className="text-xs text-slate-400 mr-2">Customer ID:</label>
              <div className="relative">
                <input
                  ref={customerInputRef}
                  type="text"
                  value={customerIdInput}
                  onChange={(e) => handleCustomerIdChange(e.target.value)}
                  onFocus={() => {
                    if (customerIdSuggestions.length > 0) {
                      setShowCustomerSuggestions(true);
                    }
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  placeholder="CUST-5001 or search..."
                />
                {showCustomerSuggestions && customerIdSuggestions.length > 0 && (
                  <div className="absolute z-50 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-lg w-full max-h-48 overflow-y-auto">
                    {customerIdSuggestions.map(suggestion => {
                      const persona = getPersonaByCustomerId(suggestion);
                      return (
                        <button
                          key={suggestion}
                          onClick={() => handleCustomerIdSelect(suggestion)}
                          className="w-full text-left px-3 py-2 hover:bg-slate-700 transition-colors"
                        >
                          <div className="text-sm text-slate-200">{suggestion}</div>
                          {persona && (
                            <div className="text-xs text-slate-400">{persona.name}</div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Mode Selection */}
            <div className="relative" ref={modeDropdownRef}>
              <label className="text-xs text-slate-400 mr-2">Mode:</label>
              <button
                onClick={() => setShowModeDropdown(!showModeDropdown)}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-sm transition-colors min-w-[180px] justify-between"
              >
                <span className="truncate">
                  {currentMode?.name || chatbotMode}
                </span>
                <ChevronDown size={14} />
              </button>
              {showModeDropdown && (
                <div className="absolute z-50 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-lg max-h-96 overflow-y-auto min-w-[250px]">
                  {getAvailableModes().map(modeId => {
                    const mode = CHATBOT_MODES[modeId];
                    return (
                      <button
                        key={modeId}
                        onClick={() => {
                          setChatbotMode(modeId);
                          setShowModeDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-2 hover:bg-slate-700 transition-colors ${
                          chatbotMode === modeId ? 'bg-slate-700' : ''
                        }`}
                      >
                        <div className="text-sm text-slate-200 font-medium">{mode.name}</div>
                        <div className="text-xs text-slate-400">{mode.description}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Model Selection */}
            <div className="relative" ref={modelDropdownRef}>
              <label className="text-xs text-slate-400 mr-2">Model:</label>
              <button
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-sm transition-colors min-w-[180px] justify-between"
              >
                <span className="truncate">
                  {currentModelInfo?.name || model}
                </span>
                <ChevronDown size={14} />
              </button>
              {showModelDropdown && (
                <div className="absolute z-50 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-lg max-h-96 overflow-y-auto min-w-[200px]">
                  {AVAILABLE_MODELS.map(modelOption => (
                    <button
                      key={modelOption.id}
                      onClick={() => {
                        setModel(modelOption.id);
                        setShowModelDropdown(false);
                      }}
                      className={`w-full text-left px-3 py-2 hover:bg-slate-700 transition-colors ${
                        model === modelOption.id ? 'bg-slate-700' : ''
                      }`}
                    >
                      <div className="text-sm text-slate-200 font-medium">{modelOption.name}</div>
                      <div className="text-xs text-slate-400">{modelOption.provider}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Persona Opening Message Button */}
            {selectedPersona && (
              <button
                onClick={handleUsePersonaOpening}
                className="flex items-center gap-1 px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/50 rounded text-sm transition-colors"
                title="Use a suggested opening message from this persona"
              >
                <Sparkles size={14} />
                <span>Use Opening</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Messages - Scrollable area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar min-h-0">
        {messages.length === 0 && (
          <div className="text-center text-slate-500 mt-8">
            <p>Start a conversation by sending a message below.</p>
            {selectedPersona && (
              <p className="text-xs mt-2 text-slate-400">
                Persona: <span className="text-cyan-400">{selectedPersona.name}</span> - {selectedPersona.tags.join(', ')}
              </p>
            )}
            <p className="text-xs mt-2">Try: "I need help with a return" or click "Use Opening" for a persona message</p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'customer' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                message.role === 'customer'
                  ? 'bg-blue-600/30 text-blue-100'
                  : 'bg-slate-800 text-slate-200'
              }`}
            >
              <div className="flex items-start gap-2">
                <div className="mt-1">
                  {message.role === 'customer' ? (
                    <User size={16} className="text-blue-400" />
                  ) : (
                    <Bot size={16} className="text-cyan-400" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  {message.reasoning_content && (
                    <div className="mt-2">
                      <button
                        onClick={() => toggleReasoning(message.id)}
                        className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-300 transition-colors"
                      >
                        {showReasoning[message.id] ? (
                          <>
                            <EyeOff size={12} />
                            Hide Reasoning
                          </>
                        ) : (
                          <>
                            <Eye size={12} />
                            Show Reasoning
                          </>
                        )}
                      </button>
                      {showReasoning[message.id] && (
                        <div className="mt-2 p-2 bg-slate-900/50 rounded text-xs font-mono text-slate-400 whitespace-pre-wrap border border-slate-700">
                          {message.reasoning_content}
                        </div>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-slate-500 mt-1">
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 rounded-lg p-3">
              <Loader2 size={16} className="animate-spin text-cyan-400" />
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input - Fixed Footer */}
      <div className="sticky bottom-0 bg-slate-900 border-t border-slate-800 p-4 z-20">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={selectedPersona ? `Message as ${selectedPersona.name}...` : "Type your message..."}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 resize-none"
            rows={2}
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="p-2 bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 rounded-lg hover:bg-cyan-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <Send size={20} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomerChat;
