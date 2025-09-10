const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs-extra');
const sharp = require('sharp');

const dbPath = path.join(__dirname, 'backendUploader', 'data', 'images.db');

async function fixImages() {
  const db = new sqlite3.Database(dbPath);
  
  return new Promise((resolve, reject) => {
    // Get all images stuck in processing
    db.all("SELECT * FROM images WHERE status = 'processing'", async (err, rows) => {
      if (err) {
        console.error('Error fetching images:', err);
        reject(err);
        return;
      }
      
      console.log(`Found ${rows.length} images stuck in processing`);
      
      for (const image of rows) {
        try {
          console.log(`Processing image: ${image.filename}`);
          
          // Check if temp file exists
          if (image.temp_path && await fs.pathExists(image.temp_path)) {
            // Create thumbnail
            const thumbnailPath = path.join(__dirname, 'backendUploader', 'uploads', 'thumbnails', `${image.id}.jpg`);
            await fs.ensureDir(path.dirname(thumbnailPath));
            
            await sharp(image.temp_path)
              .resize(200, 200, { fit: 'cover', position: 'center' })
              .jpeg({ quality: 85 })
              .toFile(thumbnailPath);
            
            // Update database
            const updateQuery = `
              UPDATE images 
              SET status = 'completed', 
                  thumbnail_path = ?,
                  minio_path = ?,
                  updated_at = datetime('now')
              WHERE id = ?
            `;
            
            const thumbnailRelativePath = `thumbnails/${image.id}.jpg`;
            const originalRelativePath = `originals/${image.id}.${image.format}`;
            
            db.run(updateQuery, [thumbnailRelativePath, originalRelativePath, image.id], (err) => {
              if (err) {
                console.error(`Error updating image ${image.id}:`, err);
              } else {
                console.log(`✅ Fixed image: ${image.filename}`);
              }
            });
            
            // Copy original to originals folder
            const originalPath = path.join(__dirname, 'backendUploader', 'uploads', 'originals', `${image.id}.${image.format}`);
            await fs.ensureDir(path.dirname(originalPath));
            await fs.copy(image.temp_path, originalPath);
            
            // Clean up temp file
            await fs.remove(image.temp_path);
            
          } else {
            console.log(`⚠️  Temp file not found for: ${image.filename}`);
            // Mark as failed
            db.run("UPDATE images SET status = 'failed', updated_at = datetime('now') WHERE id = ?", [image.id]);
          }
        } catch (error) {
          console.error(`Error processing image ${image.filename}:`, error);
          // Mark as failed
          db.run("UPDATE images SET status = 'failed', updated_at = datetime('now') WHERE id = ?", [image.id]);
        }
      }
      
      console.log('✅ Image processing complete!');
      db.close();
      resolve();
    });
  });
}

fixImages().catch(console.error);


