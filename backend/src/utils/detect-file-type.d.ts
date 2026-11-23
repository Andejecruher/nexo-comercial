export function detectFileType(
  contents: Uint8Array,
): Promise<{ mime: string; ext: string } | undefined>;
