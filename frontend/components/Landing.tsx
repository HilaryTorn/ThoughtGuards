import React from 'react';
import { Shield, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Landing: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black flex flex-col items-center justify-center">
      <div className="max-w-2xl mx-auto text-center px-6">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="bg-gradient-to-tr from-cyan-500 to-blue-600 p-4 rounded-2xl shadow-[0_0_30px_rgba(6,182,212,0.4)]">
            <Shield className="text-white w-12 h-12" />
          </div>
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
          className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold rounded-xl shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 transition-all duration-300 hover:scale-105"
        >
          Go to Dashboard
          <ArrowRight size={20} />
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
