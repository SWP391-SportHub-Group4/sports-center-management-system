/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Next.js 16's `next dev`/`next build` auto-generate frontend/AGENTS.md and
  // frontend/CLAUDE.md on every run, which dirties the working tree for no
  // reason on this project. Disabled — see https://nextjs.org/docs/app/api-reference/config/next-config-js
  agentRules: false,
};

export default nextConfig;
