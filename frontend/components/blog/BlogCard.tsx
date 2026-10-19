import Link from 'next/link';
import { BlogPost } from '@/lib/blog';

interface BlogCardProps {
  post: BlogPost;
}

export default function BlogCard({ post }: BlogCardProps) {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-6 transition-shadow hover:shadow-lg dark:border-gray-700 dark:bg-gray-800">
      {/* Category Badge */}
      <div className="mb-2">
        <Link
          href={`/blog?category=${post.category}`}
          className="inline-block rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-100"
        >
          {post.category}
        </Link>
      </div>

      {/* Title */}
      <h3 className="mb-2 text-2xl font-bold hover:text-blue-600">
        <Link href={`/blog/${post.slug}`}>{post.title}</Link>
      </h3>

      {/* Description */}
      <p className="mb-4 text-gray-600 dark:text-gray-400">
        {post.description}
      </p>

      {/* Meta Information */}
      <div className="mb-4 flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
        <span>{new Date(post.date).toLocaleDateString()}</span>
        <span>•</span>
        <span>{post.readingTime} min read</span>
        <span>•</span>
        <span>By {post.author}</span>
      </div>

      {/* Tags */}
      <div className="mb-4 flex flex-wrap gap-2">
        {post.tags.slice(0, 3).map((tag) => (
          <Link
            key={tag}
            href={`/blog?tag=${tag}`}
            className="text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            #{tag}
          </Link>
        ))}
        {post.tags.length > 3 && (
          <span className="text-sm text-gray-500">
            +{post.tags.length - 3} more
          </span>
        )}
      </div>

      {/* Read More Link */}
      <Link
        href={`/blog/${post.slug}`}
        className="inline-block font-semibold text-blue-600 hover:underline dark:text-blue-400"
      >
        Read More →
      </Link>
    </article>
  );
}
