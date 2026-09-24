import Link from "next/link";
export default function NotFound() {
  return (
    <main className="loading">
      <h1>Page not found</h1>
      <Link className="button" href="/member">
        About the membership homepage
      </Link>
    </main>
  );
}
