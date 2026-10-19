import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

interface CategoryPageProps {
  params: Promise<{
    category: string;
  }>;
  searchParams: Promise<{
    sort?: string;
    page?: string;
  }>;
}

const categoryMetadata: Record<
  string,
  { name: string; description: string; icon: string }
> = {
  general: {
    name: 'General Discussion',
    description: 'General topics and off-topic discussions',
    icon: '💬',
  },
  help: {
    name: 'Help & Support',
    description: 'Get help with verification and technical issues',
    icon: '🆘',
  },
  tutorials: {
    name: 'Tutorials & Guides',
    description: 'Share and discuss tutorials and guides',
    icon: '📚',
  },
  announcements: {
    name: 'Announcements',
    description: 'Official announcements and updates',
    icon: '📢',
  },
  'feature-requests': {
    name: 'Feature Requests',
    description: 'Suggest and discuss new features',
    icon: '💡',
  },
  showcase: {
    name: 'Showcase',
    description: 'Show off your verified content and projects',
    icon: '⭐',
  },
};

export async function generateMetadata(
  { params }: CategoryPageProps
): Promise<Metadata> {
  const { category } = await params;
  const meta = categoryMetadata[category];

  if (!meta) {
    return {};
  }

  return {
    title: `${meta.name} | Community | Stellar-Veriphy`,
    description: meta.description,
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: CategoryPageProps) {
  const { category } = await params;
  const { sort = 'latest', page = '1' } = await searchParams;

  const meta = categoryMetadata[category];
  if (!meta) {
    notFound();
  }

  // Sample threads data (would come from database in production)
  const threads = [
    {
      id: 1,
      title: 'How to verify large files?',
      author: 'user123',
      category: category,
      createdAt: '2 hours ago',
      lastReply: '1 hour ago',
      replies: 8,
      views: 142,
      isPinned: false,
      isResolved: false,
      tags: ['verification', 'files'],
    },
    {
      id: 2,
      title: 'Best practices for content verification',
      author: 'dev_team',
      category: category,
      createdAt: '1 day ago',
      lastReply: '30 minutes ago',
      replies: 24,
      views: 456,
      isPinned: true,
      isResolved: false,
      tags: ['best-practices', 'tutorial'],
    },
    {
      id: 3,
      title: 'Integration with GitHub',
      author: 'integrator',
      category: category,
      createdAt: '3 days ago',
      lastReply: '2 days ago',
      replies: 5,
      views: 89,
      isPinned: false,
      isResolved: true,
      tags: ['integration', 'github'],
    },
  ];

  return (
    <div className="container mx-auto px-4 py-12">
      {/* Header */}
      <div className="mb-8">
        <div className="mb-4 text-4xl">{meta.icon}</div>
        <h1 className="mb-2 text-4xl font-bold">{meta.name}</h1>
        <p className="mb-6 text-lg text-gray-600 dark:text-gray-400">
          {meta.description}
        </p>

        <div className="flex flex-col gap-4 sm:flex-row">
          <Link
            href="/community/new-thread"
            className="inline-block rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
          >
            Start Discussion
          </Link>
        </div>
      </div>

      {/* Sorting Options */}
      <div className="mb-6 flex items-center gap-4">
        <span className="text-gray-600 dark:text-gray-400">Sort by:</span>
        <div className="flex gap-2">
          <Link
            href={`/community/${category}?sort=latest`}
            className={`rounded px-3 py-1 ${
              sort === 'latest'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700'
            }`}
          >
            Latest
          </Link>
          <Link
            href={`/community/${category}?sort=popular`}
            className={`rounded px-3 py-1 ${
              sort === 'popular'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700'
            }`}
          >
            Popular
          </Link>
          <Link
            href={`/community/${category}?sort=active`}
            className={`rounded px-3 py-1 ${
              sort === 'active'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700'
            }`}
          >
            Active
          </Link>
        </div>
      </div>

      {/* Threads List */}
      <div className="space-y-4">
        {threads.map((thread) => (
          <Link
            key={thread.id}
            href={`/community/thread/${thread.id}`}
            className="block rounded-lg border border-gray-200 bg-white p-4 transition-all hover:border-blue-400 hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
          >
            <div className="flex gap-4">
              {/* Status */}
              <div className="flex flex-col items-center gap-2">
                <div className="text-2xl">
                  {thread.isResolved ? '✓' : '💭'}
                </div>
              </div>

              {/* Main Content */}
              <div className="flex-1">
                <div className="mb-2 flex items-center gap-2">
                  {thread.isPinned && (
                    <span className="inline-block rounded bg-yellow-100 px-2 py-1 text-xs font-semibold text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100">
                      PINNED
                    </span>
                  )}
                  {thread.isResolved && (
                    <span className="inline-block rounded bg-green-100 px-2 py-1 text-xs font-semibold text-green-800 dark:bg-green-900 dark:text-green-100">
                      RESOLVED
                    </span>
                  )}
                </div>
                <h3 className="mb-2 text-lg font-bold hover:text-blue-600">
                  {thread.title}
                </h3>
                <div className="mb-2 flex flex-wrap gap-2">
                  {thread.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-block rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-100"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Started by <strong>{thread.author}</strong> • {thread.createdAt}
                </p>
              </div>

              {/* Stats */}
              <div className="flex min-w-fit items-center gap-6 text-right">
                <div>
                  <div className="font-bold">{thread.replies}</div>
                  <p className="text-xs text-gray-500">replies</p>
                </div>
                <div>
                  <div className="font-bold">{thread.views}</div>
                  <p className="text-xs text-gray-500">views</p>
                </div>
                <div className="text-sm">
                  <div>Last reply</div>
                  <p className="text-xs text-gray-500">{thread.lastReply}</p>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Pagination */}
      <div className="mt-8 flex items-center justify-center gap-2">
        {parseInt(page, 10) > 1 && (
          <Link
            href={`/community/${category}?page=${parseInt(page, 10) - 1}&sort=${sort}`}
            className="rounded bg-gray-200 px-3 py-2 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
          >
            Previous
          </Link>
        )}
        <span className="px-3 py-2">Page {page}</span>
        <Link
          href={`/community/${category}?page=${parseInt(page, 10) + 1}&sort=${sort}`}
          className="rounded bg-gray-200 px-3 py-2 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
        >
          Next
        </Link>
      </div>
    </div>
  );
}
