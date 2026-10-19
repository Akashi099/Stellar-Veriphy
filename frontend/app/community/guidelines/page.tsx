import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Community Guidelines | Stellar-Veriphy',
  description:
    'Community guidelines and code of conduct for Stellar-Veriphy forum',
};

export default function GuidelinesPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-4xl font-bold">Community Guidelines</h1>

      <div className="prose prose-lg dark:prose-invert max-w-none space-y-8">
        <section>
          <h2 className="text-2xl font-bold">Our Community Values</h2>
          <p>
            Stellar-Veriphy is built on a foundation of respect, inclusivity, and
            collaboration. We welcome people from all backgrounds and experience levels.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold">Be Respectful</h2>
          <ul className="list-inside list-disc space-y-2">
            <li>Treat all community members with respect and courtesy</li>
            <li>Listen to different perspectives and opinions</li>
            <li>Disagree constructively and avoid personal attacks</li>
            <li>Respect cultural differences and be mindful of language</li>
            <li>Avoid harassment, discrimination, or bullying of any kind</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold">Stay On Topic</h2>
          <ul className="list-inside list-disc space-y-2">
            <li>Keep discussions relevant to the forum category</li>
            <li>Use the appropriate category for your topic</li>
            <li>Search for existing discussions before posting duplicates</li>
            <li>Include clear context and information in your posts</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold">No Spam or Advertising</h2>
          <ul className="list-inside list-disc space-y-2">
            <li>Do not post spam, unsolicited advertisements, or promotions</li>
            <li>Do not share malicious links or suspicious content</li>
            <li>Do not abuse the forum for personal gain</li>
            <li>Legitimate project announcements are welcome with moderation approval</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold">Security & Privacy</h2>
          <ul className="list-inside list-disc space-y-2">
            <li>Do not share personal information or credentials</li>
            <li>Do not share private keys or sensitive data</li>
            <li>Respect others' privacy</li>
            <li>Report security vulnerabilities responsibly</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold">Content Policies</h2>
          <ul className="list-inside list-disc space-y-2">
            <li>No explicit or inappropriate content</li>
            <li>No hate speech, discrimination, or violence</li>
            <li>No copyright infringement</li>
            <li>Provide attribution for content you share</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold">Enforcement</h2>
          <p>
            Moderators reserve the right to remove posts, lock threads, or ban users who
            violate these guidelines. Violations will result in warnings, temporary suspensions,
            or permanent bans depending on severity.
          </p>
          <p className="mt-4">
            For concerns or to report violations, please contact our moderation team at
            <strong> moderation@example.com</strong>.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold">Questions?</h2>
          <p>
            If you have questions about these guidelines, please reach out to our community
            managers or moderators. We're here to help create a positive environment for everyone.
          </p>
        </section>
      </div>
    </div>
  );
}
