// fontkit ships no types; only openSync is used, and its results are read defensively.
declare module 'fontkit' {
  export function openSync(path: string): any;
}
