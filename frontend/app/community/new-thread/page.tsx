import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Start New Discussion | Community | Stellar-Veriphy',
  description: 'Create a new discussion thread in the Stellar-Veriphy community forum',
};

export default function NewThreadPage() {
  return (
    <div className="container mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-8 text-4xl font-bold">Start New Discussion</h1>

      <form className="space-y-6">
        {/* Category Selection */}
        <div>
          <label htmlFor="category" className="block font-semibold">
            Category *
          </label>
          <select
            id="category"
            name="category"
            required
            className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2 dark:border-gray-600 dark:bg-gray-800"
          >
            <option value="">Select a category</option>
            <option value="general">General Discussion</option>
            <option value="help">Help & Support</option>
            <option value="tutorials">Tutorials & Guides</option>
            <option value="announcements">Announcements</option>
            <option value="feature-requests">Feature Requests</option>
            <option value="showcase">Showcase</option>
          </select>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Choose the most appropriate category for your discussion.
          </p>
        </div>

        {/* Title */}
        <div>
          <label htmlFor="title" className="block font-semibold">
            Title *
          </label>
          <input
            id="title"
            type="text"
            name="title"
            required
            placeholder="What's your discussion about?"
            maxLength={150}
            className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2 dark:border-gray-600 dark:bg-gray-800"
          />
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Be clear and descriptive. Maximum 150 characters.
          </p>
        </div>

        {/* Content */}
        <div>
          <label htmlFor="content" className="block font-semibold">
            Content *
          </label>
          <textarea
            id="content"
            name="content"
            required
            placeholder="Write your discussion here. Use markdown for formatting."
            rows={10}
            className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2 dark:border-gray-600 dark:bg-gray-800"
          />
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Markdown formatting is supported. Be helpful and respectful.
          </p>
        </div>

        {/* Tags */}
        <div>
          <label htmlFor="tags" className="block font-semibold">
            Tags (comma-separated)
          </label>
          <input
            id="tags"
            type="text"
            name="tags"
            placeholder="e.g., verification, blockchain, help"
            className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2 dark:border-gray-600 dark:bg-gray-800"
          />
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Add 2-3 relevant tags to help others find your discussion.
          </p>
        </div>

        {/* Preview */}
        <div>
          <div className="rounded-lg bg-gray-100 p-4 dark:bg-gray-800">
            <h3 className="font-bold">Preview</h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Your discussion will be visible to all community members once posted.
              Follow our
              <a href="/community/guidelines" className="ml-1 text-blue-600">
                community guidelines
              </a>
              .
            </p>
          </div>
        </div>

        {/* Submit Buttons */}
        <div className="flex gap-4">
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
          >
            Post Discussion
          </button>
          <button
            type="reset"
            className="rounded-lg border border-gray-300 px-6 py-3 font-semibold hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
        </div>

        {/* Guidelines Reminder */}
        <div className="rounded-lg border-l-4 border-yellow-500 bg-yellow-50 p-4 dark:bg-yellow-900">
          <h4 className="font-semibold text-yellow-800 dark:text-yellow-100">
            Please review our community guidelines
          </h4>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-yellow-700 dark:text-yellow-100">
            <li>Be respectful to all community members</li>
            <li>Stay on topic and use appropriate categories</li>
            <li>No spam or unsolicited advertising</li>
            <li>Do not share personal information or credentials</li>
            <li>Provide clear context and information</li>
          </ul>
        </div>
      </form>
    </div>
  );
}
