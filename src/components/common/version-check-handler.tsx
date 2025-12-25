
"use client";

import { useVersionCheck } from "@/hooks/use-version-check";

export const VersionCheckHandler = () => {
  useVersionCheck();
  return null;
};
