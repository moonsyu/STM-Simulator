// Builds the Windows x64 portable EXE (npm run build:package, after scripts/clean-build.cjs).
//
// The portable target packs the unpacked app (about 390 MB) with 7-Zip, and that step was almost all of the package
// job's build time. Measured on the same machine at 1.46.2: electron-builder's default level 145 s / 115.6 MB,
// level 5 63 s / 117.6 MB (+1.7 %), level 3 17 s / 132.2 MB (+14 %), level 1 13 s / 140.1 MB (+21 %). Level 5 keeps the
// download size and takes less than half the time. ELECTRON_BUILDER_COMPRESSION_LEVEL set by the caller wins.
const {build, Platform, Arch} = require('electron-builder');

process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL ||= '5';
build({targets: Platform.WINDOWS.createTarget('portable', Arch.x64), publish: 'never'}).catch(error => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
