"use client";

import { useEffect, useState } from "react";

type BackendStatus = "확인 중" | "ok" | "연결 안 됨";

export default function Home() {
  const [status, setStatus] = useState<BackendStatus>("확인 중");

  useEffect(() => {
    fetch("/api/health")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { status: string }) =>
        setStatus(data.status === "ok" ? "ok" : "연결 안 됨"),
      )
      .catch(() => setStatus("연결 안 됨"));
  }, []);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold">MAMA</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        백엔드: <span data-testid="backend-status">{status}</span>
      </p>
    </main>
  );
}
