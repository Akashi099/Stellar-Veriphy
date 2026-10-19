'use client';

import { BlogPost } from '@/lib/blog';

interface ShareButtonsProps {
  post: BlogPost;
  compact?: boolean;
}

export default function ShareButtons({ post, compact = false }: ShareButtonsProps) {
  const shareUrl = `https://example.com/blog/${post.slug}`;
  const encodedTitle = encodeURIComponent(post.title);
  const encodedUrl = encodeURIComponent(shareUrl);

  const shareLinks = [
    {
      name: 'Twitter',
      url: `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`,
      icon: '𝕏',
    },
    {
      name: 'LinkedIn',
      url: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      icon: 'in',
    },
    {
      name: 'Facebook',
      url: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      icon: 'f',
    },
    {
      name: 'Copy Link',
      url: '#',
      icon: '🔗',
      onClick: () => {
        navigator.clipboard.writeText(shareUrl);
        alert('Link copied to clipboard!');
      },
    },
  ];

  return (
    <div className={`my-8 flex items-center gap-2 ${compact ? 'flex-col' : 'flex-row'}`}>
      <span className="font-semibold">Share:</span>
      <div className="flex gap-2">
        {shareLinks.map((link) => (
          <a
            key={link.name}
            href={link.url}
            onClick={(e) => {
              if (link.onClick) {
                e.preventDefault();
                link.onClick();
              } else if (!link.url.startsWith('http')) {
                e.preventDefault();
              }
            }}
            target={link.url.startsWith('http') ? '_blank' : undefined}
            rel={link.url.startsWith('http') ? 'noopener noreferrer' : undefined}
            className="rounded-lg bg-gray-200 px-3 py-2 text-sm hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
            title={`Share on ${link.name}`}
          >
            {link.icon}
          </a>
        ))}
      </div>
    </div>
  );
}
