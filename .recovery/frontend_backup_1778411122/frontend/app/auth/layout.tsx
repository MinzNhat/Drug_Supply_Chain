// Auth group layout — suppresses the global NavBar for all /auth/* pages
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
