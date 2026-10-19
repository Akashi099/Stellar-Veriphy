import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { remark } from 'remark';
import remarkHtml from 'remark-html';
import remarkPrism from 'remark-prism';

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  content: string;
  author: string;
  date: string;
  category: string;
  tags: string[];
  coverImage?: string;
  readingTime: number;
}

const postsDirectory = path.join(process.cwd(), 'content/blog');

// Ensure content directory exists
if (!fs.existsSync(postsDirectory)) {
  fs.mkdirSync(postsDirectory, { recursive: true });
}

export function getAllPosts(): BlogPost[] {
  if (!fs.existsSync(postsDirectory)) {
    return [];
  }

  const fileNames = fs.readdirSync(postsDirectory);
  const allPosts = fileNames
    .filter((fileName) => fileName.endsWith('.md') || fileName.endsWith('.mdx'))
    .map((fileName) => {
      const slug = fileName.replace(/\.(md|mdx)$/, '');
      return getPostBySlug(slug);
    });

  return allPosts.filter((post): post is BlogPost => post !== null);
}

export function getPostBySlug(slug: string): BlogPost | null {
  try {
    const fullPath = path.join(postsDirectory, `${slug}.md`);
    const mdxPath = path.join(postsDirectory, `${slug}.mdx`);

    let filePath: string;
    if (fs.existsSync(fullPath)) {
      filePath = fullPath;
    } else if (fs.existsSync(mdxPath)) {
      filePath = mdxPath;
    } else {
      return null;
    }

    const fileContents = fs.readFileSync(filePath, 'utf8');
    const { data, content } = matter(fileContents);

    // Calculate reading time (average 200 words per minute)
    const wordCount = content.split(/\s+/).length;
    const readingTime = Math.ceil(wordCount / 200);

    // Process markdown to HTML
    const processedContent = content; // Will be processed in component

    return {
      slug,
      title: data.title || '',
      description: data.description || '',
      content: processedContent,
      author: data.author || 'Anonymous',
      date: data.date || new Date().toISOString(),
      category: data.category || 'General',
      tags: data.tags || [],
      coverImage: data.coverImage,
      readingTime,
    };
  } catch (error) {
    console.error(`Error reading post ${slug}:`, error);
    return null;
  }
}

export function getAllCategories(): string[] {
  const posts = getAllPosts();
  const categories = new Set(posts.map((post) => post.category));
  return Array.from(categories).sort();
}

export function getAllTags(): string[] {
  const posts = getAllPosts();
  const tags = new Set<string>();
  posts.forEach((post) => {
    post.tags.forEach((tag) => tags.add(tag));
  });
  return Array.from(tags).sort();
}

export function getRelatedPosts(
  slug: string,
  limit: number = 3
): BlogPost[] {
  const currentPost = getPostBySlug(slug);
  if (!currentPost) {
    return [];
  }

  const allPosts = getAllPosts();
  const related = allPosts.filter(
    (post) =>
      post.slug !== slug &&
      (post.category === currentPost.category ||
        post.tags.some((tag) => currentPost.tags.includes(tag)))
  );

  return related.slice(0, limit);
}

export function searchPosts(query: string): BlogPost[] {
  const posts = getAllPosts();
  const queryLower = query.toLowerCase();

  return posts.filter(
    (post) =>
      post.title.toLowerCase().includes(queryLower) ||
      post.description.toLowerCase().includes(queryLower) ||
      post.content.toLowerCase().includes(queryLower) ||
      post.tags.some((tag) => tag.toLowerCase().includes(queryLower))
  );
}
