import { Metadata } from 'next';
import Link from 'next/link';
import { getAllPosts, getAllCategories, getAllTags } from '@/lib/blog';
import BlogCard from '@/components/blog/BlogCard';
import SearchBar from '@/components/blog/SearchBar';
import CategoryFilter from '@/components/blog/CategoryFilter';
import TagCloud from '@/components/blog/TagCloud';

export const metadata: Metadata = {
  title: 'Blog | Stellar-Veriphy',
  description:
    'Insights, tutorials, and updates about content verification and provenance on the Stellar blockchain.',
  openGraph: {
    title: 'Blog | Stellar-Veriphy',
    description:
      'Insights, tutorials, and updates about content verification and provenance on the Stellar blockchain.',
    type: 'website',
    url: 'https://example.com/blog',
  },
};

interface BlogPageProps {
  searchParams: Promise<{
    category?: string;
    tag?: string;
    search?: string;
    page?: string;
  }>;
}

const POSTS_PER_PAGE = 10;

export default async function BlogPage({ searchParams }: BlogPageProps) {
  const params = await searchParams;
  const { category, tag, search, page = '1' } = params;
  const currentPage = parseInt(page, 10) || 1;

  let posts = getAllPosts();

  // Filter by category
  if (category) {
    posts = posts.filter((post) => post.category === category);
  }

  // Filter by tag
  if (tag) {
    posts = posts.filter((post) => post.tags.includes(tag));
  }

  // Filter by search query
  if (search) {
    const searchLower = search.toLowerCase();
    posts = posts.filter(
      (post) =>
        post.title.toLowerCase().includes(searchLower) ||
        post.description.toLowerCase().includes(searchLower) ||
        post.content.toLowerCase().includes(searchLower)
    );
  }

  // Sort by date (newest first)
  posts.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  // Pagination
  const totalPages = Math.ceil(posts.length / POSTS_PER_PAGE);
  const startIndex = (currentPage - 1) * POSTS_PER_PAGE;
  const endIndex = startIndex + POSTS_PER_PAGE;
  const paginatedPosts = posts.slice(startIndex, endIndex);

  const categories = getAllCategories();
  const tags = getAllTags();

  return (
    <div className="container mx-auto px-4 py-12">
      {/* Header */}
      <div className="mb-12">
        <h1 className="mb-4 text-4xl font-bold">Blog</h1>
        <p className="text-xl text-gray-600 dark:text-gray-400">
          Explore insights, tutorials, and updates about content verification
          and provenance on the Stellar blockchain.
        </p>
      </div>

      {/* Search Bar */}
      <SearchBar />

      <div className="grid grid-cols-1 gap-8 md:grid-cols-3 lg:grid-cols-4">
        {/* Main Content */}
        <div className="md:col-span-2 lg:col-span-3">
          {paginatedPosts.length > 0 ? (
            <>
              <div className="mb-8 grid gap-6">
                {paginatedPosts.map((post) => (
                  <BlogCard key={post.slug} post={post} />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                  {currentPage > 1 && (
                    <Link
                      href={`/blog?page=${currentPage - 1}${
                        category ? `&category=${category}` : ''
                      }${tag ? `&tag=${tag}` : ''}${
                        search ? `&search=${search}` : ''
                      }`}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                    >
                      Previous
                    </Link>
                  )}

                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                    (pageNum) => (
                      <Link
                        key={pageNum}
                        href={`/blog?page=${pageNum}${
                          category ? `&category=${category}` : ''
                        }${tag ? `&tag=${tag}` : ''}${
                          search ? `&search=${search}` : ''
                        }`}
                        className={`rounded-lg px-3 py-2 ${
                          pageNum === currentPage
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 dark:bg-gray-700'
                        }`}
                      >
                        {pageNum}
                      </Link>
                    )
                  )}

                  {currentPage < totalPages && (
                    <Link
                      href={`/blog?page=${currentPage + 1}${
                        category ? `&category=${category}` : ''
                      }${tag ? `&tag=${tag}` : ''}${
                        search ? `&search=${search}` : ''
                      }`}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                    >
                      Next
                    </Link>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="rounded-lg bg-gray-100 p-8 text-center dark:bg-gray-800">
              <p className="text-gray-600 dark:text-gray-400">
                No posts found matching your criteria. Try a different search
                or filter.
              </p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Categories */}
          <CategoryFilter categories={categories} currentCategory={category} />

          {/* Tag Cloud */}
          <TagCloud tags={tags} currentTag={tag} />

          {/* Latest Posts */}
          <div className="rounded-lg bg-gray-100 p-6 dark:bg-gray-800">
            <h3 className="mb-4 text-lg font-bold">Latest Posts</h3>
            <ul className="space-y-2">
              {getAllPosts()
                .sort(
                  (a, b) =>
                    new Date(b.date).getTime() - new Date(a.date).getTime()
                )
                .slice(0, 5)
                .map((post) => (
                  <li key={post.slug}>
                    <Link
                      href={`/blog/${post.slug}`}
                      className="text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {post.title}
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
