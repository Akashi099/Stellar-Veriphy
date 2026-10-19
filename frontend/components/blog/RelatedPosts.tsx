import Link from 'next/link';
import { BlogPost } from '@/lib/blog';

interface RelatedPostsProps {
  posts: BlogPost[];
}

export default function RelatedPosts({ posts }: RelatedPostsProps) {
  if (posts.length === 0) {
    return null;
  }

  return (
    <div>
      <h2 className="mb-8 text-3xl font-bold">Related Posts</h2>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <article
            key={post.slug}
            className="rounded-lg border border-gray-200 bg-white p-6 transition-shadow hover:shadow-lg dark:border-gray-700 dark:bg-gray-800"
          >
            <h3 className="mb-2 text-xl font-bold">
              <Link
                href={`/blog/${post.slug}`}
                className="hover:text-blue-600"
              >
                {post.title}
              </Link>
            </h3>
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
              {post.description}
            </p>
            <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
              <span>{new Date(post.date).toLocaleDateString()}</span>
              <Link
                href={`/blog/${post.slug}`}
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                Read More →
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
