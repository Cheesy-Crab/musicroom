import type { MemberInfo } from "../types";

interface MembersPanelProps {
  members: MemberInfo[];
  myId: string | null;
}

export default function MembersPanel({ members, myId }: MembersPanelProps) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <h2 className="text-sm font-semibold text-slate-400">
        在线成员 ({members.length})
      </h2>
      {members.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">暂无成员</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-2 rounded-lg px-2 py-1">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm">
                {m.avatarUrl ? (
                  <img
                    src={m.avatarUrl}
                    alt=""
                    className="h-7 w-7 rounded-full object-cover"
                  />
                ) : (
                  "👤"
                )}
              </div>
              <span className="min-w-0 flex-1 truncate text-sm">
                {m.nickname}
                {m.id === myId && (
                  <span className="ml-1 text-xs text-slate-500">(你)</span>
                )}
              </span>
              {m.role === "owner" && (
                <span className="shrink-0 rounded bg-amber-950 px-1.5 py-0.5 text-xs text-amber-300">
                  👑 房主
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
