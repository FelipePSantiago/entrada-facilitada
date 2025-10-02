import 'next';

declare module "next" {
  export interface Metadata {
    title?: string;
    description?: string;
    openGraph?: {
        images?: string[];
    }
    [key: string]: unknown;
  }
}
