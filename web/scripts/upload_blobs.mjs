import { put } from '@vercel/blob';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const token = process.env.BLOB_READ_WRITE_TOKEN || "vercel_blob_rw_obBnjSeRTzjFU0v6_cwf8ZaveyfsAtCWSlD487N2n8ZFRGy";

const videosToUpload = [
  {
    key: 'about-hero',
    filename: 'about.mp4',
    filePath: path.join(__dirname, '../public/This Is GOA ____ __ _ Stunning Aerial view of Candolim Beach _ 4K Cinematic Drone view _ DJI Mini 5.mp4')
  }
];

async function main() {
  console.log("Starting video uploads to Vercel Blob...");

  // Load existing blob-urls.json if available
  let results = {};
  const jsonPath = path.join(__dirname, '../public/blob-urls.json');
  if (fs.existsSync(jsonPath)) {
    try {
      results = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    } catch (e) {}
  }

  for (const item of videosToUpload) {
    if (!fs.existsSync(item.filePath)) {
      console.error(`File not found: ${item.filePath}`);
      continue;
    }

    const fileStream = fs.createReadStream(item.filePath);
    const stats = fs.statSync(item.filePath);
    console.log(`Uploading ${item.filename} (${(stats.size / (1024 * 1024)).toFixed(2)} MB)...`);

    try {
      const blob = await put(`videos/${item.filename}`, fileStream, {
        access: 'public',
        token: token,
        contentType: 'video/mp4',
        allowOverwrite: true
      });
      console.log(`✓ Uploaded ${item.filename} -> ${blob.url}`);
      results[item.key] = blob.url;
    } catch (err) {
      console.error(`Failed to upload ${item.filename}:`, err);
    }
  }

  console.log("\nUpload Results:");
  console.log(JSON.stringify(results, null, 2));

  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
}

main();
