// How the desktop app is made into something to download (spec §22, "The app as downloaded"):
// `npm run desktop:package` hands this to electron-builder after `desktop/build.mjs` has built
// desktop/out. The download is the Mac's; other systems run from the source.
export default {
  appId: "io.github.xingzhic-starlight.compass",
  productName: "Compass",
  copyright: "Copyright © 2026 Compass contributors",
  directories: { output: "desktop/release", buildResources: "desktop/icons" },
  // The app is what desktop/build.mjs built and nothing else: the main process is one file
  // and the page is already bundled, so no package from node_modules goes in.
  files: ["package.json", "desktop/out/**/*", "!node_modules/**/*"],
  asar: true,
  // Nothing in the app is compiled for the machine, so there is nothing to rebuild.
  npmRebuild: false,
  // No update is looked for and nothing is published from here (spec §22).
  publish: null,
  mac: {
    icon: "desktop/icons/appIcon.png",
    category: "public.app-category.productivity",
    // One file to download, for both kinds of Mac. No zip beside it: that is the form an
    // app's own updater wants, and this app has none.
    target: [{ target: "dmg", arch: ["universal"] }],
    artifactName: "Compass-${version}-mac.${ext}",
    // No Apple Developer certificate: the app is signed ad hoc, which an Apple Silicon Mac
    // needs before it will start a program at all. It is not notarized, so macOS asks the
    // person before the first open (README).
    identity: "-",
    hardenedRuntime: false,
    gatekeeperAssess: false,
  },
  dmg: { title: "Compass ${version}" },
  // The same package for a Linux machine, as a folder: what the desktop check starts where
  // there is no Mac (`COMPASS_DESKTOP_APP`).
  linux: { target: [{ target: "dir" }], executableName: "compass" },
};
