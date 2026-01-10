import React, { useState, useEffect } from 'react';
import { Search, Filter, Download, Trash2, Eye, Calendar, ChevronDown, ChevronUp, CheckSquare, Square } from 'lucide-react';
import { AuditReport } from '../types';

interface ReportListViewProps {
  conversationId?: string;
  onViewReport?: (report: AuditReport) => void;
  onDeleteReports?: (reportIds: string[]) => void;
  onExportReports?: (reports: AuditReport[], format: 'csv' | 'json' | 'latex') => void;
}

const ReportListView: React.FC<ReportListViewProps> = ({
  conversationId,
  onViewReport,
  onDeleteReports,
  onExportReports
}) => {
  const [reports, setReports] = useState<AuditReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReports, setSelectedReports] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'date' | 'score' | 'model' | 'skill'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filters
  const [filterModel, setFilterModel] = useState<string>('');
  const [filterSkill, setFilterSkill] = useState<string>('');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [filterScoreMin, setFilterScoreMin] = useState<number | ''>('');
  const [filterScoreMax, setFilterScoreMax] = useState<number | ''>('');

  useEffect(() => {
    loadReports();
  }, [conversationId]);

  const loadReports = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (conversationId) {
        params.append('conversation_id', conversationId);
      }
      params.append('limit', '1000');
      
      const response = await fetch(`/api/audit-reports?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setReports(data.reports || []);
      }
    } catch (error) {
      console.error('Error loading reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredReports = reports.filter(report => {
    if (searchQuery && !report.report_id.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !report.conversation_id.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (filterModel && report.model_name !== filterModel) return false;
    if (filterSkill && report.skill_id !== filterSkill) return false;
    if (filterDateFrom && report.created_at < filterDateFrom) return false;
    if (filterDateTo && report.created_at > filterDateTo) return false;
    if (filterScoreMin !== '' && report.overall_score < filterScoreMin) return false;
    if (filterScoreMax !== '' && report.overall_score > filterScoreMax) return false;
    return true;
  });

  const sortedReports = [...filteredReports].sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case 'date':
        comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        break;
      case 'score':
        comparison = a.overall_score - b.overall_score;
        break;
      case 'model':
        comparison = a.model_name.localeCompare(b.model_name);
        break;
      case 'skill':
        comparison = a.skill_id.localeCompare(b.skill_id);
        break;
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const handleSelectAll = () => {
    if (selectedReports.size === sortedReports.length) {
      setSelectedReports(new Set());
    } else {
      setSelectedReports(new Set(sortedReports.map(r => r.report_id)));
    }
  };

  const handleToggleSelect = (reportId: string) => {
    const newSelected = new Set(selectedReports);
    if (newSelected.has(reportId)) {
      newSelected.delete(reportId);
    } else {
      newSelected.add(reportId);
    }
    setSelectedReports(newSelected);
  };

  const handleDeleteSelected = async () => {
    if (selectedReports.size === 0) return;
    if (!confirm(`Delete ${selectedReports.size} report(s)?`)) return;
    
    if (onDeleteReports) {
      onDeleteReports(Array.from(selectedReports));
    } else {
      // Default delete implementation
      for (const reportId of selectedReports) {
        await fetch(`/api/audit-reports/${reportId}`, { method: 'DELETE' });
      }
    }
    
    setSelectedReports(new Set());
    loadReports();
  };

  const handleExport = (format: 'csv' | 'json' | 'latex') => {
    const reportsToExport = selectedReports.size > 0
      ? sortedReports.filter(r => selectedReports.has(r.report_id))
      : sortedReports;
    
    if (onExportReports) {
      onExportReports(reportsToExport, format);
    }
  };

  const uniqueModels = [...new Set(reports.map(r => r.model_name))];
  const uniqueSkills = [...new Set(reports.map(r => r.skill_id))];

  if (loading) {
    return (
      <div className="p-6 text-center text-slate-400">
        Loading reports...
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">Audit Reports</h2>
          <p className="text-sm text-slate-400 mt-1">
            {sortedReports.length} report{sortedReports.length !== 1 ? 's' : ''}
            {conversationId && ` for conversation ${conversationId}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedReports.size > 0 && (
            <>
              <button
                onClick={() => handleExport('csv')}
                className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/50 rounded-lg text-sm flex items-center gap-2"
              >
                <Download size={16} />
                Export CSV
              </button>
              <button
                onClick={() => handleExport('json')}
                className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/50 rounded-lg text-sm flex items-center gap-2"
              >
                <Download size={16} />
                Export JSON
              </button>
              <button
                onClick={handleDeleteSelected}
                className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/50 rounded-lg text-sm flex items-center gap-2"
              >
                <Trash2 size={16} />
                Delete ({selectedReports.size})
              </button>
            </>
          )}
          <button
            onClick={() => setFilterOpen(!filterOpen)}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm flex items-center gap-2"
          >
            <Filter size={16} />
            Filters
            {filterOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
        <input
          type="text"
          placeholder="Search by report ID or conversation ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        />
      </div>

      {/* Filters */}
      {filterOpen && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Model</label>
              <select
                value={filterModel}
                onChange={(e) => setFilterModel(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-sm"
              >
                <option value="">All Models</option>
                {uniqueModels.map(model => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Skill</label>
              <select
                value={filterSkill}
                onChange={(e) => setFilterSkill(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-sm"
              >
                <option value="">All Skills</option>
                {uniqueSkills.map(skill => (
                  <option key={skill} value={skill}>{skill}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Date From</label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Date To</label>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Min Score</label>
              <input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={filterScoreMin}
                onChange={(e) => setFilterScoreMin(e.target.value ? parseFloat(e.target.value) : '')}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-sm"
                placeholder="0.0"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Max Score</label>
              <input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={filterScoreMax}
                onChange={(e) => setFilterScoreMax(e.target.value ? parseFloat(e.target.value) : '')}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-sm"
                placeholder="1.0"
              />
            </div>
          </div>
        </div>
      )}

      {/* Sort Controls */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-slate-400">Sort by:</span>
        {(['date', 'score', 'model', 'skill'] as const).map(option => (
          <button
            key={option}
            onClick={() => {
              if (sortBy === option) {
                setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
              } else {
                setSortBy(option);
                setSortOrder('desc');
              }
            }}
            className={`px-3 py-1 rounded-lg capitalize ${
              sortBy === option
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {option}
            {sortBy === option && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
          </button>
        ))}
      </div>

      {/* Reports Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-800 border-b border-slate-700">
            <tr>
              <th className="px-4 py-3 text-left">
                <button
                  onClick={handleSelectAll}
                  className="text-slate-400 hover:text-slate-200"
                >
                  {selectedReports.size === sortedReports.length && sortedReports.length > 0 ? (
                    <CheckSquare size={18} />
                  ) : (
                    <Square size={18} />
                  )}
                </button>
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Report ID</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Score</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Model</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Skill</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Version</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Cache</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {sortedReports.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                  No reports found
                </td>
              </tr>
            ) : (
              sortedReports.map(report => (
                <tr
                  key={report.report_id}
                  className={`hover:bg-slate-800/50 transition-colors ${
                    selectedReports.has(report.report_id) ? 'bg-slate-800/30' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleSelect(report.report_id)}
                      className="text-slate-400 hover:text-slate-200"
                    >
                      {selectedReports.has(report.report_id) ? (
                        <CheckSquare size={18} />
                      ) : (
                        <Square size={18} />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-xs text-slate-300 font-mono">
                      {report.report_id.substring(0, 12)}...
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-mono text-sm ${
                      report.overall_score > 0.7 ? 'text-red-400' :
                      report.overall_score > 0.4 ? 'text-yellow-400' :
                      'text-green-400'
                    }`}>
                      {(report.overall_score * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-300">
                    {report.model_name}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-300">
                    {report.skill_id}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400 font-mono">
                    {report.skill_version}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">
                    {new Date(report.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {report.cache_hit ? (
                      <span className="text-xs px-2 py-1 bg-green-500/20 text-green-400 rounded">
                        Hit
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-1 bg-slate-700 text-slate-400 rounded">
                        Miss
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onViewReport?.(report)}
                      className="px-3 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/50 rounded text-sm flex items-center gap-1"
                    >
                      <Eye size={14} />
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ReportListView;

