import React, { useState, useEffect, useCallback } from "react";
import { Loader2, RefreshCw, AlertTriangle, CheckCircle, Database, Clock, Calendar, LineChart, User as UserIcon, X } from "lucide-react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { Bar, Pie, Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

const API_BASE = "https://h2d8v8awd1.execute-api.us-west-2.amazonaws.com/";

// Professional color palette (PwC-inspired: deep navy + signature orange accents)
const SEVERITY_COLORS = {
  High:     { bg: 'rgba(220, 38, 38, 0.85)',  border: '#b91c1c' },   // red-600
  Medium:   { bg: 'rgba(234, 88, 12, 0.85)',  border: '#c2410c' },   // orange-600 (PwC orange family)
  Low:      { bg: 'rgba(22, 163, 74, 0.85)',  border: '#15803d' },   // green-600
  Critical: { bg: 'rgba(127, 29, 29, 0.9)',   border: '#7f1d1d' },   // red-900
  Info:     { bg: 'rgba(37, 99, 235, 0.85)',  border: '#1d4ed8' },   // blue-600
  Unknown:  { bg: 'rgba(100, 116, 139, 0.85)',border: '#475569' },   // slate-500
};

// Distinct categorical palette for non-severity slices (colorblind-friendly, professional)
const CATEGORY_PALETTE = [
  { bg: 'rgba(217, 83, 30, 0.85)',  border: '#D04A02' },  // PwC orange
  { bg: 'rgba(30, 58, 138, 0.85)',  border: '#1e3a8a' },  // navy
  { bg: 'rgba(13, 148, 136, 0.85)', border: '#0f766e' },  // teal
  { bg: 'rgba(202, 138, 4, 0.85)',  border: '#a16207' },  // amber
  { bg: 'rgba(124, 58, 237, 0.85)', border: '#6d28d9' },  // violet
  { bg: 'rgba(225, 29, 72, 0.85)',  border: '#be123c' },  // rose
  { bg: 'rgba(2, 132, 199, 0.85)',  border: '#0369a1' },  // sky
  { bg: 'rgba(75, 85, 99, 0.85)',   border: '#374151' },  // slate
];

const getSeverityColor = (label) => SEVERITY_COLORS[label] || SEVERITY_COLORS.Unknown;

