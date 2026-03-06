"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export default function AuthButton() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div className="h-8 w-8 rounded-full bg-zinc-800 animate-pulse" />;
  }

  if (!user) {
    return (
      <Link
        href="/auth/signin"
        className="text-sm px-4 py-2 bg-white text-black rounded-lg hover:bg-zinc-200 transition-colors font-medium"
      >
        Sign In
      </Link>
    );
  }

  const avatar = user.user_metadata?.avatar_url;
  const name = user.user_metadata?.full_name || user.email;
  const initial = (name || "?")[0].toUpperCase();

  return (
    <div className="flex items-center gap-3">
      <Link
        href="/profile"
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        {avatar ? (
          <img
            src={avatar}
            alt=""
            className="h-8 w-8 rounded-full border border-zinc-700"
          />
        ) : (
          <div className="h-8 w-8 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-medium text-zinc-300">
            {initial}
          </div>
        )}
        <span className="text-sm text-zinc-300 hidden sm:inline">
          {name?.split(" ")[0]}
        </span>
      </Link>
      <button
        onClick={async () => {
          await supabase.auth.signOut();
          router.push("/");
          router.refresh();
        }}
        className="text-xs px-2 py-1 text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        Sign Out
      </button>
    </div>
  );
}
