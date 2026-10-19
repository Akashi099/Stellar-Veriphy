"use client";

import { useState } from "react";

import { BarChart, LineChart, PieChart } from "@/components/charts";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingTransition } from "@/components/ui/LoadingTransition";
import { PageTransition } from "@/components/ui/PageTransition";
import { WizardTransition } from "@/components/ui/WizardTransition";

export default function FeaturesDemo() {
  const [isLoading, setIsLoading] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardDirection, setWizardDirection] = useState<"forward" | "backward">("forward");
  const [showEmptyState, setShowEmptyState] = useState(false);

  // Chart data
  const lineData = [
    { name: "Jan", verifications: 400, certificates: 240 },
    { name: "Feb", verifications: 300, certificates: 139 },
    { name: "Mar", verifications: 200, certificates: 980 },
    { name: "Apr", verifications: 278, certificates: 390 },
    { name: "May", verifications: 189, certificates: 480 },
  ];

  const barData = [
    { name: "Mon", success: 400, failed: 24 },
    { name: "Tue", success: 300, failed: 13 },
    { name: "Wed", success: 500, failed: 98 },
    { name: "Thu", success: 278, failed: 39 },
    { name: "Fri", success: 489, failed: 48 },
  ];

  const pieData = [
    { name: "Completed", value: 400 },
    { name: "Pending", value: 300 },
    { name: "Failed", value: 100 },
  ];

  const handleLoadingDemo = () => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 2000);
  };

  const handleWizardNext = () => {
    setWizardDirection("forward");
    setWizardStep((prev) => Math.min(prev + 1, 2));
  };

  const handleWizardPrev = () => {
    setWizardDirection("backward");
    setWizardStep((prev) => Math.max(prev - 1, 0));
  };

  return (
    <PageTransition type="fade">
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h1 className="text-4xl font-bold mb-2">Features Demo</h1>
          <p className="text-gray-300 mb-12">Demonstrating new UI components and transitions</p>

          {/* Transitions Section */}
          <section className="mb-16">
            <h2 className="text-2xl font-bold mb-6">1. Page & Loading Transitions</h2>
            <div className="bg-white/10 backdrop-blur-md rounded-lg p-6 border border-white/20">
              <button
                onClick={handleLoadingDemo}
                className="px-6 py-3 bg-blue-500 hover:bg-blue-600 rounded-lg font-medium transition-colors mb-4"
              >
                Trigger Loading State
              </button>

              <LoadingTransition isLoading={isLoading}>
                <div className="p-8 bg-white/5 rounded-lg border border-white/10">
                  <h3 className="text-xl font-semibold mb-2">Content Loaded!</h3>
                  <p className="text-gray-300">
                    This content smoothly transitions in after loading completes.
                  </p>
                </div>
              </LoadingTransition>
            </div>
          </section>

          {/* Wizard Transitions */}
          <section className="mb-16">
            <h2 className="text-2xl font-bold mb-6">2. Wizard Transitions</h2>
            <div className="bg-white/10 backdrop-blur-md rounded-lg p-6 border border-white/20">
              <div className="flex items-center justify-between mb-6">
                <div className="flex gap-2">
                  {[0, 1, 2].map((step) => (
                    <div
                      key={step}
                      className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        step === wizardStep
                          ? "bg-blue-500"
                          : step < wizardStep
                            ? "bg-green-500"
                            : "bg-white/20"
                      }`}
                    >
                      {step + 1}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleWizardPrev}
                    disabled={wizardStep === 0}
                    className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={handleWizardNext}
                    disabled={wizardStep === 2}
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>

              <WizardTransition currentStep={wizardStep} direction={wizardDirection}>
                <div className="p-8 bg-white/5 rounded-lg border border-white/10 min-h-[200px]">
                  {wizardStep === 0 && (
                    <div>
                      <h3 className="text-xl font-semibold mb-2">Step 1: Getting Started</h3>
                      <p className="text-gray-300">This is the first step of the wizard.</p>
                    </div>
                  )}
                  {wizardStep === 1 && (
                    <div>
                      <h3 className="text-xl font-semibold mb-2">Step 2: Configuration</h3>
                      <p className="text-gray-300">Configure your settings here.</p>
                    </div>
                  )}
                  {wizardStep === 2 && (
                    <div>
                      <h3 className="text-xl font-semibold mb-2">Step 3: Complete</h3>
                      <p className="text-gray-300">You&apos;ve reached the final step!</p>
                    </div>
                  )}
                </div>
              </WizardTransition>
            </div>
          </section>

          {/* Charts Section */}
          <section className="mb-16">
            <h2 className="text-2xl font-bold mb-6">3. Chart Components</h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-white/10 backdrop-blur-md rounded-lg p-6 border border-white/20">
                <h3 className="text-lg font-semibold mb-4">Line Chart</h3>
                <LineChart
                  data={lineData}
                  lines={[
                    { dataKey: "verifications", stroke: "#3b82f6", name: "Verifications" },
                    { dataKey: "certificates", stroke: "#8b5cf6", name: "Certificates" },
                  ]}
                  height={250}
                />
              </div>

              <div className="bg-white/10 backdrop-blur-md rounded-lg p-6 border border-white/20">
                <h3 className="text-lg font-semibold mb-4">Bar Chart</h3>
                <BarChart
                  data={barData}
                  bars={[
                    { dataKey: "success", fill: "#10b981", name: "Success" },
                    { dataKey: "failed", fill: "#ef4444", name: "Failed" },
                  ]}
                  height={250}
                />
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-md rounded-lg p-6 border border-white/20">
              <h3 className="text-lg font-semibold mb-4">Pie Chart</h3>
              <div className="max-w-md mx-auto">
                <PieChart data={pieData} colors={["#10b981", "#f59e0b", "#ef4444"]} height={300} />
              </div>
            </div>
          </section>

          {/* Empty States Section */}
          <section className="mb-16">
            <h2 className="text-2xl font-bold mb-6">4. Empty State Illustrations</h2>
            <div className="bg-white/10 backdrop-blur-md rounded-lg p-6 border border-white/20">
              <div className="flex items-center gap-4 mb-6">
                <button
                  onClick={() => setShowEmptyState(!showEmptyState)}
                  className="px-6 py-3 bg-blue-500 hover:bg-blue-600 rounded-lg font-medium transition-colors"
                >
                  {showEmptyState ? "Hide" : "Show"} Empty State
                </button>
              </div>

              {showEmptyState && (
                <div className="bg-white dark:bg-gray-900 rounded-lg p-8">
                  <EmptyState
                    illustration="certificates"
                    heading="No Certificates Yet"
                    body="Certificates you issue will appear here. Start by issuing your first one."
                    primaryAction={{
                      label: "Issue Certificate",
                      onClick: () => alert("Issue Certificate clicked"),
                    }}
                    secondaryAction={{
                      label: "Learn more",
                      onClick: () => alert("Learn more clicked"),
                    }}
                    onboardingTip="Certificates are linked to on-chain attestations."
                  />
                </div>
              )}
            </div>
          </section>

          {/* Mobile Nav Info */}
          <section className="mb-16">
            <h2 className="text-2xl font-bold mb-6">5. Mobile Navigation</h2>
            <div className="bg-white/10 backdrop-blur-md rounded-lg p-6 border border-white/20">
              <p className="text-gray-300 mb-4">
                The mobile navigation is integrated into the header. On mobile devices:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-300">
                <li>Click the hamburger menu in the top-left corner</li>
                <li>Smooth slide-out drawer appears from the left</li>
                <li>Quick access section for important actions</li>
                <li>All navigation links with active state highlighting</li>
                <li>Theme toggle and wallet controls at the bottom</li>
                <li>Close by clicking outside or pressing Escape</li>
                <li>Fully keyboard accessible with Tab navigation</li>
              </ul>
            </div>
          </section>

          {/* Accessibility Note */}
          <section>
            <div className="bg-green-500/10 backdrop-blur-md rounded-lg p-6 border border-green-500/20">
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <span>✅</span> Accessibility Features
              </h3>
              <p className="text-gray-300 mb-2">All components include:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-300">
                <li>prefers-reduced-motion support</li>
                <li>Keyboard navigation</li>
                <li>ARIA labels and roles</li>
                <li>Touch-friendly targets (min 44px)</li>
                <li>Dark mode support</li>
              </ul>
            </div>
          </section>
        </div>
      </div>
    </PageTransition>
  );
}
