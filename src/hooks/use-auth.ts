// src/hooks/use-auth.ts
import { useAuth as useAuthContext } from "@/contexts/AuthContext";

export function useAuth() {
  return useAuthContext();
}