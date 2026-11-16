/**
 * GitHub Pages에 올리기 위해 정적 파일로 내보낸다(output: "export").
 * 주소가 https://uou7500.github.io/exhibition-news/ 이므로 basePath가 필요하다.
 * (나중에 나만의 도메인을 연결하면 PAGES_BASE_PATH를 비워 빌드한다.)
 * @type {import('next').NextConfig}
 */
const basePath = process.env.PAGES_BASE_PATH ?? "";
const nextConfig = {
  reactStrictMode: true,
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
};
export default nextConfig;
