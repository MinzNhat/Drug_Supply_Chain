"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import PublicNavbar from "@/components/navbar-public";
import InternalNavbar from "@/components/navbar-internal";

/**
 * Renders no navbar on /auth/* pages.
 * Renders the compact internal navbar when the user is authenticated.
 * Renders the public navbar for unauthenticated browsing.
 */
export default function NavController() {
  const pathname = usePathname();
  const { user } = useAuth();

  // Auth pages: no navbar at all
  if (pathname.startsWith("/auth")) return null;

  // Logged-in: compact internal system navbar
  if (user) return <InternalNavbar />;

  // Public / unauthenticated: modern landing navbar
  return <PublicNavbar />;
}
