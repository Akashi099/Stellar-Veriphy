interface AuthorCardProps {
  author: string;
}

export default function AuthorCard({ author }: AuthorCardProps) {
  // This could be expanded to fetch author data from a database
  return (
    <div className="rounded-lg bg-blue-50 p-6 dark:bg-blue-900">
      <h3 className="mb-2 text-lg font-bold">About the Author</h3>
      <p className="text-gray-700 dark:text-gray-300">
        <strong>{author}</strong> is a passionate developer and contributor to
        Stellar-Veriphy. They specialize in blockchain development and content
        verification.
      </p>
      <div className="mt-4 flex gap-2">
        <a
          href="#"
          className="inline-block rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          View Profile
        </a>
      </div>
    </div>
  );
}
