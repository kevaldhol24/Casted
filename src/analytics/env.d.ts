/** `<package version>-<poki|web>`, set by vite.config.ts. */
declare const __CASTED_BUILD__: string;

interface ImportMetaEnv {
  /** Layer B endpoint (the telemetry Worker's POST /e). Unset = records are built but never sent. */
  readonly VITE_TELEMETRY_URL?: string;
}
