'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

interface CategoryFilterProps {
  categories: string[];
  currentCategory?: string;
}

export default function CategoryFilter({
  categories,
  currentCategory,
}: CategoryFilterProps) {
  const searchParams = useSearchParams();

  const getCategoryLink = (category: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('category', category);
    params.delete('page');
    return `/blog?${params.toString()}`;
  };

  const getAllPostsLink = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('category');
    params.delete('page');
    return `/blog?${params.toString()}`;
  };

  return (
    <div className="rounded-lg bg-gray-100 p-6 dark:bg-gray-800">
      <h3 className="mb-4 text-lg font-bold">Categories</h3>
      <ul className="space-y-2">
        <li>
          <Link
            href={getAllPostsLink()}
            className={`block rounded px-3 py-2 ${
              !currentCategory
                ? 'bg-blue-600 text-white'
                : 'text-gray-700 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            All Posts
          </Link>
        </li>
        {categories.map((category) => (
          <li key={category}>
            <Link
              href={getCategoryLink(category)}
              className={`block rounded px-3 py-2 ${
                currentCategory === category
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              {category}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
