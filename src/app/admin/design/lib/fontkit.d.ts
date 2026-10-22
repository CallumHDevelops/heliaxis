// fontkit 2.x ships no TypeScript types; the exporter only needs create() (everything else is `any`).
declare module 'fontkit' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function create(buffer: Uint8Array, postscriptName?: string): any;
}
