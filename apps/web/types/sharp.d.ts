declare module "sharp" {
  type SharpInput = string | Buffer | Uint8Array | ArrayBuffer;
  type SharpOptions = {
    failOn?: "none" | "truncated" | "error" | "warning";
    limitInputPixels?: number | boolean;
    sequentialRead?: boolean;
  };
  type Metadata = {
    width?: number;
    height?: number;
  };
  type ResizeOptions = {
    width?: number;
    height?: number;
    fit?: "cover" | "contain" | "fill" | "inside" | "outside";
    withoutEnlargement?: boolean;
  };
  type ExtractOptions = { left: number; top: number; width: number; height: number };
  type PngOptions = { compressionLevel?: number; adaptiveFiltering?: boolean };

  interface Sharp {
    rotate(angle?: number): Sharp;
    metadata(): Promise<Metadata>;
    resize(options: ResizeOptions): Sharp;
    flatten(options?: { background?: string }): Sharp;
    normalise(options?: { lower?: number; upper?: number }): Sharp;
    sharpen(options?: { sigma?: number }): Sharp;
    png(options?: PngOptions): Sharp;
    extract(options: ExtractOptions): Sharp;
    toBuffer(): Promise<Buffer>;
  }

  function sharp(input?: SharpInput, options?: SharpOptions): Sharp;
  export default sharp;
}
