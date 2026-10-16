import { useEffect, useState } from "react";
import { subscribeToPendingRequests, type JoinRequest } from "@/lib/team";

/** A team's pending join requests, live — for admins; always empty otherwise. */
export function usePendingRequests(teamId: string | null, isAdmin: boolean): JoinRequest[] {
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  useEffect(() => {
    setRequests([]);
    if (!teamId || !isAdmin) return;
    return subscribeToPendingRequests(teamId, setRequests);
  }, [teamId, isAdmin]);
  return requests;
}
