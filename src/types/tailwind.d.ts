// This file provides a type declaration for an internal Tailwind CSS utility.
// This prevents TypeScript errors when importing this utility in tailwind.config.ts.

declare module 'tailwindcss/lib/util/flattenColorPalette' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flattenColorPalette: (colors: any) => any;
  export default flattenColorPalette;
}