const formatDateTime = (dateStr) => {
  if (!dateStr) return 'N/A';
  try {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch (e) {
    return dateStr;
  }
};

const Dashboard = () => {
  const [date, setDate] = useState("2026-04-29");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState({
    total_records: 0,
    by_severity: {},
    by_category: {}
  });
  const [recentRecords, setRecentRecords] = useState([]);
  const [topUsers, setTopUsers] = useState([]);
  const [trendData, setTrendData] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userDetails, setUserDetails] = useState(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Summary
      const summaryRes = await fetch(`${API_BASE}dashboard/summary?date=${date}`);
      if (!summaryRes.ok) throw new Error(`Summary API returned ${summaryRes.status}`);
      const summaryData = await summaryRes.json();
      setSummary(summaryData);

      // 2. Fetch Recent Records
      const recordsRes = await fetch(`${API_BASE}dashboard/recent?limit=20`);
      if (recordsRes.ok) {
        const recordsData = await recordsRes.json();
        const results = recordsData.results || [];
        setRecentRecords(results);
        
        const userStats = results.reduce((acc, curr) => {
          const user = curr.User || 'Unknown';
          const errorCode = curr.ErrorCode || curr.RootCause?.error_code || 'N/A';
          if (!acc[user]) acc[user] = { count: 0, errors: {} };
          acc[user].count += 1;
          acc[user].errors[errorCode] = (acc[user].errors[errorCode] || 0) + 1;
          return acc;
        }, {});

        const sortedUsers = Object.entries(userStats)
          .map(([user, data]) => {
            const topError = Object.entries(data.errors).sort((a, b) => b[1] - a[1])[0][0];
            return { user, count: data.count, topError };
          })
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        
        setTopUsers(sortedUsers);
      }

      // 3. Fetch Trend Data (Last 7 days)
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const trendRes = await fetch(`${API_BASE}dashboard/trend?start_date=${startDate}&end_date=${endDate}`);
      if (trendRes.ok) {
        const trendResult = await trendRes.json();
        setTrendData(trendResult.trend || []);
      }

    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [date]);

  const fetchUserDetails = async (userName) => {
    try {
      const res = await fetch(`${API_BASE}results?user_name=${userName}`);
      if (res.ok) {
        const data = await res.json();
        setUserDetails(data);
        setSelectedUser(userName);
      }
    } catch (err) {
      console.error("Failed to fetch user details", err);
    }
  };

  // Real-time refresh every 30 seconds
  useEffect(() => {
    loadDashboard();
    const interval = setInterval(() => {
      loadDashboard();
    }, 30000);
    return () => clearInterval(interval);
  }, [loadDashboard]);

  const categoryLabels = Object.keys(summary.by_category || {});
  const categoryChartData = {
    labels: categoryLabels,
    datasets: [{
      label: 'Categories',
      data: Object.values(summary.by_category || {}),
      backgroundColor: categoryLabels.map((_, i) => CATEGORY_PALETTE[i % CATEGORY_PALETTE.length].bg),
      borderColor: categoryLabels.map((_, i) => CATEGORY_PALETTE[i % CATEGORY_PALETTE.length].border),
      borderWidth: 1,
      borderRadius: 4,
    }]
  };

  const severityLabels = Object.keys(summary.by_severity || {});
  const severityChartData = {
    labels: severityLabels,
    datasets: [{
      label: 'Severity Breakdown',
      data: Object.values(summary.by_severity || {}),
      backgroundColor: severityLabels.map(l => getSeverityColor(l).bg),
      borderColor: severityLabels.map(l => getSeverityColor(l).border),
      borderWidth: 2,
      hoverOffset: 8,
    }]
  };

  const userBarData = {
    labels: topUsers.map(u => u.user),
    datasets: [{
      label: 'Error Count',
      data: topUsers.map(u => u.count),
      backgroundColor: 'rgba(30, 58, 138, 0.85)',
      borderColor: '#1e3a8a',
      borderWidth: 1,
      borderRadius: 4,
    }]
  };

  const trendChartData = {
    labels: trendData.map(t => t.date),
    datasets: [
      {
        label: 'Total Errors',
        data: trendData.map(t => t.total),
        borderColor: '#D04A02',
        backgroundColor: 'rgba(208, 74, 2, 0.12)',
        pointBackgroundColor: '#D04A02',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 4,
        fill: true,
        tension: 0.4
      }
    ]
  };

  return (
    <div className="bg-slate-50 min-h-screen text-slate-800 relative" style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif" }}>
      {selectedUser && userDetails && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center bg-slate-900 text-white">
              <h2 className="text-lg font-semibold flex items-center gap-2 tracking-tight">
                <UserIcon className="w-5 h-5 text-orange-400" />
                Individual Records: <span className="text-orange-400">{selectedUser}</span>
              </h2>
              <button onClick={() => setSelectedUser(null)} className="hover:bg-slate-800 p-1.5 rounded transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6 bg-gray-50">
              <div className="space-y-6">
                {userDetails.map((item, idx) => (
                  <div key={idx} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    {/* Header: Basic Info */}
                    <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                          item.RootCause?.severity === 'High' ? 'bg-red-100 text-red-700' : 
                          item.RootCause?.severity === 'Medium' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {item.RootCause?.severity || 'Unknown'}
                        </span>
                        <span className="text-sm font-medium text-gray-600">{formatDateTime(item.DateTime)}</span>
                      </div>
                      {item.MulesoftLogs?.ctx_id && (
                        <div className="mt-1 flex items-center gap-2 text-[10px] font-mono text-blue-500 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 w-fit">
                          <span className="font-bold uppercase">Mulesoft ID:</span>
                          {item.MulesoftLogs.ctx_id}
                        </div>
                      )}
                      <span className="text-xs font-semibold text-gray-400">ID: {item.RecordId}</span>
                    </div>

                    <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Left Column: Error Details */}
                      <div className="space-y-4">
                        <section>
                          <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Issue Context</h4>
                          <div className="space-y-1">
                            <p className="text-sm"><span className="font-semibold">OmniScript:</span> {item.RootCause?.omniscript || item.RootCause?.M?.omniscript?.S || 'N/A'}</p>
                            <p className="text-sm"><span className="font-semibold">Category:</span> {item.RootCause?.issue_category || 'N/A'}</p>
                            <p className="text-sm"><span className="font-semibold">Error Code:</span> <span className="text-red-600 font-mono">{item.ErrorCode}</span></p>
                          </div>
                        </section>

                        <section>
                          <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Error Message</h4>
                          <div className="bg-red-50 border border-red-100 rounded p-3 text-xs font-mono text-red-800 break-words">
                            {item.ErrorMessage}
                          </div>
                        </section>
                      </div>

                      {/* Right Column: Root Cause & Action */}
                      <div className="space-y-4">
                        <section>
                          <h4 className="text-xs font-bold text-gray-400 uppercase mb-2 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-orange-500" />
                            Root Cause Analysis
                          </h4>
                          <div className="bg-blue-50 border border-blue-100 rounded p-4 text-sm text-blue-900 italic">
                            {item.RootCause?.root_cause || "No detailed root cause available."}
                          </div>
                        </section>

                        <section>
                          <h4 className="text-xs font-bold text-gray-400 uppercase mb-2 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3 text-green-500" />
                            Recommended Action
                          </h4>
                          <div className="bg-green-50 border border-green-100 rounded p-4 text-sm text-green-900">
                            {item.RootCause?.recommended_action || "Standard review procedure recommended."}
                          </div>
                        </section>
                      </div>
                    </div>

                    {/* Footer: Metadata */}
                    <div className="px-5 py-3 bg-gray-50 border-t flex flex-wrap gap-4 text-[11px] text-gray-500 uppercase font-bold">
                       <span className="flex items-center gap-1">
                        <Database className="w-3 h-3" />
                        Confidence: {(item.RootCause?.issue_confidence || 0) * 100}%
                       </span>
                       <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                         Created: {formatDateTime(item.CreatedAt)}
                       </span>
                       {item.RootCause?.recording_review_needed && (
                         <span className="flex items-center gap-1 text-orange-600">
                          <AlertTriangle className="w-3 h-3" />
                           Recording Review Required
                         </span>
                       )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <nav className="bg-slate-900 text-white shadow-md sticky top-0 z-10 border-b-4 border-orange-500">
        <div className="container mx-auto flex flex-col md:flex-row justify-between items-center gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-orange-500 rounded flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight leading-tight">Analysis Dashboard</h1>
              <p className="text-[11px] text-slate-400 uppercase tracking-widest">Operational Insights</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input 
                type="date" 
                className="text-slate-800 text-sm p-2 pl-8 rounded border-0 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 outline-none bg-white"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <button 
              onClick={loadDashboard} 
              disabled={loading}
              className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-4 py-2 rounded flex items-center gap-2 transition-colors disabled:opacity-50 shadow-sm"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Refresh
            </button>
          </div>
        </div>
      </nav>

      <main className="container mx-auto p-4 md:p-6 space-y-6">
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded shadow-sm text-red-700">
            <p className="font-bold">Error</p>
            <p>{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard 
            label="Total Records" 
            value={summary.total_records} 
            color="border-blue-500" 
            icon={<Database className="text-blue-500" />} 
          />
          <StatCard 
            label="High Severity" 
            value={summary.by_severity?.High || 0} 
            color="border-red-500" 
            textColor="text-red-600"
            icon={<AlertTriangle className="text-red-500" />} 
          />
          <StatCard 
            label="Data Errors" 
            value={summary.by_category?.DATA_ERROR || 0} 
            color="border-orange-500" 
            textColor="text-orange-600"
            icon={<Clock className="text-orange-500" />} 
          />
          <StatCard 
            label="Recent Issues" 
            value={recentRecords.length} 
            color="border-green-500" 
            textColor="text-green-600"
            icon={<CheckCircle className="text-green-500" />} 
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
            <h3 className="text-sm font-semibold mb-5 flex items-center gap-2 text-slate-700 uppercase tracking-wider">
              <Clock className="w-4 h-4 text-orange-500" />
              Issue Categories
            </h3>
            <div className="h-64 flex justify-center items-center">
              <Bar data={categoryChartData} options={{ maintainAspectRatio: false }} />
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
            <h3 className="text-sm font-semibold mb-5 flex items-center gap-2 text-slate-700 uppercase tracking-wider">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              Severity Breakdown
            </h3>
            <div className="h-64 flex justify-center items-center">
              <Pie data={severityChartData} options={{ maintainAspectRatio: false }} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
            <h3 className="text-sm font-semibold mb-5 flex items-center gap-2 text-slate-700 uppercase tracking-wider">
              <LineChart className="w-4 h-4 text-orange-500" />
              Error Trends (Last 7 Days)
            </h3>
            <div className="h-64">
              <Line data={trendChartData} options={{ maintainAspectRatio: false }} />
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
            <h3 className="text-sm font-semibold mb-5 flex items-center gap-2 text-slate-700 uppercase tracking-wider">
              <Database className="w-4 h-4 text-slate-700" />
              Top 10 LAN IDs by Error Frequency
            </h3>
            <div className="h-64">
              <Bar 
                data={userBarData} 
                options={{ 
                  maintainAspectRatio: false,
                  onClick: (e, elements) => {
                    if (elements.length > 0) {
                      const user = topUsers[elements[0].index].user;
                      fetchUserDetails(user);
                    }
                  },
                  plugins: {
                    tooltip: {
                      callbacks: {
                        afterLabel: function(context) {
                          const user = topUsers[context.dataIndex];
                          return `Primary Error: ${user.topError}\nClick to view individual data`;
                        }
                      }
                    }
                  }
                }} 
              />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="flex justify-between items-center mb-5">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Recent Analysis Records</h3>
            <span className="text-xs text-slate-400">Click a User to view individual history</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase text-[11px] font-semibold tracking-wider">
                  <th className="p-3">User</th>
                  <th className="p-3">Time</th>
                  <th className="p-3">Omniscript</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Severity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {recentRecords.length > 0 ? recentRecords.map((record, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => fetchUserDetails(record.User)}>
                    <td className="p-3 font-medium text-slate-900 hover:text-orange-600 hover:underline">{record.User || 'N/A'}</td>
                    <td className="p-3 text-slate-600">{formatDateTime(record.DateTime)}</td>
                    <td className="p-3 text-slate-500">{record.RootCause?.omniscript || 'N/A'}</td>
                    <td className="p-3">
                      <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-medium">
                        {record.RootCause?.issue_category || 'N/A'}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        record.RootCause?.severity === 'High' ? 'bg-red-50 text-red-700 ring-1 ring-red-100' : 
                        record.RootCause?.severity === 'Medium' ? 'bg-orange-50 text-orange-700 ring-1 ring-orange-100' : 'bg-green-50 text-green-700 ring-1 ring-green-100'
                      }`}>
                        {record.RootCause?.severity || 'N/A'}
                      </span>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="5" className="p-8 text-center text-slate-400 italic">
                      No records found for this date.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};

const StatCard = ({ label, value, color, textColor = "text-slate-900", icon }) => (
  <div className={`bg-white p-5 rounded-lg shadow-sm border border-slate-200 border-l-4 ${color} hover:shadow-md transition-shadow flex justify-between items-start`}>
    <div>
      <div className="text-slate-500 text-[11px] font-semibold mb-2 uppercase tracking-widest">{label}</div>
      <div className={`text-3xl font-semibold tracking-tight ${textColor}`}>{value}</div>
    </div>
    <div className="p-2 bg-slate-50 rounded-md border border-slate-100">
      {icon}
    </div>
  </div>
);

export default Dashboard;