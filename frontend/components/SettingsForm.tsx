"use client";

import { useState } from "react";

// Shared row layout: labels stack above fields on small screens and sit in a
// fixed-width column on larger ones. The label's top padding equals the
// control's padding plus border (0.5rem + 1px) so label text lines up with
// the text inside the control.
const ROW = "grid min-w-0 gap-1.5 py-4 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-6";
const LABEL_TEXT = "text-sm font-medium leading-5 text-slate-800";
const LABEL = `${LABEL_TEXT} sm:pt-[calc(0.5rem+1px)]`;
const HINT = "mt-1.5 text-sm text-slate-500";
const CONTROL =
  "block w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-5 text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/30";

function TextRow({
  id,
  label,
  hint,
  ...inputProps
}: { id: string; label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={ROW}>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <div className="min-w-0">
        <input id={id} name={id} className={CONTROL} aria-describedby={hint ? `${id}-hint` : undefined} {...inputProps} />
        {hint && (
          <p id={`${id}-hint`} className={HINT}>
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

function CheckboxRow({ id, label, hint, defaultChecked }: { id: string; label: string; hint: string; defaultChecked?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        name={id}
        type="checkbox"
        defaultChecked={defaultChecked}
        aria-describedby={`${id}-hint`}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-indigo-600"
      />
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium leading-5 text-slate-800">
          {label}
        </label>
        <p id={`${id}-hint`} className="text-sm text-slate-500">
          {hint}
        </p>
      </div>
    </div>
  );
}

export default function SettingsForm() {
  const [saved, setSaved] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // TODO: persist once the account settings API exists.
    setSaved(true);
  }

  return (
    <form onSubmit={handleSubmit} onChange={() => setSaved(false)} className="rounded-xl border border-slate-200 bg-white px-5 shadow-sm sm:px-8">
      <div className="divide-y divide-slate-100">
        <TextRow id="displayName" label="Display name" autoComplete="name" placeholder="Jane Creator" />
        <TextRow id="email" label="Email" type="email" autoComplete="email" hint="Used for verification status notifications." />
        <TextRow
          id="stellarAccount"
          label="Stellar account"
          placeholder="G…"
          spellCheck={false}
          autoCapitalize="characters"
          pattern="G[A-Z2-7]{55}"
          className={`${CONTROL} font-mono`}
          hint="Public key that signs your submissions. Must start with G."
        />

        <div className={ROW}>
          <label htmlFor="defaultVisibility" className={LABEL}>
            Default visibility
          </label>
          <div className="min-w-0">
            <select id="defaultVisibility" name="defaultVisibility" defaultValue="public" className={CONTROL} aria-describedby="defaultVisibility-hint">
              <option value="public">Public — anyone can view</option>
              <option value="link">Anyone with the link</option>
              <option value="private">Private — only people I choose</option>
            </select>
            <p id="defaultVisibility-hint" className={HINT}>
              Applies to new uploads. Certificates stay publicly verifiable either way.
            </p>
          </div>
        </div>

        <div className={ROW}>
          <label htmlFor="bio" className={LABEL}>
            Bio
          </label>
          <div className="min-w-0">
            <textarea id="bio" name="bio" rows={3} className={`${CONTROL} resize-y`} />
          </div>
        </div>

        <fieldset className={ROW}>
          {/* legend can't be a grid item in all browsers, so the visual label is a span and the legend is visually hidden */}
          <legend className="sr-only">Notifications</legend>
          <span aria-hidden="true" className={LABEL_TEXT}>
            Notifications
          </span>
          <div className="space-y-4">
            <CheckboxRow id="notifyCertified" label="Certificate minted" hint="When your content passes verification." defaultChecked />
            <CheckboxRow id="notifyFailed" label="Verification failed" hint="When a check fails and needs your attention." defaultChecked />
          </div>
        </fieldset>
      </div>

      <div className="flex flex-col-reverse items-stretch gap-3 border-t border-slate-100 py-4 sm:flex-row sm:items-center sm:justify-end">
        <p role="status" className="text-sm text-emerald-700 sm:mr-auto">
          {saved ? "Settings saved." : ""}
        </p>
        <button
          type="submit"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          Save changes
        </button>
      </div>
    </form>
  );
}
