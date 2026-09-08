import { useEffect } from "react";
import { useAuth } from "../store/auth";

export default function LobbyPage() {
  const { user, ready, init } = useAuth();

  useEffect(() => {
    init();
  }, [init]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold">在线点播室</h1>
      <p className="mt-2 text-slate-400">
        {ready ? (user ? `你好,${user.nickname}` : "未登录") : "初始化中…"}
      </p>
      <p className="mt-8 text-slate-500">大厅与房间列表即将就绪</p>
    </div>
  );
}
