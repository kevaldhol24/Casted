/**
 * The CrazyGames build is flat: CrazyGames' uploader dropped every folder and served all files from the build root,
 * so assets/, models/ and masks/ were 404 (stuck loading screen). That build puts every file at the root
 * (vite.config.ts), and asset paths such as "models/w1/bird.glb" resolve to their file name. File names are unique
 * across folders; tools/zip-build.mjs fails the build if two collide.
 */
const FLAT = import.meta.env.PROD && import.meta.env.MODE === 'crazygames';

/** URL for a site-relative asset path ("models/w1/bird.glb", "masks/w1-01.png"). */
export function assetUrl(path: string): string {
  return import.meta.env.BASE_URL + (FLAT ? path.slice(path.lastIndexOf('/') + 1) : path);
}
