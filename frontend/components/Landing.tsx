import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield,
  LayoutDashboard,
  Github,
  ArrowRight
} from 'lucide-react';

const Landing: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black">
      {/* Hero Section */}
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16">
        <div className="max-w-4xl mx-auto text-center">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <img
              src="/thought-guards-logo.png"
              alt="ThoughtGuards"
              className="w-20 h-20 object-contain rounded-2xl"
            />
          </div>

          {/* Title */}
          <h1 className="text-5xl md:text-6xl font-bold text-slate-100 mb-4 tracking-tight">
            ThoughtGuards
          </h1>

          {/* Tagline */}
          <p className="text-xl md:text-2xl text-cyan-400 mb-6 font-medium">
            Open-source monitoring for AI chain-of-thought reasoning
          </p>

          {/* Description */}
          <p className="text-slate-400 mb-8 max-w-2xl mx-auto text-lg leading-relaxed">
            ThoughtGuards is an open-source system for monitoring chain-of-thought (CoT) reasoning
            in deployed, tool-using AI agents to detect alignment-relevant manipulation such as
            sandbagging, deceptive planning, metric gaming, and fabricated tool use.
          </p>

          {/* Action Buttons */}
          <div className="flex justify-center gap-4 mb-8">
            <button
              onClick={() => navigate('/dashboard')}
              className="inline-flex items-center gap-2 px-6 py-3 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/50 rounded-lg transition-all"
            >
              <LayoutDashboard size={20} />
              Open Dashboard
            </button>
            <a
              href="https://github.com/HilaryTorn/ThoughtGuards"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/50 rounded-lg transition-all"
            >
              <Github size={20} />
              View on GitHub
            </a>
          </div>

          {/* Hackathon Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500/10 border border-purple-500/30 rounded-full text-purple-300 text-sm mb-6">
            <Shield size={16} />
            Built for the Apart Research AI Manipulation Hackathon
          </div>

          {/* Team */}
          <div className="flex flex-wrap justify-center gap-3">
            <a href="https://www.linkedin.com/in/hilarytorn/" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-cyan-400 transition-colors text-sm">Hilary Torn</a>
            <span className="text-slate-600">·</span>
            <a href="https://www.linkedin.com/in/haydar-ali-seker/" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-cyan-400 transition-colors text-sm">Haydar Ali Seker</a>
            <span className="text-slate-600">·</span>
            <a href="https://www.linkedin.com/in/valeriiapovergo/" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-cyan-400 transition-colors text-sm">Valeriia Povergo</a>
            <span className="text-slate-600">·</span>
            <a href="https://www.linkedin.com/in/zakhar-kogan/" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-cyan-400 transition-colors text-sm">Zakhar Kogan</a>
            <span className="text-slate-600">·</span>
            <a href="https://www.linkedin.com/in/1andonlyamit/" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-cyan-400 transition-colors text-sm">Amit Suthar</a>
          </div>
        </div>
      </div>

      {/* Steps Section */}
      <div className="px-6 py-20 bg-slate-900/50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-slate-100 text-center mb-4">
            How It Works
          </h2>
          <p className="text-slate-400 text-center mb-12 max-w-2xl mx-auto">
            Detect manipulation in AI reasoning through a simple three-step process
          </p>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Step 1: Generate or Audit */}
            <div className="glass-panel rounded-xl p-6 hover:border-cyan-500/30 transition-all">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/50 flex items-center justify-center text-cyan-400 font-bold text-sm">
                  1
                </div>
                <h3 className="text-lg font-semibold text-slate-100">Generate or Audit</h3>
              </div>

              <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                Generate a conversation with our AI and try to get it to manipulate,
                or audit an existing conversation from the queue.
              </p>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => navigate('/red-team-lab')}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg transition-colors text-sm"
                >
                  Red Team Lab
                </button>
                <button
                  onClick={() => navigate('/queue')}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg transition-colors text-sm"
                >
                  Audit Queue
                </button>
              </div>
            </div>

            {/* Step 2: View Traces */}
            <div className="glass-panel rounded-xl p-6 hover:border-cyan-500/30 transition-all">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/50 flex items-center justify-center text-cyan-400 font-bold text-sm">
                  2
                </div>
                <h3 className="text-lg font-semibold text-slate-100">View Traces</h3>
              </div>

              <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                Inspect detailed reasoning traces to see exactly what the AI was thinking
                during manipulation attempts and flag suspicious patterns.
              </p>

              <button
                onClick={() => navigate('/traces/audit_adv_00016_retention_focused_angry_returner_gemini-2.5-flash_1768173632376')}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg transition-colors text-sm"
              >
                View Traces
              </button>
            </div>

            {/* Step 3: Compare the Judges */}
            <div className="glass-panel rounded-xl p-6 hover:border-cyan-500/30 transition-all">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/50 flex items-center justify-center text-cyan-400 font-bold text-sm">
                  3
                </div>
                <h3 className="text-lg font-semibold text-slate-100">Compare the Judges</h3>
              </div>

              <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                Compare how different judge models detect manipulation patterns
                using our cross-validation system.
              </p>

              <button
                onClick={() => navigate('/comparison/adv_00016_retention_focused_angry_returner_gemini-2.5-flash')}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg transition-colors text-sm"
              >
                Compare Judges
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Explore Section */}
      <div className="px-6 py-20">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-slate-100 mb-4">
            Go explore yourself!
          </h2>
          <p className="text-slate-400 mb-8">
            Dive into the dashboard to see all detections, statistics, and analysis tools.
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-2 px-8 py-4 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/50 rounded-lg transition-all text-lg font-medium"
          >
            <LayoutDashboard size={24} />
            Open Dashboard
            <ArrowRight size={20} />
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer className="px-6 py-12 border-t border-slate-800">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <img
              src="/thought-guards-logo.png"
              alt="ThoughtGuards"
              className="w-8 h-8 object-contain rounded-lg"
            />
            <div className="text-slate-400 text-sm">
              <span className="text-slate-300">ThoughtGuards</span> · MIT License
            </div>
          </div>

          <div className="flex items-center gap-6">
            <a
              href="https://github.com/HilaryTorn/ThoughtGuards"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors text-sm"
            >
              <Github size={18} />
              Contribute or fork
            </a>
            <span className="text-slate-600">|</span>
            <span className="text-slate-500 text-sm">
              Apart Research AI Manipulation Hackathon
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
