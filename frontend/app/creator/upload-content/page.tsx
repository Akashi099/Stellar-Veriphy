import { UploadForm } from "@/components/UploadForm";

export default function UploadContent() {
  return (
    <main>
      <h1>Upload Content</h1>
      <p>Submit your media for on-chain verification via StellarVeriphy.</p>
      <UploadForm />
    </main>
  );
"use client";

import { ModeSelection } from "@/features/verification/components/steps";

export default function UploadContent() {
  return <ModeSelection />;
}
