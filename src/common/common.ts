export function isTransformedImage(key: string): boolean {
  // Example transformed: 1753201182041_h500_w500_q90.webp
  const transformedPattern = /_\s*h\d+_w\d+_q\d+\.webp$/;
  return transformedPattern.test(key);
}
