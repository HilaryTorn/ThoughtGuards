import React from 'react';
import { useNavigate } from 'react-router-dom';

const Landing: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black flex flex-col items-center justify-center">
      <div className="max-w-2xl mx-auto text-center px-6">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <img
            src="/thought-guards-logo.png"
            alt="Thought Guards"
            className="w-24 h-24 object-contain rounded-2xl"
          />
        </div>

        {/* Title */}
        <h1 className="text-4xl font-bold text-slate-100 mb-4 tracking-tight">
          Thought Guards
        </h1>

        {/* Subtitle */}
        <p className="text-lg text-slate-400 mb-8">
          AI Safety Monitoring & Chain-of-Thought Analysis Platform
        </p>

        {/* Description */}
        <p className="text-slate-500 mb-12 max-w-lg mx-auto">
          Monitor, detect, and analyze potential manipulation patterns in AI conversations.
          Real-time detection of deception, goal manipulation, and safety concerns.
        </p>

        {/* CTA Button */}
        <button
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 rounded-lg hover:bg-cyan-500/30 transition-colors"
        >
          Go to Dashboard →
        </button>
      </div>

      {/* Footer */}
      <div className="absolute bottom-8 text-slate-600 text-sm">
        AI Safety Monitoring System
      </div>
    </div>
  );
};

export default Landing;
