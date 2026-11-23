// Native dynamic import keeps the patched ESM detector compatible with this
// CommonJS application and Node 20. TypeScript must not rewrite it to require().
let detector;
exports.detectFileType = async function detectFileType(contents) {
  detector ??= import('file-type');
  const { fileTypeFromBuffer } = await detector;
  return fileTypeFromBuffer(contents);
};
