"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { RunDetail } from "@/lib/types";
import type { Load } from "./store";

/** Loads one run. Keeps the previous data on screen while a refresh (nonce bump) is in flight. */
export function useRunDetail(id: string | null, nonce = 0): Load<RunDetail> {
  const [s, setS] = useState<{ id: string | null; load: Load<RunDetail> }>({ id: null, load: { state: "loading" } });
  useEffect(() => {
    if (!id) return;
    let live = true;
    api
      .run(id)
      .then((data) => live && setS({ id, load: { state: "ok", data } }))
      .catch((e) => {
        if (!live) return;
        const status = e instanceof ApiError ? e.status : 0;
        const message =
          status === 404 ? "No run with this id exists on this server. Runs are kept in the server's database; this link may be from another deployment." : e instanceof ApiError && status !== 0 ? e.message : "Could not reach the Lineage API.";
        setS({ id, load: { state: "error", message, status } });
      });
    return () => {
      live = false;
    };
  }, [id, nonce]);
  if (!id || s.id !== id) return { state: "loading" };
  return s.load;
}
