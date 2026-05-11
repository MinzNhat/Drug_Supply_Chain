"use client";

import React, { useEffect, useState } from "react";
import ComplaintsMap from "@/components/dashboard/authority/complaints/ComplaintsMap";
import { fetchApi } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function SurveillancePage() {
  const { t } = useI18n();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchApi("/regulator/surveillance")
      .then(res => {
        if (res.success) {
          // Only show reports not resolved
          setReports((res.data.items || []).filter((r: any) => r.status !== "RESOLVED"));
        } else {
          setError(res.message || "API error");
        }
      })
      .catch(e => setError(e.message || "API error"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="w-full h-[80vh] flex items-center justify-center">
      <div className="animate-pulse text-[12px] font-bold text-muted-foreground uppercase tracking-widest">{t('surv_load_map') || 'Loading Map...'}</div>
    </div>
  );
  if (error) return (
    <div className="w-full h-[80vh] flex items-center justify-center">
      <div className="text-rose-500 font-bold">{t('surv_load_fail') || error}</div>
    </div>
  );

  return (
    <div className="w-full h-[calc(100dvh-48px)] bg-background">
      <ComplaintsMap items={reports} />
    </div>
  );
}
