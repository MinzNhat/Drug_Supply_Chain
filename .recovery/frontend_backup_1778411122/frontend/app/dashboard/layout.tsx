"use client";

import { useAuth } from "@/lib/auth-context";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // If auth state is resolved and no user is found, force redirect to login
    if (!isLoading && !user) {
      router.push("/auth/login");
    }
  }, [user, isLoading, router]);

  // Prevent flicking content before auth state is determined
  if (isLoading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center gap-3 bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary/60" />
        <span className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.3em]">
          Authenticating
        </span>
      </div>
    );
  }

  // If not logged in, render nothing while redirecting
  if (!user) {
    return null;
  }

  return <>{children}</>;
}
