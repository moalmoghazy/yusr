/** Source files embedded as text by the build (see scripts/build.mjs, `?raw` suffix). */
declare module '*?raw' {
  const source: string;
  export default source;
}

/** Images inlined by the build as data: URLs (see scripts/build.mjs). */
declare module '*.webp' {
  const url: string;
  export default url;
}

declare module '*.png' {
  const url: string;
  export default url;
}

/** Stylesheets bundled by the build (side-effect imports in main.tsx). */
declare module '*.css';
