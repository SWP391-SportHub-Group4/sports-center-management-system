"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="stack">
      <h1>Cannot display page</h1>
      <p>Please try to download the contents.</p>
      <button className="button" onClick={reset}>
        Retry
      </button>
    </div>
  );
}
