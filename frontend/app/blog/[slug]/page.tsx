import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getPostBySlug, getAllPosts, getRelatedPosts } from '@/lib/blog';
import AuthorCard from '@/components/blog/AuthorCard';
import ShareButtons from '@/components/blog/ShareButtons';
import TableOfContents from '@/components/blog/TableOfContents';
import RelatedPosts from '@/components/blog/RelatedPosts';

interface BlogPostPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateMetadata(
  { params }: BlogPostPageProps
): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    return {};
  }

  return {
    title: `${post.title} | Blog | Stellar-Veriphy`,
    description: post.description,
    keywords: post.tags,
    authors: [{ name: post.author }],
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      publishedTime: post.date,
      authors: [post.author],
      tags: post.tags,
      images: post.coverImage
        ? [
            {
              url: post.coverImage,
              width: 1200,
              height: 630,
              alt: post.title,
            },
          ]
        : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
      images: post.coverImage ? [post.coverImage] : [],
    },
  };
}

export async function generateStaticParams() {
  return getAllPosts().map((post) => ({
    slug: post.slug,
  }));
}

export default async function BlogPostPage({
  params,
}: BlogPostPageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const relatedPosts = getRelatedPosts(slug, 3);

  return (
    <article className="container mx-auto px-4 py-12">
      {/* Breadcrumb */}
      <div className="mb-8 flex items-center gap-2 text-sm">
        <Link href="/blog" className="text-blue-600 hover:underline">
          Blog
        </Link>
        <span>/</span>
        <Link
          href={`/blog?category=${post.category}`}
          className="text-blue-600 hover:underline"
        >
          {post.category}
        </Link>
        <span>/</span>
        <span className="text-gray-600">{post.title}</span>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2">
          {/* Header */}
          <header className="mb-8 border-b pb-8">
            <h1 className="mb-4 text-4xl font-bold">{post.title}</h1>
            <p className="mb-4 text-xl text-gray-600 dark:text-gray-400">
              {post.description}
            </p>

            {/* Meta Information */}
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
              <span>{new Date(post.date).toLocaleDateString()}</span>
              <span>•</span>
              <span>{post.readingTime} min read</span>
              <span>•</span>
              <span>{post.author}</span>
            </div>
          </header>

          {/* Cover Image */}
          {post.coverImage && (
            <div className="mb-8">
              <img
                src={post.coverImage}
                alt={post.title}
                className="h-auto w-full rounded-lg"
              />
            </div>
          )}

          {/* Content */}
          <div
            className="prose prose-lg dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />

          {/* Tags */}
          <div className="mt-8 border-t pt-8">
            <div className="mb-4">
              <h3 className="mb-3 font-bold">Tags:</h3>
              <div className="flex flex-wrap gap-2">
                {post.tags.map((tagItem) => (
                  <Link
                    key={tagItem}
                    href={`/blog?tag=${tagItem}`}
                    className="rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-800 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-100"
                  >
                    {tagItem}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Share Buttons */}
          <ShareButtons post={post} />

          {/* Author Card */}
          <div className="mt-8 border-t pt-8">
            <AuthorCard author={post.author} />
          </div>
        </div>

        {/* Sidebar */}
        <aside className="lg:col-span-1">
          {/* Table of Contents */}
          <TableOfContents post={post} />

          {/* Share Buttons (Sticky) */}
          <div className="sticky top-4 mt-8">
            <div className="rounded-lg bg-gray-100 p-6 dark:bg-gray-800">
              <h3 className="mb-4 font-bold">Share this post</h3>
              <ShareButtons post={post} compact />
            </div>
          </div>
        </aside>
      </div>

      {/* Related Posts */}
      {relatedPosts.length > 0 && (
        <div className="mt-16 border-t pt-12">
          <RelatedPosts posts={relatedPosts} />
        </div>
      )}
    </article>
  );
}
