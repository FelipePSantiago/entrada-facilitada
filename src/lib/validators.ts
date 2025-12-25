export const sanitizeInput = (input: string): string => {
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
};

export const validateFileSize = (file: File, maxSizeMB: number = 15): boolean => {
  return file.size <= maxSizeMB * 1024 * 1024;
};

export const validateMimeType = (file: File, allowedTypes: string[]): boolean => {
  return allowedTypes.includes(file.type);
};
