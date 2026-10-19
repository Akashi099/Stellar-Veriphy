"use client";

/**
 * Feature Flag Admin UI Component
 *
 * Allows administrators to view and toggle feature flags
 */

import { useEffect, useState } from "react";

import {
  FEATURE_FLAGS,
  getAllFeatureFlags,
  getFeatureFlagConfig,
  updateFeatureFlag,
} from "@/lib/feature-flags";

interface FeatureFlagUIState {
  flagName: string;
  config: any;
  enabled: boolean;
}

export function FeatureFlagAdmin() {
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [selectedFlag, setSelectedFlag] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const allFlags = getAllFeatureFlags();
    setFlags(allFlags);
    setLoading(false);
  }, []);

  const handleToggleFlag = (flagName: string) => {
    const currentEnabled = flags[flagName];
    const config = getFeatureFlagConfig(flagName);

    if (config) {
      updateFeatureFlag(flagName, {
        ...config,
        enabled: !currentEnabled,
      });

      setFlags((prev) => ({
        ...prev,
        [flagName]: !currentEnabled,
      }));
    }
  };

  if (loading) {
    return <div className="p-4">Loading feature flags...</div>;
  }

  const selectedConfig = selectedFlag ? FEATURE_FLAGS[selectedFlag] : null;

  return (
    <div className="flex gap-6 p-6 bg-gray-50 rounded-lg">
      {/* Flag List */}
      <div className="flex-1 min-w-0">
        <h2 className="text-lg font-semibold mb-4">Feature Flags</h2>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="divide-y">
            {Object.entries(flags).map(([name, enabled]) => (
              <button
                key={name}
                onClick={() => setSelectedFlag(name)}
                className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${
                  selectedFlag === name ? "bg-blue-50 border-l-4 border-blue-500" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">{name}</span>
                  <div
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      enabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {enabled ? "Enabled" : "Disabled"}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Flag Details */}
      {selectedConfig && selectedFlag && (
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold mb-4">Configuration</h2>
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Name</h3>
              <p className="text-gray-600 font-mono text-sm">{selectedFlag}</p>
            </div>

            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Description</h3>
              <p className="text-gray-600 text-sm">{selectedConfig.description}</p>
            </div>

            <div className="border-t pt-4">
              <h3 className="font-semibold text-gray-900 mb-3">Status</h3>
              <button
                onClick={() => handleToggleFlag(selectedFlag)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  flags[selectedFlag]
                    ? "bg-red-100 text-red-700 hover:bg-red-200"
                    : "bg-green-100 text-green-700 hover:bg-green-200"
                }`}
              >
                {flags[selectedFlag] ? "Disable Flag" : "Enable Flag"}
              </button>
            </div>

            {selectedConfig.environments && (
              <div className="border-t pt-4">
                <h3 className="font-semibold text-gray-900 mb-3">Environment Settings</h3>
                <div className="space-y-2">
                  {Object.entries(selectedConfig.environments).map(
                    ([env, enabled]: [string, any]) => (
                      <div key={env} className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 capitalize">{env}</span>
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            enabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {enabled ? "Enabled" : "Disabled"}
                        </span>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            {selectedConfig.rollout && (
              <div className="border-t pt-4">
                <h3 className="font-semibold text-gray-900 mb-3">Rollout Settings</h3>
                <div className="space-y-2 text-sm">
                  {selectedConfig.rollout.percentage !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Rollout Percentage</span>
                      <span className="font-medium">{selectedConfig.rollout.percentage}%</span>
                    </div>
                  )}
                  {selectedConfig.rollout.startDate && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Start Date</span>
                      <span className="font-mono text-xs">{selectedConfig.rollout.startDate}</span>
                    </div>
                  )}
                  {selectedConfig.rollout.endDate && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">End Date</span>
                      <span className="font-mono text-xs">{selectedConfig.rollout.endDate}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {selectedConfig.users && (
              <div className="border-t pt-4">
                <h3 className="font-semibold text-gray-900 mb-3">User Rules</h3>
                <div className="space-y-2 text-sm">
                  {selectedConfig.users.percentage !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Percentage</span>
                      <span className="font-medium">{selectedConfig.users.percentage}%</span>
                    </div>
                  )}
                  {selectedConfig.users.allowList && (
                    <div>
                      <span className="text-gray-600">Allow List</span>
                      <div className="text-xs font-mono bg-gray-100 p-2 rounded mt-1">
                        {selectedConfig.users.allowList.join(", ")}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
