import { useParams } from "react-router-dom";

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold">房间 {id}</h1>
      <p className="mt-2 text-slate-400">播放器与队列即将就绪</p>
    </div>
  );
}
