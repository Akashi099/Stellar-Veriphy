import { BlogPost } from '@/lib/blog';

interface TableOfContentsProps {
  post: BlogPost;
}

export default function TableOfContents({ post }: TableOfContentsProps) {
  // Extract headings from HTML content
  const headings: { id: string; text: string; level: number }[] = [];
  const headingRegex = /<h([2-3]) id="([^"]*)"[^>]*>([^<]*)<\/h[2-3]>/g;
  let match;

  while ((match = headingRegex.exec(post.content)) !== null) {
    headings.push({
      level: parseInt(match[1], 10),
      id: match[2],
      text: match[3],
    });
  }

  if (headings.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg bg-gray-100 p-6 dark:bg-gray-800">
      <h3 className="mb-4 font-bold">Table of Contents</h3>
      <nav>
        <ul className="space-y-2">
          {headings.map((heading) => (
            <li
              key={heading.id}
              style={{ marginLeft: `${(heading.level - 2) * 1.5}rem` }}
            >
              <a
                href={`#${heading.id}`}
                className="text-sm text-blue-600 hover:underline dark:text-blue-400"
              >
                {heading.text}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
