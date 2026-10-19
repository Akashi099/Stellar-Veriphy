/**
 * Source Map Upload Utility
 *
 * This script should be run as part of the build process to upload
 * source maps to the error tracking service
 *
 * Usage: node lib/error-tracking/source-map-upload.js
 */

const fs = require("fs");
const path = require("path");
const glob = require("glob");

const BUILD_DIR = ".next/static";
const ERROR_TRACKING_API = process.env.ERROR_TRACKING_API || "http://localhost:3000/api/sourcemaps";
const RELEASE_VERSION = process.env.RELEASE_VERSION || require("../../package.json").version;

async function uploadSourceMaps() {
  console.log("📤 Uploading source maps...\n");

  try {
    // Find all .map files
    const mapFiles = glob.sync(`${BUILD_DIR}/**/*.map`, {
      ignore: `${BUILD_DIR}/chunks/_buildManifest.*.map`,
    });

    if (mapFiles.length === 0) {
      console.log("⚠️  No source maps found");
      return;
    }

    console.log(`Found ${mapFiles.length} source map files\n`);

    let successCount = 0;
    let errorCount = 0;

    for (const mapFile of mapFiles) {
      const jsFile = mapFile.replace(".map", "");
      const relativeUrl = jsFile.replace(BUILD_DIR, "/_next/static");

      try {
        const mapContent = fs.readFileSync(mapFile, "utf-8");
        const jsContent = fs.readFileSync(jsFile, "utf-8");

        const formData = new FormData();
        formData.append("release", RELEASE_VERSION);
        formData.append("url", relativeUrl);
        formData.append("sourceMap", new Blob([mapContent]));
        formData.append("source", new Blob([jsContent]));

        const response = await fetch(ERROR_TRACKING_API, {
          method: "POST",
          body: formData,
          headers: {
            Authorization: `Bearer ${process.env.ERROR_TRACKING_TOKEN || ""}`,
          },
        });

        if (response.ok) {
          console.log(`✓ ${path.basename(mapFile)}`);
          successCount++;
        } else {
          console.error(`✗ ${path.basename(mapFile)}: ${response.statusText}`);
          errorCount++;
        }
      } catch (error) {
        console.error(`✗ ${path.basename(mapFile)}: ${error.message}`);
        errorCount++;
      }
    }

    console.log(`\n📊 Results: ${successCount} uploaded, ${errorCount} failed`);

    if (errorCount > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Source map upload failed:", error.message);
    process.exit(1);
  }
}

// Only run if file is executed directly
if (require.main === module) {
  uploadSourceMaps();
}

module.exports = { uploadSourceMaps };
