import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store/app-store';

export function Dashboard() {
  const { setSite } = useAppStore();
  const [stats] = useState({
    totalPositions: 12,
    totalObservations: 0,
    activeViolations: 0,
    noticesIssued: 0,
  });

  useEffect(() => {
    // Set default site on mount
    // TODO: Load from API or user preference
    // For now, user will need to run seed script and update these IDs
    const siteId = localStorage.getItem('currentSiteId');
    const lotImageId = localStorage.getItem('currentLotImageId');

    if (siteId && lotImageId) {
      setSite(siteId, lotImageId);
    }
  }, [setSite]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-gray-600">Parking enforcement overview</p>
      </div>

      {/* Site Setup Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <span className="text-2xl">ℹ️</span>
          <div className="flex-1">
            <h3 className="font-semibold text-blue-900 mb-2">
              Setup Required
            </h3>
            <p className="text-blue-800 text-sm mb-3">
              Run the database seed script to create test data, then set the Site ID and Lot Image ID:
            </p>
            <ol className="text-blue-800 text-sm space-y-1 mb-3 list-decimal list-inside">
              <li>Run: <code className="bg-blue-100 px-1 rounded">cd backend && npm run db:reset</code></li>
              <li>Copy the Site ID and Lot Image ID from the output</li>
              <li>Paste them below and click "Save"</li>
            </ol>
            <SiteIdForm />
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Parking Positions"
          value={stats.totalPositions}
          icon="🅿️"
          color="blue"
        />
        <StatCard
          title="Observations"
          value={stats.totalObservations}
          icon="📷"
          color="green"
        />
        <StatCard
          title="Active Violations"
          value={stats.activeViolations}
          icon="⚠️"
          color="yellow"
        />
        <StatCard
          title="Notices Issued"
          value={stats.noticesIssued}
          icon="📄"
          color="red"
        />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Quick Actions
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ActionButton
            href="/positions"
            icon="🅿️"
            title="Manage Positions"
            description="View and edit parking positions"
          />
          <ActionButton
            href="/observations"
            icon="📷"
            title="Submit Observation"
            description="Record a new observation"
          />
          <ActionButton
            href="/violations"
            icon="⚠️"
            title="Review Violations"
            description="Manage active violations"
          />
        </div>
      </div>
    </div>
  );
}

function SiteIdForm() {
  const { setSite } = useAppStore();
  const [siteId, setSiteIdInput] = useState(localStorage.getItem('currentSiteId') || '');
  const [lotImageId, setLotImageIdInput] = useState(localStorage.getItem('currentLotImageId') || '');

  const handleSave = () => {
    if (siteId && lotImageId) {
      localStorage.setItem('currentSiteId', siteId);
      localStorage.setItem('currentLotImageId', lotImageId);
      setSite(siteId, lotImageId);
      alert('Site configuration saved!');
    }
  };

  return (
    <div className="bg-white rounded p-3 space-y-2">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Site ID
        </label>
        <input
          type="text"
          value={siteId}
          onChange={(e) => setSiteIdInput(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          placeholder="Paste Site ID from seed output"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Lot Image ID
        </label>
        <input
          type="text"
          value={lotImageId}
          onChange={(e) => setLotImageIdInput(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          placeholder="Paste Lot Image ID from seed output"
        />
      </div>
      <button
        onClick={handleSave}
        className="w-full bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
      >
        Save Site Configuration
      </button>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: number;
  icon: string;
  color: string;
}) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    yellow: 'bg-yellow-50 text-yellow-700',
    red: 'bg-red-50 text-red-700',
  };

  return (
    <div className={`rounded-lg p-6 ${colors[color as keyof typeof colors]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-80">{title}</p>
          <p className="text-3xl font-bold mt-2">{value}</p>
        </div>
        <span className="text-4xl">{icon}</span>
      </div>
    </div>
  );
}

function ActionButton({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <a
      href={href}
      className="block p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
    >
      <div className="flex items-center space-x-3 mb-2">
        <span className="text-2xl">{icon}</span>
        <h4 className="font-semibold text-gray-900">{title}</h4>
      </div>
      <p className="text-sm text-gray-600">{description}</p>
    </a>
  );
}
