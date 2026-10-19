"use client";

import { ContentManifest } from "@stellarveriphy/shared/types";
import { useEffect, useState } from "react";

import { KeyValueBuilder, type MetadataValue } from "@/components/KeyValueBuilder";
import { ManifestPreview } from "@/components/ManifestPreview";
import { AutoSaveIndicator } from "@/components/ui/AutoSaveIndicator";
import { FormInput } from "@/components/ui/FormInput";
import { HelpIcon } from "@/components/ui/HelpIcon";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useToast } from "@/app/context/ToastContext";
import { ALL_TEMPLATES, loadTemplate, type TemplateId } from "@/utils/manifestTemplates";
import {
  downloadJSON,
  downloadXML,
  isValidSHA256,
  isValidStellarAddress,
} from "@/utils/validation";

export default function ManifestPage() {
  const { showToast } = useToast();
  const [manifest, setManifest] = useState<Partial<ContentManifest>>({
    contentHash: "",
    creator: "",
    timestamp: new Date().toISOString(),
    metadata: {},
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeTemplate, setActiveTemplate] = useState<TemplateId | null>(null);
  const contentHash = manifest.contentHash || "";
  const creator = manifest.creator || "";
  const timestamp = manifest.timestamp?.slice(0, 16) || "";

  const { state: autoSaveState, clearSaved } = useAutoSave({
    key: "manifest-form",
    data: manifest,
    interval: 20000,
  });

  useEffect(() => {
    const saved = localStorage.getItem("manifest-form");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<ContentManifest>;
        setManifest(parsed);
      } catch {
        /* noop */
      }
    }
  }, []);

  const handleChange = (field: keyof ContentManifest, value: ContentManifest[typeof field]) => {
    setManifest((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleTemplateSelect = (templateId: TemplateId) => {
    const templateManifest = loadTemplate(templateId);
    setManifest(templateManifest);
    setActiveTemplate(templateId);
    setErrors({});
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!manifest.contentHash?.trim()) {
      newErrors.contentHash = "Content hash is required";
    } else if (!isValidSHA256(manifest.contentHash)) {
      newErrors.contentHash = "Content hash must be a 64-character SHA-256 hex value";
    }

    if (!manifest.creator?.trim()) {
      newErrors.creator = "Creator address is required";
    } else if (!isValidStellarAddress(manifest.creator)) {
      newErrors.creator = "Invalid Stellar address format";
    }

    if (!manifest.timestamp?.trim()) {
      newErrors.timestamp = "Timestamp is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleDownloadJSON = () => {
    if (validateForm()) {
      clearSaved();
      downloadJSON(manifest, "manifest.json");
      showToast("Manifest downloaded as JSON", "success");
    }
  };

  const handleDownloadXML = () => {
    if (validateForm()) {
      clearSaved();
      downloadXML(manifest, "manifest.xml");
      showToast("Manifest downloaded as XML", "success");
    }
  };

  const handleMetadataChange = (metadata: Record<string, MetadataValue>) => {
    setManifest((prev) => ({ ...prev, metadata }));
  };

  return (
    <main className="min-h-screen bg-white dark:bg-gray-950 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2 text-black dark:text-white">Manifest Generator</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-2">
          Build a content manifest interactively with live preview.
        </p>
        <div className="mb-6 flex justify-end">
          <AutoSaveIndicator
            lastSaved={autoSaveState.lastSaved}
            isSaving={autoSaveState.isSaving}
            hasUnsaved={autoSaveState.hasUnsaved}
          />
        </div>

        {/* Template Selector */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3 text-black dark:text-white">
            Start from a Template
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {ALL_TEMPLATES.map((template) => (
              <button
                key={template.id}
                onClick={() => handleTemplateSelect(template.id)}
                className={`p-3 rounded-lg border-2 text-left transition-all ${
                  activeTemplate === template.id
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 shadow-sm"
                    : "border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 bg-white dark:bg-gray-800"
                }`}
              >
                <span className="text-2xl block mb-1">{template.icon}</span>
                <span className="text-sm font-medium text-black dark:text-white block">
                  {template.label}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400 block mt-1 leading-tight">
                  {template.description}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div>
              <FormInput
                label={
                  <>
                    Content Hash (SHA-256)
                    <HelpIcon
                      content="The SHA-256 hash of your content. Use the Hash Calculator tool to generate one."
                      className="ml-1.5 align-middle"
                    />
                  </>
                }
                type="text"
                value={contentHash}
                onChange={(e) => handleChange("contentHash", e.target.value)}
                placeholder="e.g., a1b2c3d4..."
                maxLength={64}
                showCharacterCount
                errorText={errors.contentHash}
                successText={isValidSHA256(contentHash) ? "Valid SHA-256 hash" : undefined}
                helperText="Paste the 64-character SHA-256 digest for the content."
              />
            </div>

            <div>
              <FormInput
                label={
                  <>
                    Creator (Stellar Address)
                    <HelpIcon
                      content="Your Stellar public key starting with G. Connect your wallet or paste your address."
                      className="ml-1.5 align-middle"
                    />
                  </>
                }
                type="text"
                value={creator}
                onChange={(e) => handleChange("creator", e.target.value)}
                placeholder="e.g., GBRPYHIL2CI3..."
                maxLength={56}
                showCharacterCount
                errorText={errors.creator}
                successText={isValidStellarAddress(creator) ? "Valid Stellar address" : undefined}
                helperText="Use a Stellar public key beginning with G."
              />
            </div>

            <div>
              <FormInput
                label={
                  <>
                    Timestamp (ISO 8601)
                    <HelpIcon
                      content="The date and time the content was created. Defaults to the current time."
                      className="ml-1.5 align-middle"
                    />
                  </>
                }
                type="datetime-local"
                value={timestamp}
                onChange={(e) => handleChange("timestamp", new Date(e.target.value).toISOString())}
                errorText={errors.timestamp}
                successText={timestamp ? "Timestamp ready" : undefined}
                helperText="Defaults to the current date and time."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-black dark:text-white mb-2">
                Custom Metadata
                <HelpIcon
                  content="Add custom key-value pairs to enrich your manifest with additional metadata."
                  className="ml-1.5 align-middle"
                />
              </label>
              <KeyValueBuilder value={manifest.metadata || {}} onChange={handleMetadataChange} />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleDownloadJSON}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 font-medium"
              >
                Download JSON
              </button>
              <button
                onClick={handleDownloadXML}
                className="flex-1 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 font-medium"
              >
                Download XML
              </button>
            </div>
          </div>
          <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
            <ManifestPreview manifest={manifest} />
          </aside>
        </div>
      </div>
    </main>
  );
}
