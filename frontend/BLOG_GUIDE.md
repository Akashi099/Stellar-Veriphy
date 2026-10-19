# Blog Platform Guide

This guide explains how to use and manage the Stellar-Veriphy blog platform.

## Overview

The blog platform provides:
- Content publishing with Markdown/MDX support
- Categorization and tagging
- Author profiles
- RSS feed generation
- SEO optimization
- Search functionality

## Adding New Blog Posts

### File Structure

Blog posts are stored in `content/blog/` directory. Each post is a markdown file with the following naming convention:

```
content/blog/post-slug.md
```

### Front Matter

Each blog post must include YAML front matter at the top:

```yaml
---
title: "Your Post Title"
description: "A brief description of your post"
author: "Author Name"
date: "2024-08-15"
category: "Category Name"
tags: ["tag1", "tag2", "tag3"]
coverImage: "https://example.com/image.jpg"
---
```

### Fields

- **title** (required): Post title
- **description** (required): Brief summary for previews
- **author** (required): Author name
- **date** (required): Publication date (YYYY-MM-DD format)
- **category** (required): Single category for post
- **tags** (required): Array of tags for discoverability
- **coverImage** (optional): Featured image URL

### Content

After the front matter, write your content in Markdown:

```markdown
# Heading 2

Paragraph text here.

## Heading 3

- Bullet point
- Another point

### Code Block

\`\`\`typescript
const example = "code";
\`\`\`
```

## Reading Time Calculation

Reading time is automatically calculated based on content (approximately 200 words per minute).

## Categories

Common categories:
- `Tutorials` - How-to guides
- `Technical` - Deep technical dives
- `Updates` - News and releases
- `General` - General interest posts

## Tags

Tags should be lowercase and descriptive. Examples:
- `verification`
- `blockchain`
- `stellar`
- `provenance`
- `security`
- `getting-started`

## Features

### Search

Posts are searchable by:
- Title
- Description
- Content
- Tags

### Filtering

Posts can be filtered by:
- Category (sidebar)
- Tags (tag cloud)
- Search query

### RSS Feed

An RSS feed is generated automatically at `/blog/feed.xml`

### SEO

All pages include:
- Meta descriptions
- Open Graph tags
- Twitter Card tags
- Structured data
- Sitemap inclusion

## Component Usage

### BlogCard

Shows a preview of a blog post:

```tsx
<BlogCard post={post} />
```

### SearchBar

Search functionality:

```tsx
<SearchBar />
```

### CategoryFilter

Filter posts by category:

```tsx
<CategoryFilter categories={categories} currentCategory={category} />
```

### TagCloud

Visual representation of all tags:

```tsx
<TagCloud tags={tags} currentTag={tag} />
```

### ShareButtons

Share post on social media:

```tsx
<ShareButtons post={post} />
```

### AuthorCard

Display author information:

```tsx
<AuthorCard author={post.author} />
```

### RelatedPosts

Show related blog posts:

```tsx
<RelatedPosts posts={relatedPosts} />
```

## Routes

- `/blog` - Blog listing page
- `/blog/[slug]` - Individual blog post
- `/blog/feed.xml` - RSS feed

## Best Practices

1. **Meaningful Titles**: Make titles clear and descriptive
2. **Good Descriptions**: Write compelling summaries (50-100 characters)
3. **Relevant Tags**: Use 3-5 tags per post
4. **Cover Images**: Use high-quality images (1200x630px recommended)
5. **Regular Updates**: Publish content consistently
6. **Links**: Link to related posts and resources
7. **Images**: Include images to break up text
8. **Code Blocks**: Use syntax highlighting for code

## File Locations

- Blog posts: `frontend/content/blog/*.md`
- Blog pages: `frontend/app/blog/`
- Blog components: `frontend/components/blog/`
- Blog utilities: `frontend/lib/blog.ts`

## Troubleshooting

### Post Not Appearing

- Check file is in `content/blog/` directory
- Verify front matter syntax (YAML)
- Ensure date is in YYYY-MM-DD format
- Check file extension is `.md` or `.mdx`

### RSS Feed Not Updating

- Rebuild the application: `pnpm build`
- Clear Next.js cache: `rm -rf .next`
- Verify post files are readable

### Images Not Loading

- Use full URLs (not relative paths)
- Ensure URLs are publicly accessible
- Check URL format in front matter

## Future Enhancements

- Comment system
- Social sharing analytics
- Post recommendations
- Author pages
- Newsletter subscription
- Advanced search filters

## Related Documentation

- [Development Workflow](../DEVELOPMENT_WORKFLOW.md)
- [Component Architecture](./COMPONENT_ARCHITECTURE.md)
