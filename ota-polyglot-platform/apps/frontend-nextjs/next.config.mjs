/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // @grpc/grpc-js and @grpc/proto-loader (loaded from lib/grpc-client.ts,
  // which reads shared/protos/ota.proto from disk at request time) need to
  // stay real Node modules rather than being bundled — this also makes
  // Next's `output: "standalone"` file tracing copy them into
  // .next/standalone/node_modules correctly.
  serverExternalPackages: ["@grpc/grpc-js", "@grpc/proto-loader"],
  images: {
    // next/image refuses SVG sources by default (they can carry scripts).
    // Needed for the per-tenant branding logos under public/branding/,
    // which are local, trusted, hand-authored placeholder assets — the CSP
    // below is Next's own documented safe default for this opt-in.
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};
export default nextConfig;
