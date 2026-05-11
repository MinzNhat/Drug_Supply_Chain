"use client";

import { useAuth } from "@/lib/auth-context";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function DashboardRouter() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  
  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/auth/login");
    } else if (user) {
      if (user.role === "Manufacturer") router.push("/dashboard/manufacturer/products");
      else if (user.role === "Distributor") router.push("/dashboard/distributor/gateway");
      else if (user.role === "Regulator") router.push("/dashboard/authority/surveillance");
    }
  }, [user, isLoading, router]);

  return <div />;
}
