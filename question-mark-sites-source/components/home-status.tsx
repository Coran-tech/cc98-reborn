"use client";

import { RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function HomeStatus() {
  const router = useRouter();
  const [status, setStatus] = useState("检测中");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/health", { signal: controller.signal, cache: "no-store" })
      .then((response) => setStatus(response.ok ? "运行中" : "不可用"))
      .catch(() => { if (!controller.signal.aborted) setStatus("不可用"); });
    return () => controller.abort();
  }, [revision]);

  function refresh() {
    setStatus("检测中");
    setRevision((value) => value + 1);
    router.refresh();
  }

  return (
    <div className="floor-actions">
      <span className="service-status">服务状态 · {status}</span>
      <button className="refresh-button" type="button" onClick={refresh} title="刷新统计与状态" aria-label="刷新统计与状态">
        <RotateCw size={18} strokeWidth={2} />
      </button>
    </div>
  );
}
