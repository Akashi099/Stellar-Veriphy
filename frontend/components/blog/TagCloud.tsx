'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

interface TagCloudProps {
  tags: string[];
  currentTag?: string;
}

export default function TagCloud({ tags, currentTag }: TagCloudProps) {
  const searchParams = useSearchParams();

  const getTagLink = (tag: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tag', tag);
    params.delete('page');
    return `/blog?${params.toString()}`;
  };

  const getTagSize = (index: number) => {
    const sizes = ['text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl'];
    return sizes[index % sizes.length];
  };

  return (
    <div className="rounded-lg bg-gray-100 p-6 dark:bg-gray-800">
      <h3 className="mb-4 text-lg font-bold">Tags</h3>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag, index) => (
          <Link
            key={tag}
            href={getTagLink(tag)}
            className={`rounded-full px-3 py-1 transition-colors ${getTagSize(
              index
            )} ${
              currentTag === tag
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-800 hover:bg-blue-100 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-blue-900'
            }`}
          >
            {tag}
          </Link>
        ))}
      </div>
    </div>
  );
}
