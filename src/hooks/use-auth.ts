// src/hooks/use-auth.ts
import { useAuth as useAuthContext } from "@/components/client-providers";

export function useAuth() {
  return useAuthContext();
}