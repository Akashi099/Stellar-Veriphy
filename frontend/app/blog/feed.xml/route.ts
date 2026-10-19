import { getAllPosts } from '@/lib/blog';
import { NextResponse } from 'next/server';

export async function GET() {
  const posts = getAllPosts()
    .sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )
    .slice(0, 20);

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://example.com';

  const rssContent = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Stellar-Veriphy Blog</title>
    <link>${baseUrl}/blog</link>
    <description>Insights, tutorials, and updates about content verification and provenance on the Stellar blockchain.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${posts
      .map(
        (post) => `
    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${baseUrl}/blog/${post.slug}</link>
      <guid isPermaLink="true">${baseUrl}/blog/${post.slug}</guid>
      <description>${escapeXml(post.description)}</description>
      <author>${escapeXml(post.author)}</author>
      <category>${escapeXml(post.category)}</category>
      ${post.tags.map((tag) => `<category>${escapeXml(tag)}</category>`).join('')}
      <pubDate>${new Date(post.date).toUTCString()}</pubDate>
      <content:encoded><![CDATA[
        ${post.content}
      ]]></content:encoded>
    </item>`
      )
      .join('')}
  </channel>
</rss>`;

  return new NextResponse(rssContent, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
