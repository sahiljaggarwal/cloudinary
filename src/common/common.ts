export function isTransformedImage(key: string): boolean {
  // Example transformed: 1753201182041_h500_w500_q90.webp
  const transformedPattern = /_\s*h\d+_w\d+_q\d+\.webp$/;
  return transformedPattern.test(key);
}

// export function parseKeyParams(key: string): {
//   originalKey: string;
//   height: string;
//   width: string;
//   quality: string;
// } {
//   const regex = /^(.+)_h(\d+)_w(\d+)_q(\d+)\.webp$/;
//   const match = key.match(regex);
//   if (!match) return { originalKey: '', height: '', width: '', quality: '' };
//   return {
//     originalKey: `${match[1]}.webp`,
//     height: match[2],
//     width: match[3],
//     quality: match[4],
//   };

export function parseKeyParams(key: string): {
  isTransformed: boolean;
  originalKey: string;
  height?: string;
  width?: string;
  quality?: string;
} {
  const regex = /^(.+)_h(\d+)_w(\d+)_q(\d+)\.webp$/;
  const match = key.match(regex);

  if (match) {
    return {
      isTransformed: true,
      originalKey: `${match[1]}.webp`,
      height: match[2],
      width: match[3],
      quality: match[4],
    };
  }

  return {
    isTransformed: false,
    originalKey: key, // original image key as-is
  };
}
