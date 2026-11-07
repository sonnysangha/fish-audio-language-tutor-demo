import { UserRound } from "lucide-react";
import type { TutorId } from "@/lib/types";

export function TutorPortrait({ tutor, small = false }: { tutor: TutorId; small?: boolean }) {
  return (
    <span className={"portrait portrait-" + tutor + (small ? " portrait-small" : "")} aria-hidden="true">
      <svg viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="50" fill={tutor === "maya" ? "#ead6c8" : "#dce2d8"} />
        {tutor === "maya" ? (
          <>
            <path d="M27 52C24 26 37 17 51 18c17 0 25 12 25 34v24H26l1-24Z" fill="#50382e" />
            <path d="M18 100c2-21 15-32 32-32s30 11 32 32" fill="#b9604e" />
            <path d="M43 62h14v15c-3 6-11 6-14 0V62Z" fill="#c58d70" />
            <path d="M34 39c0-15 32-16 33 0v13c-1 13-9 20-17 20s-16-8-16-20V39Z" fill="#d6a180" />
            <path d="M31 42c12 0 20-8 23-15 2 8 8 12 16 15-1-18-10-22-20-22S32 25 31 42Z" fill="#50382e" />
          </>
        ) : (
          <>
            <path d="M18 100c2-21 15-32 32-32s30 11 32 32" fill="#607868" />
            <path d="M43 62h14v15c-3 6-11 6-14 0V62Z" fill="#b58568" />
            <path d="M34 36c0-14 32-14 33 0v16c-1 13-9 20-17 20s-16-8-16-20V36Z" fill="#cc9b7a" />
            <path d="M30 40c-5-10 1-18 9-18 1-9 14-11 19-5 13-2 18 13 10 24l-4-10c-9 7-16-1-22 3-4 2-6 5-8 10l-4-4Z" fill="#3b3930" />
          </>
        )}
        <path d="M42 47v3m16-3v3" stroke="#49382e" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M45 59c3 3 7 3 10 0" stroke="#9a5b49" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function UserAvatar() {
  return <span className="user-avatar" aria-hidden="true"><UserRound size={20} /></span>;
}
