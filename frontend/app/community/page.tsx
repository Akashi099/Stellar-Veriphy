import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Community | Stellar-Veriphy',
  description:
    'Join our community to discuss, ask questions, and share ideas about content verification on Stellar.',
  openGraph: {
    title: 'Community | Stellar-Veriphy',
    description:
      'Join our community to discuss, ask questions, and share ideas about content verification on Stellar.',
    type: 'website',
    url: 'https://example.com/community',
  },
};

const categories = [
  {
    id: 'general',
    name: 'General Discussion',
    description: 'General topics and off-topic discussions',
    icon: '💬',
    threadCount: 24,
    lastActivity: '2 hours ago',
  },
  {
    id: 'help',
    name: 'Help & Support',
    description: 'Get help with verification and technical issues',
    icon: '🆘',
    threadCount: 42,
    lastActivity: '30 minutes ago',
  },
  {
    id: 'tutorials',
    name: 'Tutorials & Guides',
    description: 'Share and discuss tutorials and guides',
    icon: '📚',
    threadCount: 18,
    lastActivity: '1 day ago',
  },
  {
    id: 'announcements',
    name: 'Announcements',
    description: 'Official announcements and updates',
    icon: '📢',
    threadCount: 12,
    lastActivity: '3 days ago',
  },
  {
    id: 'feature-requests',
    name: 'Feature Requests',
    description: 'Suggest and discuss new features',
    icon: '💡',
    threadCount: 35,
    lastActivity: '1 hour ago',
  },
  {
    id: 'showcase',
    name: 'Showcase',
    description: 'Show off your verified content and projects',
    icon: '⭐',
    threadCount: 28,
    lastActivity: '4 hours ago',
  },
];

export default function CommunityPage() {
  return (
    <div className="container mx-auto px-4 py-12">
      {/* Header */}
      <div className="mb-12">
        <h1 className="mb-4 text-4xl font-bold">Community Forum</h1>
        <p className="mb-6 text-xl text-gray-600 dark:text-gray-400">
          Connect with other users, ask questions, and share your experiences
          with Stellar-Veriphy.
        </p>

        <div className="flex flex-col gap-4 sm:flex-row">
          <Link
            href="/community/new-thread"
            className="inline-block rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700"
          >
            Start New Discussion
          </Link>
          <Link
            href="/community/guidelines"
            className="inline-block rounded-lg border border-gray-300 px-6 py-3 text-gray-900 hover:bg-gray-100 dark:border-gray-600 dark:text-white dark:hover:bg-gray-800"
          >
            Community Guidelines
          </Link>
        </div>
      </div>

      {/* Categories Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => (
          <Link
            key={category.id}
            href={`/community/${category.id}`}
            className="rounded-lg border border-gray-200 bg-white p-6 transition-all hover:border-blue-400 hover:shadow-lg dark:border-gray-700 dark:bg-gray-800"
          >
            <div className="mb-2 text-4xl">{category.icon}</div>
            <h3 className="mb-2 text-xl font-bold">{category.name}</h3>
            <p className="mb-4 text-gray-600 dark:text-gray-400">
              {category.description}
            </p>
            <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
              <span>{category.threadCount} threads</span>
              <span>Active {category.lastActivity}</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Community Stats */}
      <div className="mt-12 rounded-lg bg-blue-50 p-8 dark:bg-blue-900">
        <h2 className="mb-6 text-2xl font-bold">Community Statistics</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <div className="text-3xl font-bold text-blue-600">1.2K</div>
            <p className="text-gray-600 dark:text-gray-400">Active Members</p>
          </div>
          <div>
            <div className="text-3xl font-bold text-blue-600">3.8K</div>
            <p className="text-gray-600 dark:text-gray-400">Total Discussions</p>
          </div>
          <div>
            <div className="text-3xl font-bold text-blue-600">12.5K</div>
            <p className="text-gray-600 dark:text-gray-400">Messages Posted</p>
          </div>
          <div>
            <div className="text-3xl font-bold text-blue-600">847</div>
            <p className="text-gray-600 dark:text-gray-400">This Month</p>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="mt-12">
        <h2 className="mb-6 text-2xl font-bold">Recent Activity</h2>
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="flex items-start gap-4">
                <div className="mt-1 text-2xl">👤</div>
                <div className="flex-1">
                  <h4 className="font-semibold">
                    <Link href="#" className="text-blue-600 hover:underline">
                      How to verify batch content?
                    </Link>
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Posted in Help & Support • 2 hours ago
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">4</div>
                  <p className="text-xs text-gray-500">replies</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
