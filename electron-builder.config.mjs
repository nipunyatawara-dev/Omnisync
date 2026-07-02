import pkg from "./package.json" with { type: "json" };

/** @type {import("electron-builder").Configuration} */
export default {
  appId: "com.omnisync.app",
  productName: "OmniSync",
  artifactName: `OmniSync v${pkg.omnisyncRelease}-mac-\${arch}.\${ext}`,
  directories: {
    output: "dist",
  },
  files: [
    "main.js",
    "preload.js",
    "appPort.js",
    "shellEnv.js",
    "package.json",
    "public/**/*",
    ".next/standalone/**/*",
  ],
  asarUnpack: [".next/standalone/**/*"],
  mac: {
    category: "public.app-category.developer-tools",
    icon: "build/icon.icns",
    identity: null,
    target: ["dmg"],
    extendInfo: {
      CFBundleShortVersionString: pkg.omnisyncRelease,
    },
  },
  win: {
    target: ["nsis"],
  },
  linux: {
    target: ["AppImage"],
  },
};
