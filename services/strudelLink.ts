const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
};

export const encodeStrudelCode = (code: string): string =>
  bytesToBase64(new TextEncoder().encode(code));

export const createStrudelLink = (code: string): string =>
  `https://strudel.cc/#${encodeStrudelCode(code)}`;
